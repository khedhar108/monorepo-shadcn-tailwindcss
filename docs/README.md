# Aria Documentation

Central documentation for the Aria monorepo. Use this as the entry point for humans and AI agents.

## Quick links

| Area | Description |
|------|-------------|
| [Architecture](./architecture/README.md) | System-wide structure, monorepo layout, cross-cutting integrations |
| [Features](./features/README.md) | Feature-specific docs (implementation plans, commands, detailed design) |
| [Decisions](./decisions/README.md) | Architecture Decision Records (ADRs) |
| [Guides](./guides/README.md) | How-to guides and conventions |
| [Agents](./agents/README.md) | How AI agents should navigate and use this documentation |

## Repository overview

```
aria/
├── apps/
│   ├── web/                 # Next.js frontend (port 3000)
│   ├── docs/                # Next.js docs app (port 3001)
│   └── agent/               # Mastra AI service (port 4111) — planned
├── packages/
│   ├── ui/                  # Shared ShadCN components + theme
│   ├── eslint-config/
│   └── typescript-config/
├── docs/                    # ← You are here (project documentation)
├── turbo.json
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js** `>=22.13.0` (required by Mastra templates; see `.nvmrc`)
- **pnpm** `9.15+` (enforced via `only-allow`)

## Common commands

```bash
pnpm install
pnpm dev              # All apps + UI watcher
pnpm dev:web          # web + @repo/ui
pnpm dev:docs         # docs + @repo/ui
pnpm build
pnpm lint
pnpm check-types
```

## Documentation philosophy

| Layer | Location | Purpose |
|-------|----------|---------|
| **Index & overview** | `docs/README.md` (this file) | High-level map and links |
| **Cross-cutting architecture** | `docs/architecture/` | Integrations and patterns that span multiple apps (e.g. Mastra, monorepo) |
| **Feature detail** | `docs/features/<feature>/` | Commands, implementation plan, feature-specific architecture |
| **Decisions** | `docs/decisions/` | Why we chose X over Y (ADRs) |
| **Agent context** | `docs/agents/` | Structured hints for AI coding agents |

**Rule of thumb:** If it affects more than one app or is a platform choice → `docs/architecture/`. If it is a product capability → `docs/features/<name>/`.

## Related root-level docs

- [README.md](../README.md) — Monorepo quick start
- [TAILWIND_SHADCN_GUIDE.md](../TAILWIND_SHADCN_GUIDE.md) — Tailwind + ShadCN setup
