import { createUIMessageStreamResponse } from "ai";
import { ARIA_AGENT_ID } from "../../../lib/agent-constants";
import {
  MastraGatewayError,
  streamAgentToAiSdk,
} from "../../../lib/mastra-client";
import {
  normalizeChatRequest,
  runInputGuardrails,
} from "../../../lib/mastra-guardrails";
import {
  appendHistoryEntry,
  appendMessages,
  type StoredMessage,
} from "../../../lib/chat-history-store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chatRequest = normalizeChatRequest(body, ARIA_AGENT_ID);
    const inputGuardrail = await runInputGuardrails(chatRequest);

    if (!inputGuardrail.allowed) {
      return Response.json(
        { error: inputGuardrail.reason },
        { status: inputGuardrail.status },
      );
    }

    const stream = await streamAgentToAiSdk(chatRequest);
    const response = createUIMessageStreamResponse({ stream });

    response.headers.set("Cache-Control", "no-cache, no-transform");
    response.headers.set("X-Content-Type-Options", "nosniff");

    /* Fire-and-forget: persist thread to history file + save user messages */
    const threadId = chatRequest.memory?.thread;
    const userId = chatRequest.requestContext?.userId;
    if (threadId && userId) {
      const firstMsg = chatRequest.messages[0]?.content ?? "";
      void appendHistoryEntry({
        threadId,
        userId,
        firstMessage: firstMsg.slice(0, 120),
        topics: [],
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        messageCount: chatRequest.messages.length,
        feedbackCount: 0,
        messages: [],
      }).catch(() => {
        // Non-critical — silently ignore file write failures.
      });

      // Save incoming user messages to history
      const userMessages: StoredMessage[] = (chatRequest.messages ?? [])
        .filter((m) => m.role === "user" && m.content)
        .map((m) => ({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: "user" as const,
          content: typeof m.content === "string" ? m.content : "",
          createdAt: new Date().toISOString(),
        }));

      if (userMessages.length > 0) {
        void appendMessages(threadId, userMessages).catch(() => {});
      }
    }

    return response;
  } catch (error) {
    if (error instanceof MastraGatewayError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      {
        error: "Chat request failed.",
      },
      { status: 500 },
    );
  }
}
