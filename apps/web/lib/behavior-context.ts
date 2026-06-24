import { executeAgentTool } from "./mastra-client";
import { ARIA_AGENT_ID } from "./agent-constants";

type GraphNodeSummary = {
  id: string;
  label: string;
  nodeType: string;
  avgScore: number;
  frequency: number;
};

type GraphQueryResult = {
  nodes?: GraphNodeSummary[];
  summary?: string;
};

export async function renderBehaviorBlock(
  userId: string,
): Promise<string> {
  try {
    const result = await executeAgentTool<GraphQueryResult>({
      agentId: ARIA_AGENT_ID,
      toolId: "graph-query",
      data: { userId, limit: 30 },
      requestContext: { userId },
    });

    const nodes = result.nodes ?? [];
    if (nodes.length === 0) return "";

    const explorationNodes = nodes.filter(
      (n) => n.nodeType !== "system" && n.nodeType !== "preference",
    );

    if (explorationNodes.length === 0) return "";

    const highScore = explorationNodes.filter((n) => n.avgScore >= 0.7);
    const lowScore = explorationNodes.filter((n) => n.avgScore < 0.4);

    const recurringFocus = explorationNodes
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map((n) => n.label);

    const depthPreference =
      explorationNodes.length > 8 ? "detailed" : "balanced";

    const lines: string[] = [
      `## User Behavior Profile (relevant to this query)`,
      `- Depth preference: ${depthPreference} (inferred from ${explorationNodes.length} explored topics)`,
    ];

    if (recurringFocus.length > 0) {
      lines.push(`- Recurring focus: ${recurringFocus.join(", ")}`);
    }

    if (highScore.length > 0) {
      lines.push(
        `- Reinforce: ${highScore
          .slice(0, 3)
          .map((n) => n.label)
          .join(", ")}`,
      );
    }

    if (lowScore.length > 0) {
      lines.push(
        `- Avoid: ${lowScore
          .slice(0, 3)
          .map((n) => n.label)
          .join(", ")} (downvoted)`,
      );
    }

    return `\n\n${lines.join("\n")}\n`;
  } catch {
    return "";
  }
}
