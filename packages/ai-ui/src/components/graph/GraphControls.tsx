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
import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

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
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
      <label
        className="text-[11px] font-medium leading-none"
        style={{ color: TEXT_SECONDARY }}
      >
        {label}
      </label>
      <span
        className="min-w-[4.5rem] text-right font-mono text-[11px] tabular-nums leading-none"
        style={{ color: TEXT_PRIMARY }}
      >
        {displayValue}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="col-span-2 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, ${ACCENT_DIM}, ${ACCENT})`,
          accentColor: ACCENT,
        }}
      />
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
      <label
        className="text-[11px] font-medium leading-none"
        style={{ color: TEXT_SECONDARY }}
      >
        {label}
      </label>
      <div className="min-w-0">{children}</div>
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
  const [activeTab, setActiveTab] = useState<"filter" | "physics">("filter");
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    background: ELEVATED,
    borderColor: BORDER,
  };

  const iconBtnClass =
    "group flex h-8 w-8 shrink-0 items-center justify-center rounded-md border shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95";

  const applyHover = (e: MouseEvent<HTMLButtonElement>, active = false) => {
    if (active) return;
    Object.assign(e.currentTarget.style, baseBtnHoverStyle);
  };
  const clearHover = (e: MouseEvent<HTMLButtonElement>, active = false) => {
    if (active) return;
    Object.assign(e.currentTarget.style, baseBtnStyle);
  };

  const activeBtnStyle = {
    background: `${ACCENT}14`,
    borderColor: ACCENT,
    color: ACCENT,
    backdropFilter: "blur(12px)",
  } as CSSProperties;

  const Divider = () => (
    <div
      className="mx-0.5 h-5 w-px shrink-0 self-center"
      style={{ background: BORDER }}
      aria-hidden="true"
    />
  );

  const searchField = (
    <div
      className={
        compact
          ? "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 shadow-sm"
          : "flex h-8 min-w-[160px] flex-1 items-center gap-2 rounded-md border px-3 shadow-sm transition-shadow hover:shadow-md"
      }
      style={{ ...baseInputStyle, color: TEXT_PRIMARY }}
      onClick={() => searchInputRef.current?.focus()}
    >
      <Search className="h-3.5 w-3.5 shrink-0" style={{ color: TEXT_MUTED }} />
      <input
        ref={searchInputRef}
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={compact ? "Find nodes…" : "Find nodes…"}
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        style={{ color: TEXT_PRIMARY }}
        aria-label="Find nodes"
        autoComplete="off"
      />
    </div>
  );

  const settingsButton = (
    <button
      type="button"
      onClick={() => setShowFilters((v) => !v)}
      className={
        compact
          ? iconBtnClass
          : "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium whitespace-nowrap shadow-sm transition-all hover:shadow-md active:scale-95"
      }
      style={showFilters ? activeBtnStyle : { ...baseBtnStyle }}
      aria-label="Settings"
      aria-pressed={showFilters}
      title="Settings"
    >
      <Filter className="h-3.5 w-3.5 shrink-0" />
      {!compact && <span>Settings</span>}
    </button>
  );

  const demoButton =
    onDemoModeChange != null ? (
      <button
        type="button"
        onClick={() => onDemoModeChange(!demoMode)}
        className={
          compact
            ? iconBtnClass
            : "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium whitespace-nowrap shadow-sm transition-all hover:shadow-md active:scale-95"
        }
        style={demoMode ? activeBtnStyle : { ...baseBtnStyle }}
        title="Toggle demo graph (50+ nodes)"
        aria-label="Demo mode"
        aria-pressed={demoMode}
      >
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        {!compact && <span>Demo</span>}
      </button>
    ) : null;

  const zoomCluster = (
    <div className="flex shrink-0 items-center gap-1.5">
      {!compact && <Divider />}
      <button
        type="button"
        onClick={onZoomOut}
        className={iconBtnClass}
        style={baseBtnStyle}
        onMouseEnter={(e) => applyHover(e)}
        onMouseLeave={(e) => clearHover(e)}
        aria-label="Zoom out"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onFitAll}
        className={
          compact
            ? iconBtnClass
            : "group flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95"
        }
        style={baseBtnStyle}
        onMouseEnter={(e) => applyHover(e)}
        onMouseLeave={(e) => clearHover(e)}
        aria-label="Fit to view"
      >
        <Maximize className="h-3.5 w-3.5" />
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
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div
      className={`relative z-20 flex w-full min-w-0 flex-col ${
        compact ? "gap-4" : "gap-2.5"
      }`}
    >
      {compact ? (
        <>
          {/* Compact: full-width search so it is always tappable */}
          <div className="w-full min-w-0">{searchField}</div>
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              {settingsButton}
              {demoButton}
              {isLoading && (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border shadow-sm"
                  style={{ ...baseInputStyle, color: TEXT_MUTED }}
                >
                  <div
                    className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-t-transparent"
                    style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
                  />
                </div>
              )}
            </div>
            {zoomCluster}
          </div>
        </>
      ) : (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5">
          {searchField}
          <div className="flex shrink-0 items-center gap-2">
            <Divider />
            {settingsButton}
            {demoButton}
            {isLoading && (
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border shadow-sm"
                style={{ ...baseInputStyle, color: TEXT_MUTED }}
              >
                <div
                  className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
                />
              </div>
            )}
          </div>
          {zoomCluster}
        </div>
      )}

      {showFilters && (
        <div
          className="w-full overflow-hidden rounded-xl border shadow-sm"
          style={{
            background: SURFACE,
            borderColor: BORDER,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div
            className="flex border-b"
            style={{ borderColor: BORDER_SUBTLE }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("filter")}
              className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
              style={
                activeTab === "filter"
                  ? { borderBottom: `2px solid ${ACCENT}`, color: ACCENT }
                  : { color: TEXT_SECONDARY, borderBottom: "2px solid transparent" }
              }
            >
              <Filter className="h-3 w-3" />
              Filter
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("physics")}
              className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
              style={
                activeTab === "physics"
                  ? { borderBottom: `2px solid ${ACCENT}`, color: ACCENT }
                  : { color: TEXT_SECONDARY, borderBottom: "2px solid transparent" }
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
            <div className={`space-y-4 ${compact ? "p-3" : "p-4"}`}>
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
                <FieldRow label="Node type">
                  <select
                    value={selectedNodeType ?? ""}
                    onChange={(e) => onNodeTypeChange(e.target.value || null)}
                    className="h-8 w-full rounded-md border px-2.5 text-[11px] outline-none"
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
                </FieldRow>
              )}
            </div>
          )}

          {activeTab === "physics" && (
            <div className={`space-y-4 ${compact ? "p-3" : "p-4"}`}>
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
                onChange={(v) =>
                  onPhysicsChange({ ...physicsConfig, linkDistance: v })
                }
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
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-colors"
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
                className="rounded-md p-2.5 text-[10px] leading-relaxed"
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
