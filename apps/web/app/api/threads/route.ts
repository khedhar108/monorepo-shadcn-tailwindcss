import { NextResponse } from "next/server";
import { executeAgentTool } from "../../../lib/mastra-client";
import { ARIA_AGENT_ID } from "../../../lib/agent-constants";

export const runtime = "nodejs";

export type ThreadInfo = {
  threadId: string;
  messageCount: number;
  feedbackCount: number;
  lastActive: string;
  topics: string[];
};

export type ListThreadsResponse = {
  threads: ThreadInfo[];
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = searchParams.get("limit");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 },
      );
    }

    const result = await executeAgentTool<ListThreadsResponse>({
      agentId: ARIA_AGENT_ID,
      toolId: "list-threads",
      data: {
        userId,
        limit: limit ? parseInt(limit, 10) : 50,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Threads API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch threads", threads: [] },
      { status: 500 },
    );
  }
}
