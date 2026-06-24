"use client";

import { X, TrendingUp, Hash, Calendar } from "lucide-react";

export type NodeDetailData = {
  id: string;
  label: string;
  nodeType: string;
  frequency: number;
  avgScore: number;
  lastSeen: string;
};

export type NodeDetailProps = {
  node: NodeDetailData | null;
  onClose: () => void;
  relatedNodes?: string[];
};

const NODE_TYPE_COLORS: Record<string, string> = {
  system: "#0D9488",
  topic: "#7C3AED",
  entity: "#059669",
  concept: "#2563EB",
  preference: "#D97706",
  feature: "#DB2777",
};

function getNodeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? "#6B7280";
}

export function NodeDetail({ node, onClose, relatedNodes = [] }: NodeDetailProps) {
  if (!node) return null;

  const scorePercent = Math.round(node.avgScore * 100);
  const accentColor = getNodeColor(node.nodeType);

  return (
    <div
      className="absolute right-4 bottom-4 z-10 w-72 max-w-[calc(100%-2rem)] rounded-lg border p-4"
      style={{
        background: "rgba(255, 255, 255, 0.96)",
        borderColor: `${accentColor}20`,
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        animation: "nodeDetailSlideIn 0.2s ease-out",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: `${accentColor}18`,
              color: accentColor,
              border: `1px solid ${accentColor}20`,
            }}
          >
            {node.nodeType}
          </span>
          <h3
            className="mt-1.5 text-base font-semibold"
            style={{ color: "#1A1A1A" }}
          >
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 transition-colors hover:bg-black/5"
          style={{ color: "#9C9C9C" }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className="mt-4 rounded-md p-3"
        style={{ background: `${accentColor}08` }}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: accentColor }} />
          <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
            Score: {scorePercent}%
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-center gap-2" style={{ color: "#6B6B6B" }}>
          <Hash className="h-4 w-4" />
          <span>Frequency: {node.frequency}</span>
        </div>
        <div className="flex items-center gap-2" style={{ color: "#6B6B6B" }}>
          <Calendar className="h-4 w-4" />
          <span>
            Last active: {new Date(node.lastSeen).toLocaleDateString()}
          </span>
        </div>
      </div>

      {relatedNodes.length > 0 && (
        <div className="mt-4">
          <h4
            className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "#9C9C9C" }}
          >
            Connected topics
          </h4>
          <div className="flex flex-wrap gap-1">
            {relatedNodes.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px]"
                style={{
                  background: "rgba(0,0,0,0.03)",
                  color: "#6B6B6B",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
