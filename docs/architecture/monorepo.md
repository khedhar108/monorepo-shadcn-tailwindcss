# Monorepo Architecture

## Stack

- **Monorepo tool:** Turborepo
- **Package manager:** pnpm workspaces (catalog in `pnpm-workspace.yaml`)
- **Frontend:** Next.js 16 (`apps/web`, `apps/docs`)
- **UI:** ShadCN in `packages/ui` (two-compilation Tailwind v4 model)
- **AI (planned):** Mastra in `apps/agent`

## Layout

```
aria/
├── apps/           # Deployable applications
├── packages/       # Shared libraries
├── docs/           # Project documentation (not apps/docs)
└── turbo.json      # Task pipeline
```

## Conventions

### Apps vs packages

| Type | Lives in | Examples |
|------|----------|----------|
| **App** | `apps/*` | `web`, `docs`, `agent` — has its own dev server / deploy target |
| **Package** | `packages/*` | `ui`, shared types, eslint/tsconfig configs |

### Naming

- Workspace packages: `@repo/<name>` (e.g. `@repo/ui`, `@repo/agent`)
- Do **not** name a workspace package `mastra` — conflicts with the `mastra` CLI npm package

### Environment variables

- Per-app `.env` files live in the app directory (e.g. `apps/agent/.env`), not the monorepo root
- Mastra docs: [Deploy in a monorepo](https://mastra.ai/docs/deployment/monorepo)

### Building

```bash
pnpm --filter <package> run build
turbo run build --filter=web
turbo run build --filter=@repo/agent
```

### Node.js version

Root `package.json` requires **Node `>=22.13.0`** (`.nvmrc` pins `22.13.0`). Mastra templates require Node 22+.

## References

- [Turborepo](https://turborepo.dev/docs)
- [Mastra monorepo deployment](https://mastra.ai/docs/deployment/monorepo)
- [Root README](../../README.md)
