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
  MoreHorizontal,
} from "lucide-react";
import { useState, type CSSProperties, type MouseEvent } from "react";

export type GraphLayout = "force" | "radial" | "tree";

export type PhysicsConfig = {
  linkDistance: number;
  repulsion: number;
  nodeSize: number;
};

export const DEFAULT_PHYSICS: PhysicsConfig = {
  linkDistance: 160,
  repulsion: 280,
  nodeSize: 1.0,
};

export type GraphControlsProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  minScore: number;
  onMinScoreChange: (score: number) => void;
  minFrequency: number;
  onMinFrequencyChange: (frequency: number) => void;
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
  /** When true, use the narrow-sidebar toolbar (icon-only, wrap-friendly). */
  compact?: boolean;
};

/* ── Light theme tokens ───────────────────────────── */

const SURFACE = "var(--aria-surface-raised, #FFFFFF)";
const ELEVATED = "var(--aria-surface-inset, #F4F3F0)";
const BORDER_SUBTLE = "var(--aria-border-subtle, #F0EEED)";
const BORDER = "var(--aria-border, #E8E5E0)";
const TEXT_PRIMARY = "var(--aria-text-primary, #1A1A1A)";
const TEXT_SECONDARY = "var(--aria-text-secondary, #6B6B6B)";
const TEXT_MUTED = "var(--aria-text-tertiary, #9C9C9C)";
const ACCENT = "#0D9488";
const ACCENT_DIM = "#0F766E";

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
  compact = false,
}: GraphControlsProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"filter" | "physics">("filter");

  const scoreLabel =
    minScore <= 0.1 ? "All" : minScore >= 0.7 ? "High only" : `\u2265 ${Math.round(minScore * 100)}%`;

  const isDefaultPhysics =
    physicsConfig.linkDistance === DEFAULT_PHYSICS.linkDistance &&
    physicsConfig.repulsion === DEFAULT_PHYSICS.repulsion &&
    physicsConfig.nodeSize === DEFAULT_PHYSICS.nodeSize;

  const baseBtnStyle = {
    background: SURFACE,
    borderColor: BORDER,
    color: TEXT_SECONDARY,
    backdropFilter: "blur(12px)",
  } as CSSProperties;

  const baseBtnHoverStyle = {
    background: ELEVATED,
    borderColor: BORDER,
    color: TEXT_PRIMARY,
  } as CSSProperties;

  const baseInputStyle = {
    background: SURFACE,
    borderColor: BORDER,
    backdropFilter: "blur(12px)",
  };

  const iconBtnClass =
    "group flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95";

  const applyHover = (e: MouseEvent<HTMLButtonElement>, active = false) => {
    if (active) return;
    Object.assign(e.currentTarget.style, baseBtnHoverStyle);
  };
  const clearHover = (e: MouseEvent<HTMLButtonElement>, active = false) => {
    if (active) return;
    Object.assign(e.currentTarget.style, baseBtnStyle);
  };

  const moreActive = showMore || showFilters || demoMode;

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {/* Toolbar — container-aware: compact stacks search + icon cluster;
          expanded keeps a single row with labeled Settings/Demo/Fit. */}
      <div
        className={
          compact
            ? "flex w-full min-w-0 flex-col gap-1"
            : "flex w-full min-w-0 flex-wrap items-center gap-1"
        }
      >
        <div
          className={
            compact
              ? "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border px-1.5 shadow-sm"
              : "flex h-7 min-w-[140px] flex-1 items-center gap-1.5 rounded-md border px-2 shadow-sm transition-shadow hover:shadow-md"
          }
          style={{ ...baseInputStyle, color: TEXT_PRIMARY }}
        >
          <Search className="h-3 w-3 shrink-0" style={{ color: TEXT_MUTED }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={compact ? "Find…" : "Find nodes…"}
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            style={{ color: TEXT_PRIMARY }}
          />
        </div>

        <div className="flex w-full min-w-0 items-center gap-1">
          {/* Settings — expanded only; compact uses More menu */}
          {!compact && (
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap shadow-sm transition-all hover:shadow-md active:scale-95"
              style={
                showFilters
                  ? {
                      background: `${ACCENT}14`,
                      borderColor: ACCENT,
                      color: ACCENT,
                      backdropFilter: "blur(12px)",
                    }
                  : { ...baseBtnStyle }
              }
              aria-label="Settings"
            >
              <Filter className="h-3 w-3 shrink-0" />
              <span>Settings</span>
            </button>
          )}

          {!compact && onDemoModeChange && (
            <button
              type="button"
              onClick={() => onDemoModeChange(!demoMode)}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap shadow-sm transition-all hover:shadow-md active:scale-95"
              style={
                demoMode
                  ? { background: `${ACCENT}14`, borderColor: ACCENT, color: ACCENT }
                  : { ...baseBtnStyle }
              }
              title="Toggle demo graph (50+ nodes)"
            >
              <FlaskConical className="h-3 w-3 shrink-0" />
              <span>Demo</span>
            </button>
          )}

          {/* More menu — compact (and always available as overflow home) */}
          {compact && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className={iconBtnClass}
                style={
                  moreActive
                    ? { background: `${ACCENT}14`, borderColor: ACCENT, color: ACCENT }
                    : { ...baseBtnStyle }
                }
                aria-label="More controls"
                aria-expanded={showMore}
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
              {showMore && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowMore(false)}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute left-0 top-8 z-40 w-36 rounded-md border py-1 shadow-lg"
                    style={{
                      background: SURFACE,
                      borderColor: BORDER,
                      backdropFilter: "blur(20px)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowFilters(!showFilters);
                        setShowMore(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-black/5"
                      style={{ color: showFilters ? ACCENT : TEXT_PRIMARY }}
                    >
                      <Filter className="h-3 w-3" />
                      Settings
                    </button>
                    {onDemoModeChange && (
                      <button
                        type="button"
                        onClick={() => {
                          onDemoModeChange(!demoMode);
                          setShowMore(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-black/5"
                        style={{ color: demoMode ? ACCENT : TEXT_PRIMARY }}
                      >
                        <FlaskConical className="h-3 w-3" />
                        Demo {demoMode ? "· on" : ""}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {isLoading && (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-sm"
              style={{ ...baseInputStyle, color: TEXT_MUTED }}
            >
              <div
                className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
              />
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {!compact && (
              <div
                className="mx-0.5 h-4 w-px shrink-0"
                style={{ background: BORDER }}
              />
            )}
            <button
              type="button"
              onClick={onZoomOut}
              className={iconBtnClass}
              style={baseBtnStyle}
              onMouseEnter={(e) => applyHover(e)}
              onMouseLeave={(e) => clearHover(e)}
              aria-label="Zoom out"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onFitAll}
              className={
                compact
                  ? iconBtnClass
                  : "group flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95"
              }
              style={baseBtnStyle}
              onMouseEnter={(e) => applyHover(e)}
              onMouseLeave={(e) => clearHover(e)}
              aria-label="Fit to view"
            >
              <Maximize className="h-3 w-3" />
              {!compact && <span>Fit</span>}
            </button>
            <button
              type="button"
              onClick={onZoomIn}
              className={iconBtnClass}
              style={baseBtnStyle}
              onMouseEnter={(e) => applyHover(e)}
              onMouseLeave={(e) => clearHover(e)}
              aria-label="Zoom in"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div
          className={
            compact
              ? "mt-1 w-full rounded-md border shadow-sm"
              : "mt-1 w-full max-w-64 rounded-md border shadow-sm"
          }
          style={{
            background: SURFACE,
            borderColor: BORDER,
            backdropFilter: "blur(20px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div
            className="flex border-b"
            style={{ borderColor: BORDER_SUBTLE, borderStyle: "dashed" }}
          >
            <button
              type="button"
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
              type="button"
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

          {activeTab === "filter" && (
            <div className="space-y-3 p-2.5">
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
                      borderColor: BORDER,
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
            </div>
          )}

          {activeTab === "physics" && (
            <div className="space-y-3 p-2.5">
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
                  type="button"
                  onClick={() => onPhysicsChange(DEFAULT_PHYSICS)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                  style={{
                    borderColor: BORDER,
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
    </div>
  );
}
