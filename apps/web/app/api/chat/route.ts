import { createUIMessageStreamResponse } from "ai";
import { FEEDBACK_AGENT_ID } from "../../../lib/agent-constants";
import {
  MastraGatewayError,
  streamAgentToAiSdk,
} from "../../../lib/mastra-client";
import {
  normalizeChatRequest,
  runInputGuardrails,
} from "../../../lib/mastra-guardrails";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chatRequest = normalizeChatRequest(body, FEEDBACK_AGENT_ID);
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
