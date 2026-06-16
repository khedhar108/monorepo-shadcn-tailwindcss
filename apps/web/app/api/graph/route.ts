import { NextResponse } from "next/server";
import { executeAgentTool } from "../../../lib/mastra-client";
import { ARIA_AGENT_ID } from "../../../lib/agent-constants";

export const runtime = "nodejs";

export type GraphNode = {
  id: string;
  label: string;
  nodeType: string;
  frequency: number;
  avgScore: number;
  lastSeen: string;
};

export type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  edgeType: string;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const minScore = searchParams.get("minScore");
    const since = searchParams.get("since");
    const nodeType = searchParams.get("nodeType");
    const limit = searchParams.get("limit");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    const graph = await executeAgentTool<GraphData>({
      agentId: ARIA_AGENT_ID,
      toolId: "graph-query",
      data: {
        userId,
        minScore: minScore ? parseFloat(minScore) : undefined,
        since: since || undefined,
        nodeType: nodeType || undefined,
        limit: limit ? parseInt(limit, 10) : 50,
      },
    });

    return NextResponse.json(graph);
  } catch (error) {
    console.error("Graph API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph data", nodes: [], edges: [], summary: "" },
      { status: 500 }
    );
  }
}
