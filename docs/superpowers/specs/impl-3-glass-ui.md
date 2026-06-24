# Goal 3: Glassmorphism Premium UI Pass

**Priority:** Medium (visual polish on top of working functionality)
**Depends on:** Goal 1 (persistence), Goal 2 (history polish)
**Files:** 7

---

## Design Tokens (already in `globals.css`)

These are already implemented — no changes to `globals.css`:

- `--aria-glass-border: rgba(255, 255, 255, 0.6)`
- `.aria-glass` — base tier (rgba 0.82, blur 24px)
- `.aria-glass-strong` — raised tier (rgba 0.92, blur 40px)
- `.aria-glass-float` — floating tier (rgba 0.88, blur 32px) — **new in this cycle**
- `aria-msg-in` — message entrance keyframe + class — **new in this cycle**

## 3-Tier Glass Hierarchy

| Tier | Class | Use |
|------|-------|-----|
| Base | `aria-glass` | History sidebar, graph panel |
| Raised | `aria-glass-strong` | Chat card (focal point), expanded overlay |
| Float | `aria-glass-float` | Tool cards, NodeDetail, GraphControls settings, dropdowns, ChainOfThought steps |

---

## File 1: `packages/ai-ui/src/components/llm/agent-chat.tsx`

### Card surface → glass-strong

Replace the Card's inline style:
```tsx
// Before
className="... border border-neutral-200/80 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900/90"
// After
className="... aria-glass-strong border-0 shadow-none dark:bg-neutral-900/90"
```
Remove the redundant `border`/`bg-white`/`shadow-xl` — `aria-glass-strong` provides those.

### Conversation well → recessed inset

```tsx
// Before
className="min-h-0 flex-1 overflow-x-hidden rounded-xl border border-neutral-200/70 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40"
// After
className="min-h-0 flex-1 overflow-x-hidden rounded-xl border-0 bg-neutral-50/40 dark:bg-neutral-950/40"
```

### Message rows → entrance animation

Add `aria-msg-in` to each message row:
```tsx
<div key={message.id} className={cn("aria-msg-in flex w-full min-w-0 gap-2.5", ...)}>
```

### Assistant avatar → glass disc

Replace the hard emerald box:
```tsx
// Before
<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white dark:bg-emerald-600">
  <Sparkles className="size-3.5" />
</div>
// After
<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
  style={{ background: "var(--aria-accent, #0D9488)", boxShadow: "0 0 12px rgba(13,148,136,0.25)" }}>
  <Sparkles className="size-3.5" />
</div>
```

### User avatar → softer glass

Replace the rose block:
```tsx
// Before
<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-400 text-white dark:bg-rose-600">
  <User className="size-3.5" />
</div>
// After
<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
  style={{ background: "var(--aria-accent-hover, #0F766E)", boxShadow: "0 0 8px rgba(15,118,110,0.2)" }}>
  <User className="size-3.5" />
</div>
```

### Streaming "Thinking..." → glass shimmer pill

```tsx
// Before
<MessageResponse isAnimating={isStreamingThisMessage}>Thinking...</MessageResponse>
// After
<div className="aria-shimmer flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground"
  style={{ background: "var(--aria-surface-inset, #F4F3F0)" }}>
  <div className="flex gap-0.5">
    <span className="inline-block size-1 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "0ms" }} />
    <span className="inline-block size-1 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "150ms" }} />
    <span className="inline-block size-1 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "300ms" }} />
  </div>
  Thinking…
</div>
```

### ChainOfThought accordion header → glass pill

In `StepGroup`, the `<ChainOfThought>` wrapping element gets:
```tsx
<ChainOfThought defaultOpen={isStreamingThisMessage}
  className="aria-glass-float rounded-xl">
```

### Error state → glass

```tsx
// Before
className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ..."
// After
className="aria-glass-float rounded-lg border-0 px-3 py-2 text-sm text-red-700"
style={{ background: "rgba(239,68,68,0.06)", borderLeft: "3px solid rgba(239,68,68,0.3)" }}
```

### Prompt input → glass

```tsx
// Before
className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm ... dark:border-neutral-800 dark:bg-neutral-950"
// After
className="aria-glass-strong rounded-2xl border-0 shadow-none ... dark:bg-neutral-950"
```

---

## File 2: `packages/ai-ui/src/components/ai-elements/tool.tsx`

### `Tool` component → glass-float

Replace the inline style on the `Collapsible`:
```tsx
// Before
className="group/tool not-prose mb-1.5 w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-white/60 backdrop-blur-sm"
style={{ borderColor: "var(--aria-border-subtle, #F0EEED)" }}
// After
className="group/tool not-prose mb-1.5 w-full min-w-0 max-w-full overflow-hidden rounded-lg aria-glass-float"
```
Remove the redundant inline `borderColor` style — `aria-glass-float` handles it.

### ToolInput pre → subtle inset

```tsx
style={{
  borderColor: "var(--aria-glass-border)",
  background: "var(--aria-surface-inset, #F4F3F0)",
}}
```

### ToolOutput pre → same treatment

```tsx
style={{
  borderColor: isError ? "rgba(239,68,68,0.25)" : "var(--aria-glass-border)",
  background: isError ? "rgba(239,68,68,0.04)" : "var(--aria-surface-inset, #F4F3F0)",
  color: isError ? "#b91c1c" : "var(--aria-text-secondary, #6B6B6B)",
}}
```

---

## File 3: `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx`

### Segmented tab → glass-strong pill

```tsx
// Before
className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border px-1 py-1"
style={{ background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.06)", ... }}
// After
className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full px-1 py-1 aria-glass-strong"
```

### Active tab button → accent glow

Add to the active tab's inline style:
```tsx
boxShadow: "0 0 12px rgba(13,148,136,0.3)"
```

### Summary box → glass-float

```tsx
// Before
className="absolute bottom-4 left-4 max-w-xs rounded-xl px-3 py-2 text-xs leading-relaxed shadow-md"
style={{ background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.06)", ... }}
// After
className="absolute bottom-4 left-4 max-w-xs rounded-xl px-3 py-2 text-xs leading-relaxed aria-glass-float"
```

### Canvas background wash strengthen

In `onRenderFramePre`, increase the teal wash opacity slightly:
```tsx
// Before
grad.addColorStop(0, "rgba(13, 148, 136, 0.025)");
grad.addColorStop(0.4, "rgba(13, 148, 136, 0.008)");
// After
grad.addColorStop(0, "rgba(13, 148, 136, 0.04)");
grad.addColorStop(0.4, "rgba(13, 148, 136, 0.015)");
```

---

## File 4: `packages/ai-ui/src/components/graph/GraphControls.tsx`

### Toolbar row → glass-float

```tsx
// Before
className="absolute left-2 top-14 z-10 flex max-w-[calc(100%-1rem)] flex-col gap-1.5"
// After
className="absolute left-2 top-14 z-10 flex max-w-[calc(100%-1rem)] flex-col gap-1.5"
```
On the inner toolbar div (the `flex items-center gap-1` row):
```tsx
className="flex items-center gap-1 aria-glass-float rounded-lg px-1.5 py-1"
```

### Settings panel → glass-float

```tsx
// Before
className="w-56 max-w-[calc(100vw-2rem)] rounded-md border shadow-sm"
style={{ background: "var(--aria-surface-raised, #FFFFFF)", borderColor: "var(--aria-border, #E8E5E0)", ... }}
// After
className="w-56 max-w-[calc(100vw-2rem)] rounded-lg aria-glass-float"
```

Remove the inline `background`/`borderColor`/`boxShadow` style — `aria-glass-float` handles them.

---

## File 5: `packages/ai-ui/src/components/graph/NodeDetail.tsx`

### Panel → glass-float

```tsx
// Before
className="absolute right-4 bottom-4 z-10 w-72 max-w-[calc(100%-2rem)] rounded-lg border p-4"
style={{ background: "rgba(255,255,255,0.96)", borderColor: ... }}
// After
className="absolute right-4 bottom-4 z-10 w-72 max-w-[calc(100%-2rem)] rounded-lg p-4 aria-glass-float"
```

Remove the inline `background`/`borderColor`/`boxShadow`/`animation` — `aria-glass-float` handles them. Keep the `backdropFilter` removal since the utility includes it.

---

## File 6: `apps/web/app/page.tsx`

### Header → enhanced glass

Add a subtle bottom gradient line after the header's existing `backdropFilter`:
```tsx
// Add to the header's style
background: "linear-gradient(to bottom, rgba(255,255,255,0.72), rgba(255,255,255,0.85)) 50% / 100% no-repeat, rgba(255,255,255,0.7)",
```
Simplify: keep the existing header as-is but add a `::after` via a wrapper div or a bottom border:
```tsx
style={{
  borderBottom: "1px solid transparent",
  borderImage: "linear-gradient(to right, transparent, var(--aria-accent, #0D9488) 20%, var(--aria-accent, #0D9488) 80%, transparent) 1",
  background: "rgba(255, 255, 255, 0.7)",
  backdropFilter: "blur(16px) saturate(1.2)",
}}
```

### Logo glow intensify

```tsx
// Before
className="... aria-glow-accent"
// After — add a stronger inline glow
style={{
  background: "var(--aria-accent-muted, #F0FDFA)",
  border: "1px solid var(--aria-accent-soft, #CCFBF1)",
  color: "var(--aria-accent, #0D9488)",
  boxShadow: "0 0 24px rgba(13, 148, 136, 0.15), 0 0 8px rgba(13, 148, 136, 0.1)",
}}
```

### Left aside (history) → glass

```tsx
// The ChatHistory component already gets aria-glass from Goal 2
// No additional change needed on the aside wrapper
```

### Center (chat) wrapper → remove redundant surface

```tsx
// Before
style={{
  background: "var(--aria-surface-raised, #FFFFFF)",
  border: "1px solid var(--aria-border, #E8E5E0)",
  boxShadow: "var(--aria-shadow-md)",
}}
// After — remove inline surface styles, let agent-chat's aria-glass-strong handle it
className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
// Remove the style prop entirely
```

### Right aside (graph) → glass

```tsx
// Before
style={{
  background: "var(--aria-surface-raised, #FFFFFF)",
  border: "1px solid var(--aria-border, #E8E5E0)",
  boxShadow: "var(--aria-shadow-sm)",
}}
// After — apply base glass
style={{
  border: "none",
}}
className="... aria-glass ..."
```

### Expanded overlay → glass-strong

```tsx
// Before
className="... rounded-2xl"
style={{ background: "#FFFFFF", border: "1px solid var(--aria-border, #E8E5E0)", ... }}
// After
className="... rounded-2xl aria-glass-strong"
// Remove inline background/border — aria-glass-strong handles it
```

---

## Verification

1. All three panels (history, chat, graph) show glass translucency against the dot-grid background.
2. Tool cards, NodeDetail, and GraphControls settings panels appear as "floating" glass objects with higher blur.
3. The ChainOfThought accordion has a glass background with rounded corners.
4. Messages glide in on `aria-msg-in` when appearing.
5. The header has a subtle accent gradient hairline at the bottom.
6. Dark-mode classes still work (glass backgrounds degrade to opaque fallbacks).
