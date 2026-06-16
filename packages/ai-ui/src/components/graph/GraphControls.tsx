"use client";

import {
  Search,
  Minus,
  Plus,
  Maximize,
  Filter,
  RotateCcw,
  Settings2,
  FlaskConical,
} from "lucide-react";
import { useState } from "react";

export type GraphLayout = "force" | "radial" | "tree";

export type PhysicsConfig = {
  linkDistance: number;
  repulsion: number;
  nodeSize: number;
};

export const DEFAULT_PHYSICS: PhysicsConfig = {
  linkDistance: 120,
  repulsion: 180,
  nodeSize: 1.0,
};

export type GraphControlsProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  minScore: number;
  onMinScoreChange: (score: number) => void;
  minFrequency: number;
  onMinFrequencyChange: (frequency: number) => void;
  layout: GraphLayout;
  onLayoutChange: (layout: GraphLayout) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitAll: () => void;
  nodeTypes: string[];
  selectedNodeType: string | null;
  onNodeTypeChange: (type: string | null) => void;
  physicsConfig: PhysicsConfig;
  onPhysicsChange: (config: PhysicsConfig) => void;
  isLoading?: boolean;
  demoMode?: boolean;
  onDemoModeChange?: (enabled: boolean) => void;
};

/* ── Dark theme tokens ────────────────────────────── */

const SURFACE = "#101018";
const ELEVATED = "#16161f";
const HOVER = "#1c1c28";
const BORDER_SUBTLE = "#1e1e2a";
const BORDER = "#2a2a3a";
const TEXT_PRIMARY = "#e4e4ed";
const TEXT_SECONDARY = "#8888a0";
const TEXT_MUTED = "#5a5a70";
const ACCENT = "#7c3aed";
const ACCENT_DIM = "#5b21b6";

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label
        className="mb-1.5 flex items-center justify-between text-[11px] font-medium"
        style={{ color: TEXT_SECONDARY }}
      >
        {label}
        <span className="font-mono" style={{ color: TEXT_PRIMARY }}>
          {displayValue}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, ${ACCENT_DIM}, ${ACCENT})`,
          accentColor: ACCENT,
        }}
      />
    </div>
  );
}

export function GraphControls({
  searchQuery,
  onSearchChange,
  minScore,
  onMinScoreChange,
  minFrequency,
  onMinFrequencyChange,
  layout,
  onLayoutChange,
  onZoomIn,
  onZoomOut,
  onFitAll,
  nodeTypes,
  selectedNodeType,
  onNodeTypeChange,
  physicsConfig,
  onPhysicsChange,
  isLoading,
  demoMode = false,
  onDemoModeChange,
}: GraphControlsProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"filter" | "physics">("filter");

  const scoreLabel =
    minScore <= 0.1 ? "All" : minScore >= 0.7 ? "High only" : `\u2265 ${Math.round(minScore * 100)}%`;

  const isDefaultPhysics =
    physicsConfig.linkDistance === DEFAULT_PHYSICS.linkDistance &&
    physicsConfig.repulsion === DEFAULT_PHYSICS.repulsion &&
    physicsConfig.nodeSize === DEFAULT_PHYSICS.nodeSize;

  const baseBtnStyle = {
    background: SURFACE,
    borderColor: BORDER_SUBTLE,
    color: TEXT_SECONDARY,
    backdropFilter: "blur(16px)",
  } as React.CSSProperties;

  const baseInputStyle = {
    background: SURFACE,
    borderColor: BORDER_SUBTLE,
  };

  return (
    <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
      {/* Search bar + toggle + demo */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
          style={{ ...baseInputStyle, color: TEXT_PRIMARY }}
        >
          <Search className="h-4 w-4" style={{ color: TEXT_MUTED }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Find topic..."
            className="w-28 bg-transparent text-sm outline-none sm:w-40"
            style={{ color: TEXT_PRIMARY }}
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-colors"
          style={
            showFilters
              ? { background: `${ACCENT}20`, borderColor: ACCENT, color: ACCENT, backdropFilter: "blur(16px)" }
              : { ...baseBtnStyle }
          }
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
        </button>

        {onDemoModeChange && (
          <button
            onClick={() => onDemoModeChange(!demoMode)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-all"
            style={
              demoMode
                ? { background: `${ACCENT}20`, borderColor: ACCENT, color: ACCENT }
                : { ...baseBtnStyle }
            }
            title="Toggle demo graph (50+ nodes)"
          >
            <FlaskConical className="h-4 w-4" />
          </button>
        )}

        {isLoading && (
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg"
            style={{ ...baseInputStyle, color: TEXT_MUTED }}
          >
            <div
              className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
            />
          </div>
        )}
      </div>

      {/* Settings panel */}
      {showFilters && (
        <div
          className="w-64 rounded-lg border shadow-lg"
          style={{ background: SURFACE, borderColor: BORDER_SUBTLE, backdropFilter: "blur(20px)" }}
        >
          {/* Tab bar */}
          <div
            className="flex border-b"
            style={{ borderColor: BORDER_SUBTLE, borderStyle: "dashed" }}
          >
            <button
              onClick={() => setActiveTab("filter")}
              className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={
                activeTab === "filter"
                  ? { borderBottom: `2px solid ${ACCENT}`, color: ACCENT }
                  : { color: TEXT_SECONDARY }
              }
            >
              <Filter className="h-3 w-3" />
              Filter
            </button>
            <button
              onClick={() => setActiveTab("physics")}
              className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={
                activeTab === "physics"
                  ? { borderBottom: `2px solid ${ACCENT}`, color: ACCENT }
                  : { color: TEXT_SECONDARY }
              }
            >
              <Settings2 className="h-3 w-3" />
              Physics
              {!isDefaultPhysics && (
                <span
                  className="ml-0.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: ACCENT }}
                />
              )}
            </button>
          </div>

          {/* Filter tab */}
          {activeTab === "filter" && (
            <div className="space-y-4 p-3">
              <SliderRow
                label="Minimum score"
                value={minScore}
                min={0}
                max={1}
                step={0.1}
                displayValue={scoreLabel}
                onChange={onMinScoreChange}
              />

              <SliderRow
                label="Minimum frequency"
                value={minFrequency}
                min={1}
                max={10}
                step={1}
                displayValue={String(minFrequency)}
                onChange={onMinFrequencyChange}
              />

              {nodeTypes.length > 0 && (
                <div>
                  <label
                    className="mb-1.5 block text-[11px] font-medium"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    Node type
                  </label>
                  <select
                    value={selectedNodeType ?? ""}
                    onChange={(e) => onNodeTypeChange(e.target.value || null)}
                    className="w-full rounded-md border px-2 py-1.5 text-xs outline-none"
                    style={{
                      background: ELEVATED,
                      borderColor: BORDER_SUBTLE,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    <option value="">All types</option>
                    {nodeTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  className="mb-1.5 block text-[11px] font-medium"
                  style={{ color: TEXT_SECONDARY }}
                >
                  Layout
                </label>
                <div className="flex gap-1">
                  {(["force", "radial", "tree"] as GraphLayout[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => onLayoutChange(l)}
                      className="flex-1 rounded-md px-2 py-1.5 text-xs capitalize transition-colors"
                      style={
                        layout === l
                          ? { background: ACCENT, color: "#fff" }
                          : { background: ELEVATED, color: TEXT_SECONDARY }
                      }
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Physics tab */}
          {activeTab === "physics" && (
            <div className="space-y-4 p-3">
              <p className="text-[10px] leading-relaxed" style={{ color: TEXT_MUTED }}>
                Tune the force-simulation to prevent node overlap and control spacing.
              </p>

              <SliderRow
                label="Node size"
                value={physicsConfig.nodeSize}
                min={0.4}
                max={2.5}
                step={0.1}
                displayValue={`${physicsConfig.nodeSize.toFixed(1)}\u00d7`}
                onChange={(v) => onPhysicsChange({ ...physicsConfig, nodeSize: v })}
              />

              <SliderRow
                label="Link distance"
                value={physicsConfig.linkDistance}
                min={30}
                max={300}
                step={5}
                displayValue={`${physicsConfig.linkDistance}px`}
                onChange={(v) => onPhysicsChange({ ...physicsConfig, linkDistance: v })}
              />

              <SliderRow
                label="Repulsion"
                value={physicsConfig.repulsion}
                min={20}
                max={600}
                step={20}
                displayValue={String(physicsConfig.repulsion)}
                onChange={(v) => onPhysicsChange({ ...physicsConfig, repulsion: v })}
              />

              {!isDefaultPhysics && (
                <button
                  onClick={() => onPhysicsChange(DEFAULT_PHYSICS)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                  style={{
                    borderColor: BORDER_SUBTLE,
                    color: TEXT_MUTED,
                    background: ELEVATED,
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to defaults
                </button>
              )}

              <div
                className="rounded-md p-2 text-[10px] leading-relaxed"
                style={{ background: ELEVATED, color: TEXT_MUTED }}
              >
                <span style={{ color: TEXT_PRIMARY, fontWeight: 500 }}>Tips:</span>{" "}
                Increase <em>Link distance</em> and <em>Repulsion</em> if nodes
                overlap. Raise <em>Node size</em> to make small nodes easier to click.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          className="rounded-lg border p-2 shadow-lg transition-colors hover:scale-105 active:scale-95"
          style={baseBtnStyle}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={onFitAll}
          className="rounded-lg border px-3 py-2 text-xs font-medium shadow-lg transition-colors hover:scale-105 active:scale-95"
          style={baseBtnStyle}
        >
          <Maximize className="mr-1 inline h-3 w-3" />
          Fit
        </button>
        <button
          onClick={onZoomIn}
          className="rounded-lg border p-2 shadow-lg transition-colors hover:scale-105 active:scale-95"
          style={baseBtnStyle}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
