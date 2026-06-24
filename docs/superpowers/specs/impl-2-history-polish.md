# Goal 2: History Sidebar Polish

**Priority:** High
**Depends on:** Nothing
**Files:** 1 (`packages/ai-ui/src/components/history/ChatHistory.tsx`)

---

## What's Already Done

- Title-only rendering (no assistant answer preview) — done in prior session.
- Relative time per item (`formatRelativeTime`) — exists, shows "2h ago", "3d ago" etc.

## What to Add

### 2a. Clean title formatting (`formatThreadTitle`)

A deterministic client-side formatter — no LLM call.

**Rules:**
1. Take the first line (split on `\n`), or first sentence (split on `. ` / `? ` / `! `).
2. Strip leading greetings: `/^(hi|hey|hello|yo|help|please)[,\s]+/i`
3. Collapse whitespace: `/\s+/ → " "`
4. Cap at 48 characters, append `"…"` if truncated.
5. Trim whitespace.

**Fallback chain** (unchanged): title → `topics[0]` → `"New conversation"`.

**Full message** stays as the `title` attribute tooltip on hover.

### 2b. Date-bucket grouping (`formatDateGroup`)

Section headers above the thread list:

| Condition | Label |
|---|---|
| Same calendar day as now | `"Today"` |
| Yesterday | `"Yesterday"` |
| Within the last 7 days | `"Previous 7 Days"` |
| Older | Full locale month+year (e.g. `"Jun 2026"`) |

Buckets are computed from the sorted `threads` array. Empty buckets are not rendered.

### 2c. Section header rendering

Each bucket gets a section header:
- Uppercase tracking-wide muted micro-label: `text-[10px] font-semibold uppercase tracking-wider`
- Color: `var(--aria-text-tertiary, #9C9C9C)`
- Hairline divider: `1px solid var(--aria-border-subtle, #F0EEED)` below the label

### 2d. Glass surface on container

Apply `aria-glass` to the history container (replacing the current opaque `bg-white/90`). Active thread item gets:
- Subtle accent left-border: `border-left: 3px solid var(--aria-accent, #0D9488)`
- `aria-glass-float` background on active state
- Slight hover scale (`hover:scale-[1.01]`)

---

## File: `packages/ai-ui/src/components/history/ChatHistory.tsx`

### Helpers to add (top of file, after `formatRelativeTime`)

```ts
function formatThreadTitle(raw: string): string {
  if (!raw) return "New conversation";
  // Take first line or first sentence
  const first = raw.split(/\n/)[0]!.split(/[.?!]\s/)[0]!.trim();
  // Strip leading greetings
  const stripped = first.replace(/^(hi|hey|hello|yo|help|please)[,\s]+/i, "");
  // Collapse whitespace
  const clean = stripped.replace(/\s+/g, " ").trim();
  if (!clean) return raw.slice(0, 48) || "New conversation";
  return clean.length > 48 ? clean.slice(0, 48) + "…" : clean;
}

function formatDateGroup(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays <= 7) return "Previous 7 Days";
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch {
    return dateStr;
  }
}

type ThreadBucket = {
  label: string;
  threads: ThreadInfo[];
};
```

### Bucket computation

After `threads` is set (inside `fetchThreads` or in the render), compute buckets:

```ts
const buckets: ThreadBucket[] = useMemo(() => {
  const map = new Map<string, ThreadInfo[]>();
  for (const t of threads) {
    const group = formatDateGroup(t.lastActive);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(t);
  }
  // Preserve insertion order (threads sorted by lastActive desc)
  return Array.from(map, ([label, threads]) => ({ label, threads }));
}, [threads]);
```

### Render change

Replace the current flat `{threads.map(...)}` inside the scrollable div with:

```tsx
{buckets.map((bucket) => (
  <div key={bucket.label}>
    {/* Section header */}
    <div className="flex items-center gap-2 px-3 pt-3 pb-1">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
      >
        {bucket.label}
      </span>
      <div
        className="h-px flex-1"
        style={{ background: "var(--aria-border-subtle, #F0EEED)" }}
      />
    </div>
    {/* Thread items */}
    <div className="space-y-1 px-2 pb-1">
      {bucket.threads.map((thread) => {
        const isActive = thread.threadId === currentThreadId;
        const title = formatThreadTitle(thread.lastQuery || thread.topics[0] || "");
        return (
          <button /* ... existing button props ... */ key={thread.threadId}>
            {/* ... existing content, using `title` instead of raw query */}
          </button>
        );
      })}
    </div>
  </div>
))}
```

### Container glass

Change the outer container's className from:
```tsx
className={`... bg-white/90 shadow-sm backdrop-blur-sm ${className}`}
```
To:
```tsx
className={`... aria-glass ${className}`}
```
Remove the inline `background`/`borderColor`/`boxShadow` style (the `.aria-glass` utility handles those).

### Active item glass treatment

On the active thread button, replace:
```tsx
background: "var(--aria-accent-muted, #F0FDFA)"
```
With:
```tsx
className: "... aria-glass-float"
style={{
  borderLeft: "3px solid var(--aria-accent, #0D9488)",
  borderRight: "none",
  borderTop: "none",
  borderBottom: "none",
  borderRadius: "0 0.75rem 0.75rem 0",
}}
```

---

## Verification

1. Open the history sidebar with multiple threads from different days.
2. **Expected:** threads grouped under "Today", "Yesterday", "Previous 7 Days", etc. with section headers.
3. Each thread shows a clean short title (not the full first message).
4. Hovering a thread shows the full message as a tooltip.
5. Active thread has glass treatment with accent left-border.
6. Container has glass translucency against the background.
