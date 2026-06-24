import { createUIMessageStreamResponse } from "ai";
import { ARIA_AGENT_ID, GLOBAL_GRAPH_USER } from "../../../lib/agent-constants";
import {
  MastraGatewayError,
  streamAgentToAiSdk,
  executeAgentTool,
} from "../../../lib/mastra-client";
import {
  normalizeChatRequest,
  runInputGuardrails,
} from "../../../lib/mastra-guardrails";
import { classifyIntentLLM } from "../../../lib/intent-judge";
import { extractTopicsDeterministically } from "../../../lib/deterministic-topics";
import {
  renderPreferenceBlock,
  type PreferenceNode,
} from "../../../lib/preference-injection";
import { renderBehaviorBlock } from "../../../lib/behavior-context";
import {
  appendHistoryEntry,
  appendMessages,
  getThreadMessages,
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

    const threadId = chatRequest.memory?.thread;
    const userId = chatRequest.requestContext?.userId ?? GLOBAL_GRAPH_USER;

    // LLM judge — classifies intent, picks tool order, gates behavior context
    const judgment = await classifyIntentLLM(chatRequest.messages);

    // Always inject preferences
    let systemContext = "";
    if (userId) {
      try {
        const prefResult = await executeAgentTool<{
          preferences: PreferenceNode[];
        }>({
          agentId: ARIA_AGENT_ID,
          toolId: "get-preferences",
          data: { userId },
          requestContext: { userId },
        });
        systemContext += renderPreferenceBlock(prefResult.preferences);
      } catch {
        // Non-critical — preferences just won't be injected this turn
      }
    }

    // Conditionally inject behavior context (only when judge says it's relevant)
    if (judgment.useBehaviorContext && userId) {
      systemContext += await renderBehaviorBlock(userId);
    }

    const stream = await streamAgentToAiSdk({
      agentId: chatRequest.agentId,
      messages: chatRequest.messages,
      memory: chatRequest.memory,
      requestContext: chatRequest.requestContext,
      activeTools: judgment.toolOrder.length > 0 ? judgment.toolOrder : undefined,
      toolChoice: judgment.intent === "smalltalk" ? "none" : "auto",
      systemContext,
      onFinish: async ({ assistantText }) => {
        if (!threadId) return;

        const lastUser = [...chatRequest.messages]
          .reverse()
          .find((m) => m.role === "user");

        const userMessageId =
          (body.lastUserMessageId as string | undefined) ??
          `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const assistantMessageId = `${threadId}:${Date.now()}`;

        const msgs: StoredMessage[] = [
          {
            id: userMessageId,
            role: "user",
            content:
              typeof lastUser?.content === "string" ? lastUser.content : "",
            createdAt: new Date().toISOString(),
          },
          {
            id: assistantMessageId,
            role: "assistant",
            content: assistantText,
            createdAt: new Date().toISOString(),
          },
        ];

        await appendHistoryEntry({
          threadId,
          userId,
          firstMessage:
            typeof lastUser?.content === "string"
              ? lastUser.content.slice(0, 120)
              : "",
          topics: [],
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          messageCount: 0,
          feedbackCount: 0,
          messages: [],
          lastQuery:
            typeof lastUser?.content === "string" ? lastUser.content : "",
          lastResult: assistantText,
        });

        await appendMessages(threadId, msgs, userId);

        // Verify persistence succeeded
        try {
          const stored = await getThreadMessages(threadId);
          const storedIds = new Set(stored.map((m) => m.id));
          if (!storedIds.has(userMessageId) || !storedIds.has(assistantMessageId)) {
            console.error(
              `[chat] verifyThreadPersisted: messages missing after save for thread ${threadId}`,
            );
          }
        } catch {
          // Non-critical verification — log only
        }

        // Deterministic topic floor — only on substantive/history turns
        if (
          judgment.intent === "substantive" ||
          judgment.intent === "history"
        ) {
          const userContent =
            typeof lastUser?.content === "string" ? lastUser.content : "";
          try {
            await extractTopicsDeterministically({
              userId,
              threadId,
              messageId: assistantMessageId,
              userMessage: userContent,
              assistantMessage: assistantText,
            });
          } catch {
            // Non-critical — graph just doesn't grow this turn
          }
        }
      },
    });

    const response = createUIMessageStreamResponse({ stream });

    response.headers.set("Cache-Control", "no-cache, no-transform");
    response.headers.set("X-Content-Type-Options", "nosniff");

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
