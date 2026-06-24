export type PreferenceNode = {
  id: string;
  label: string;
  avgScore: number;
  frequency: number;
};

export function renderPreferenceBlock(nodes: PreferenceNode[]): string {
  if (nodes.length === 0) return "";
  const lines = nodes.map(
    (n) => `- ${n.label} (confidence ${(n.avgScore * 100).toFixed(0)}%)`,
  );
  return `\n\n## ALWAYS APPLY — User Preferences\nThe following preferences are confirmed. Honor them in every response:\n${lines.join("\n")}\n`;
}
