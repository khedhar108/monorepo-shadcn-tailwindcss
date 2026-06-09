# Aria

A production-ready **Turborepo monorepo** using **pnpm**, **Next.js**, **Tailwind CSS v4**, and **ShadCN UI** in a shared `packages/ui` library.

> **Package manager:** This repo uses [pnpm](https://pnpm.io) only (v9.15+ for workspace catalogs). Run all commands from the repository root. npm/yarn are blocked via `only-allow`.
>
> **Node.js:** `>=22.13.0` (see `.nvmrc`). Required for Mastra integration.

## Quick start

```bash
# Clone and install
git clone <your-repo-url>
cd aria
pnpm install

# Develop all apps + UI CSS watcher
pnpm dev

# Or run a single app
pnpm dev:web    # http://localhost:3000
pnpm dev:docs   # http://localhost:3001
```

## Architecture

```
aria/
├── apps/
│   ├── web/          # Main Next.js app (port 3000)
│   └── docs/         # Docs Next.js app (port 3001)
├── packages/
│   ├── ui/           # Shared ShadCN components + global theme
│   ├── eslint-config/
│   └── typescript-config/
├── turbo.json        # Task pipeline (build, dev, lint)
└── pnpm-workspace.yaml
```

### How styling works (two-compilation model)

Tailwind CSS v4 is compiled in **two places** on purpose — this follows the [official Turborepo + Tailwind guide](https://turborepo.dev/docs/guides/tools/tailwind):

| Layer | Package | Responsibility |
|-------|---------|----------------|
| **UI components** | `packages/ui` | ShadCN components, design tokens, pre-compiled `dist/index.css` |
| **App utilities** | Each app (`web`, `docs`) | Page-level Tailwind classes, app-specific theme extensions |

```
packages/ui                          apps/web, apps/docs
────────────────                     ────────────────────
src/components/*.tsx                 app/**/*.tsx
src/styles/globals.css  ─────────► globals.css imports tokens
         │                           @import "tailwindcss"
         ▼                           @import "@repo/ui/globals.css"
dist/index.css          ─────────► layout.tsx imports both:
  exported as                          @repo/ui/styles.css  (components)
  @repo/ui/styles.css                  ./globals.css         (app utilities)
```

**Why not a single Tailwind install?** Tailwind v4 `@source` paths resolve relative to each CSS entry file. A single compilation cannot reliably scan both `packages/ui` and every app. The two-compilation model avoids missing styles and scales cleanly.

### Global theme (single source of truth)

All design tokens live in one file:

```
packages/ui/src/styles/globals.css
```

- Light/dark mode CSS variables (`:root`, `.dark`)
- ShadCN theme mappings (`@theme inline`)
- Base resets (`@layer base`)

Every app imports these tokens via `@import "@repo/ui/globals.css"` in its own `globals.css`. Change the theme once — all apps inherit it.

### ShadCN UI components

Components live **only** in `packages/ui`. Apps never run `shadcn add` locally.

```bash
# Add a component from the repo root
pnpm ui:add dialog
pnpm ui:add dropdown-menu
```

Use in any app:

```tsx
import { Button } from "@repo/ui/components/button";
import { Card, CardHeader, CardTitle } from "@repo/ui/components/card";
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Start all apps + UI CSS watcher |
| `pnpm dev:web` | Start `web` + `@repo/ui` watcher |
| `pnpm dev:docs` | Start `docs` + `@repo/ui` watcher |
| `pnpm build` | Build UI CSS, then all apps |
| `pnpm build:web` | Build `web` and dependencies |
| `pnpm build:docs` | Build `docs` and dependencies |
| `pnpm build:ui` | Build only `@repo/ui` CSS |
| `pnpm ui:add <name>` | Add a ShadCN component to `packages/ui` |
| `pnpm lint` | Lint entire monorepo |
| `pnpm check-types` | TypeScript check all packages |
| `pnpm format` | Format with Prettier |

## Adding a new app

1. Create `apps/<name>` as a Next.js app.
2. Add dependencies:

   ```bash
   pnpm --filter <name> add @repo/ui next react react-dom
   pnpm --filter <name> add -D tailwindcss @tailwindcss/postcss
   ```

3. Add `postcss.config.mjs` (same as `apps/web`).
4. Create `app/globals.css`:

   ```css
   @import "tailwindcss";
   @import "@repo/ui/globals.css";
   @source "../**/*.{js,ts,jsx,tsx}";
   ```

5. Import styles in `app/layout.tsx`:

   ```tsx
   import "@repo/ui/styles.css";
   import "./globals.css";
   ```

6. Set `transpilePackages: ["@repo/ui"]` in `next.config.js`.
7. Add root scripts: `dev:<name>`, `build:<name>`.

See [TAILWIND_SHADCN_GUIDE.md](./TAILWIND_SHADCN_GUIDE.md) for the full integration reference.

## Shared dependency versions

Workspace dependency versions are centralized in `pnpm-workspace.yaml` under `catalog:` (React, Next.js, Tailwind, TypeScript, etc.). Reference them in package.json as `"catalog:"` to keep versions aligned across apps and packages.

## CI / production build

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm check-types
pnpm build
```

Turborepo runs `@repo/ui` build before apps (`dependsOn: ["^build"]`), ensuring `dist/index.css` exists.

## Packages

| Package | Description |
|---------|-------------|
| `web` | Primary Next.js application |
| `docs` | Documentation / secondary Next.js app |
| `@repo/ui` | Shared ShadCN UI library + global theme |
| `@repo/eslint-config` | Shared ESLint configuration |
| `@repo/typescript-config` | Shared TypeScript configuration |

## Further reading

- [docs/README.md](./docs/README.md) — project documentation index (architecture, features, ADRs, AI agents)
- [TAILWIND_SHADCN_GUIDE.md](./TAILWIND_SHADCN_GUIDE.md) — detailed Tailwind + ShadCN setup
- [Turborepo docs](https://turborepo.dev/docs)
- [ShadCN UI monorepo](https://ui.shadcn.com/docs/monorepo)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
