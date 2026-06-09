# AI Agent Documentation Guide

How coding agents (Cursor, Copilot, etc.) should use this repo's documentation.

## Load order

1. **[docs/README.md](../README.md)** — Map of all documentation
2. **[docs/architecture/monorepo.md](../architecture/monorepo.md)** — Apps vs packages, naming, env files
3. **Task-specific:**
   - AI / Mastra work → [architecture/ai-platform.md](../architecture/ai-platform.md)
   - Feature work → [features/<name>/](../features/README.md)
   - UI / Tailwind → [TAILWIND_SHADCN_GUIDE.md](../../TAILWIND_SHADCN_GUIDE.md)

## Key facts (avoid guessing)

| Topic | Value |
|-------|-------|
| Package manager | pnpm only |
| Node version | >=22.13.0 |
| Main frontend | `apps/web` (port 3000) |
| Mastra app (planned) | `apps/agent` as `@repo/agent` (port 4111) |
| Shared UI | `packages/ui` (`@repo/ui`) |
| Agent ID (feedback template) | `feedbackSummarizer` |
| Tool ID | `get-feedback` / `getFeedbackTool` |
| Provider switch env | `LLM_PROVIDER=openai\|groq\|nvidia\|sarvam` in `apps/agent/.env` |
| Provider config | `apps/agent/src/mastra/config/model-providers.ts` |

## Do not

- Name workspace package `mastra` (conflicts with CLI package)
- Put Mastra `.env` at monorepo root (use `apps/agent/.env`)
- Call Mastra from browser with secrets (use server routes in `apps/web`)
- Rely on outdated Mastra APIs — check installed `node_modules/@mastra/*/dist/docs/` or [mastra.ai/docs](https://mastra.ai/docs)

## Feature context bundles

For focused tasks, read the entire feature folder:

```
docs/features/mastra-integration-via-customer-feedback-summarization-template/
├── README.md
├── implementation-plan.md
├── provider-strategy.md     # Multi-provider LLM setup
├── commands.md
└── architecture.md
```

## Decisions

Check [docs/decisions/](../decisions/README.md) before proposing architecture changes that contradict accepted ADRs.

## Skills in repo

Agent skills live in `.agents/skills/` (e.g. `mastra`, `shadcn`). Use embedded Mastra docs in `node_modules/@mastra/*/dist/docs/` when packages are installed.
