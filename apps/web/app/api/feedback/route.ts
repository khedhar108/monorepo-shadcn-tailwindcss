import { NextResponse } from "next/server";
import { ARIA_AGENT_ID, GLOBAL_GRAPH_USER } from "../../../lib/agent-constants";
import { executeAgentTool } from "../../../lib/mastra-client";
import { appendHistoryEntry } from "../../../lib/chat-history-store";

export const runtime = "nodejs";

type FeedbackToolResponse = {
  score: number;
  updatedNodeIds: string[];
  preferenceLabel: string | null;
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

    const userId = typeof body.userId === "string" ? body.userId : GLOBAL_GRAPH_USER;
    const messageId =
      typeof body.messageId === "string" ? body.messageId : undefined;
    const threadId = typeof body.threadId === "string" ? body.threadId : undefined;
    const thumbs =
      body.thumbs === "up" || body.thumbs === "down" ? body.thumbs : undefined;
    const rating = typeof body.rating === "number" ? body.rating : undefined;
    const comment = typeof body.comment === "string" ? body.comment : undefined;
    const nodeIds = Array.isArray(body.nodeIds)
      ? body.nodeIds.filter((n): n is string => typeof n === "string")
      : undefined;

    if (!messageId || !threadId) {
      return NextResponse.json(
        { error: "messageId and threadId are required" },
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
        ...(nodeIds && nodeIds.length > 0 ? { nodeIds } : {}),
      },
      requestContext: {
        userId,
        threadId,
      },
    });

    // Update feedback count in history file (single writer — replaces page.tsx POST /api/history)
    try {
      await appendHistoryEntry({
        threadId,
        userId,
        firstMessage: "",
        topics: [],
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        messageCount: 0,
        feedbackCount: 1,
        messages: [],
      });
    } catch {
      // Non-critical — history count update is best-effort
    }

    return NextResponse.json({
      ...result,
      graphUpdated: true,
      nodesUpdated: result.updatedNodeIds.length,
    });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to apply feedback" },
      { status: 500 },
    );
  }
}
