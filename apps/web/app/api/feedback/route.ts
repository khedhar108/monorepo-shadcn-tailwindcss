import { NextResponse } from "next/server";
import { ARIA_AGENT_ID } from "../../../lib/agent-constants";
import { executeAgentTool } from "../../../lib/mastra-client";

export const runtime = "nodejs";

type FeedbackToolResponse = {
  score: number;
  updatedNodeIds: string[];
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const userId = typeof body.userId === "string" ? body.userId : undefined;
    const messageId =
      typeof body.messageId === "string" ? body.messageId : undefined;
    const threadId = typeof body.threadId === "string" ? body.threadId : undefined;
    const thumbs =
      body.thumbs === "up" || body.thumbs === "down" ? body.thumbs : undefined;
    const rating = typeof body.rating === "number" ? body.rating : undefined;
    const comment = typeof body.comment === "string" ? body.comment : undefined;

    if (!userId || !messageId || !threadId) {
      return NextResponse.json(
        { error: "userId, messageId, and threadId are required" },
        { status: 400 },
      );
    }

    const result = await executeAgentTool<FeedbackToolResponse>({
      agentId: ARIA_AGENT_ID,
      toolId: "feedback-recorder",
      data: {
        userId,
        messageId,
        threadId,
        thumbs,
        rating,
        comment,
      },
      requestContext: {
        userId,
        threadId,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to apply feedback" },
      { status: 500 },
    );
  }
}
