# Tailwind CSS & ShadCN UI — Integration Guide

> How styling is architected across this Turborepo monorepo.

---

## Architecture Overview

This monorepo uses a **two-compilation model** for Tailwind CSS v4, following the
[official Turborepo guide](https://turborepo.dev/docs/guides/tools/tailwind).

```
┌─────────────────────────────────────────────────────────────┐
│  packages/ui                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ src/styles.css          (Tailwind entry point)         │ │
│  │   ├── @import "tailwindcss"                            │ │
│  │   ├── @import "tw-animate-css"                         │ │
│  │   ├── @import "./styles/globals.css"  (design tokens)  │ │
│  │   └── @source "./**/*.{js,ts,jsx,tsx}"                 │ │
│  │                                                        │ │
│  │ Compiled via @tailwindcss/cli                          │ │
│  │   → dist/index.css  (pre-compiled, exported)           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         │
            exported as  "./styles.css"
                         │
          ┌──────────────┼──────────────┐
          ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│  apps/web        │          │  apps/docs       │
│                  │          │                  │
│  layout.tsx:     │          │  layout.tsx:     │
│   import         │          │   import         │
│    "@repo/ui/    │          │    "@repo/ui/    │
│     styles.css"  │          │     styles.css"  │
│   import         │          │   import         │
│    "./globals.   │          │    "./globals.   │
│      css"        │          │      css"        │
│                  │          │                  │
│  globals.css:    │          │  globals.css:    │
│   @import        │          │   @import        │
│    "tailwindcss" │          │    "tailwindcss" │
│   @import        │          │   (own Tailwind  │
│    "@repo/ui/    │          │    compilation)  │
│     globals.css" │          │                  │
│   @source        │          │                  │
│    "../**/*"     │          │                  │
└──────────────────┘          └──────────────────┘
```

### Why Two Compilations?

Tailwind v4's `@source` directive resolves paths **relative to the entry CSS file**.
When `apps/web/globals.css` imports `packages/ui/globals.css`, any `@source` inside
the imported file resolves relative to `apps/web/app/` — not `packages/ui/src/`.
This means component classes in `packages/ui` would never be scanned.

The solution: `packages/ui` pre-compiles its own CSS using `@tailwindcss/cli`, and
each app imports the compiled output as a static stylesheet.

---

## File Reference

### `packages/ui` — Shared UI Library

| File | Purpose |
|---|---|
| `src/styles.css` | Tailwind entry point — imports tailwindcss, animations, and design tokens. Scans all component source files. |
| `src/styles/globals.css` | Design tokens — CSS custom properties (`:root`, `.dark`), `@theme inline` mappings, and `@layer base` resets. Shared to apps via `@repo/ui/globals.css` export. |
| `src/components/*.tsx` | ShadCN UI components (Button, Card, Alert, Table, etc.) |
| `src/lib/utils.ts` | `cn()` utility — merges Tailwind classes via `clsx` + `tailwind-merge`. |
| `dist/index.css` | **Build output** — pre-compiled CSS containing all utility classes used by components. Exported as `@repo/ui/styles.css`. |
| `postcss.config.mjs` | PostCSS config with `@tailwindcss/postcss`. Shared to apps via `@repo/ui/postcss.config`. |

### `apps/web` — Web Application

| File | Purpose |
|---|---|
| `app/layout.tsx` | Imports **both** `@repo/ui/styles.css` (pre-compiled component CSS) and `./globals.css` (app's own Tailwind). |
| `app/globals.css` | App's own Tailwind compilation — `@import "tailwindcss"`, imports shared design tokens via `@import "@repo/ui/globals.css"`, scans `app/**` for utility usage. |
| `postcss.config.mjs` | PostCSS config for the app's own CSS compilation. |

### `apps/docs` — Documentation Application

Same pattern as `web`. When integrating Tailwind into `docs`, follow the same steps
outlined in the "Adding Tailwind to a New App" section below.

---

## Package Exports (`packages/ui`)

```jsonc
// packages/ui/package.json → "exports"
{
  "./styles.css": "./dist/index.css",       // Pre-compiled CSS (import in layout.tsx)
  "./globals.css": "./src/styles/globals.css", // Raw design tokens (import in globals.css)
  "./postcss.config": "./postcss.config.mjs",  // Shared PostCSS config
  "./lib/*": "./src/lib/*.ts",
  "./components/*": "./src/components/*.tsx"
}
```

---

## Scripts Reference

### Root (`package.json`)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `turbo run dev` | Start **all** apps + UI watcher |
| `dev:web` | `turbo run dev --filter=web --filter=@repo/ui` | Start only `web` + UI watcher |
| `dev:docs` | `turbo run dev --filter=docs --filter=@repo/ui` | Start only `docs` + UI watcher |
| `build` | `turbo run build` | Build everything (UI CSS first, then apps) |
| `build:web` | `turbo run build --filter=web...` | Build `web` and all its dependencies |
| `build:docs` | `turbo run build --filter=docs...` | Build `docs` and all its dependencies |
| `start:web` | `pnpm --filter web start` | Start production server for `web` |
| `start:docs` | `pnpm --filter docs start` | Start production server for `docs` |
| `lint` | `turbo run lint` | Lint all packages |
| `format` | `prettier --write ...` | Format all source files |
| `format:check` | `prettier --check ...` | Check formatting (for CI) |
| `clean` | `turbo run clean && rimraf node_modules` | Remove all build artifacts |
| `ui:add` | `pnpm dlx shadcn@latest add -c ./packages/ui` | Add a new ShadCN component |

### Deployment Pipeline

```bash
# CI/CD pipeline
pnpm install --frozen-lockfile    # Deterministic install
pnpm format:check                 # Verify formatting
pnpm lint                         # Lint all packages
pnpm check-types                  # TypeScript validation
pnpm build                        # Build everything (UI → apps)
```

---

## How to Add a New ShadCN Component

```bash
# From the monorepo root:
pnpm ui:add <component-name>

# Examples:
pnpm ui:add dialog
pnpm ui:add dropdown-menu
pnpm ui:add tooltip
```

This runs `shadcn@latest add` inside `packages/ui`, which:
1. Creates the component in `packages/ui/src/components/<name>.tsx`
2. The component is automatically available via `@repo/ui/components/<name>`
3. Its Tailwind classes are picked up by `@source` during the next build/dev cycle

### Using the Component in an App

```tsx
// apps/web/app/some-page.tsx
import { Dialog, DialogTrigger, DialogContent } from "@repo/ui/components/dialog";
```

No additional configuration needed — the pre-compiled CSS from `@repo/ui/styles.css`
already includes the classes.

---

## Adding Tailwind to a New App

If you add a new app (e.g., `apps/admin`), follow these steps:

### 1. Install Dependencies

```bash
pnpm --filter admin add tailwindcss @tailwindcss/postcss --save-dev
pnpm --filter admin add @repo/ui
```

### 2. Create `postcss.config.mjs`

```js
// apps/admin/postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### 3. Create `globals.css`

```css
/* apps/admin/app/globals.css */
@import "tailwindcss";
@import "@repo/ui/globals.css";

@source "../**/*.{js,ts,jsx,tsx}";
```

### 4. Import Styles in Layout

```tsx
// apps/admin/app/layout.tsx
import "@repo/ui/styles.css";  // Pre-compiled UI component styles
import "./globals.css";         // App's own Tailwind compilation
```

### 5. Update Root Scripts (optional)

```jsonc
// package.json
{
  "scripts": {
    "dev:admin": "turbo run dev --filter=admin --filter=@repo/ui",
    "build:admin": "turbo run build --filter=admin...",
    "start:admin": "pnpm --filter admin start"
  }
}
```

---

## Design Tokens

All design tokens are defined in `packages/ui/src/styles/globals.css` using CSS
custom properties with `oklch()` color values:

- **Light mode**: `:root { ... }`
- **Dark mode**: `.dark { ... }`

These are mapped to Tailwind theme values via `@theme inline { ... }`, making them
available as utility classes like `bg-primary`, `text-muted-foreground`, etc.

### Customizing the Theme

Edit `packages/ui/src/styles/globals.css` to change colors, radii, or add new tokens.
All apps that import `@repo/ui/globals.css` will inherit the changes.

---

## Key Dependencies

| Package | Location | Purpose |
|---|---|---|
| `tailwindcss` | `packages/ui`, `apps/web` | CSS framework |
| `@tailwindcss/cli` | `packages/ui` | CLI compiler for pre-building UI styles |
| `@tailwindcss/postcss` | `packages/ui`, `apps/web` | PostCSS plugin for app-level compilation |
| `class-variance-authority` | `packages/ui` | Component variant management (used by ShadCN) |
| `tailwind-merge` | `packages/ui` | Intelligent Tailwind class merging |
| `clsx` | `packages/ui` | Conditional class joining |
| `tw-animate-css` | `packages/ui` | Animation utilities for ShadCN |
| `radix-ui` | `packages/ui` | Accessible UI primitives (used by ShadCN) |
| `lucide-react` | `packages/ui`, all apps (via pnpm catalog) | Icon library |

---

## Troubleshooting

### Styles not appearing?

1. **Check the UI build ran first.** Run `pnpm build:ui` to ensure `dist/index.css` exists.
2. **Verify imports in `layout.tsx`.** Both `@repo/ui/styles.css` and `./globals.css` must be imported.
3. **Check `@source` in `globals.css`.** It must cover your app's source directory.

### New component classes not showing?

1. Run `pnpm build:ui` (or restart `pnpm dev`) to recompile the UI stylesheet.
2. The `@source` in `packages/ui/src/styles.css` must cover the new component file.

### Conflicting styles between apps?

Each app has its own Tailwind compilation. If an app needs custom theme overrides,
add them to that app's `globals.css` without modifying the shared tokens.
