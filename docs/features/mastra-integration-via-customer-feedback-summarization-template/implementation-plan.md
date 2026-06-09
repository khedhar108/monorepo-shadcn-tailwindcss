# Implementation Plan: Customer Feedback Summarization

Phased plan to add the Mastra template to the Aria monorepo and connect it to `apps/web`.

**Status:** Phase 1–3 in progress (agent running, web wired)

## Prerequisites

- [x] Node.js `>=22.13.0` (`nvm use` reads `.nvmrc`)
- [x] pnpm `9.15+`
- [x] At least one provider API key (OpenAI, Groq, NVIDIA, or Sarvam) — see [provider-strategy.md](./provider-strategy.md)

## Phase 1 — Scaffold Mastra app

- [x] Scaffold template into `apps/agent` (manual `git clone` on Windows — see note below)
- [x] Set package name to `@repo/agent` in `apps/agent/package.json`
- [x] Confirm `"type": "module"` and scripts: `dev`, `build`, `start`
- [x] Run `pnpm install` from repo root
- [x] Create `apps/agent/.env` from `.env.example`
- [x] Verify Studio: `pnpm --filter @repo/agent dev` → http://localhost:4111
- [x] Test agent `feedbackSummarizer` in Studio

> **Windows PowerShell note:** `pnpm create mastra@latest --template customer-feedback-summarization` failed because `create-mastra` ran `git clone` with a single-quoted Windows path (`'D:\...\apps\agent'`). Git treated the quotes as part of the path → `Invalid argument`. The monorepo was not the problem. Use manual clone instead:

```powershell
cd D:\MajorProjectSem4\major-aria\aria\apps
git clone https://github.com/mastra-ai/template-customer-feedback-summarization agent
cd agent
pnpm install
```

> **Why `agent` not `mastra`?** The package `mastra` is the CLI tool; naming the workspace `agent` avoids conflicts and keeps it generic for future AI services.

## Phase 2 — Monorepo wiring

- [x] Add root scripts in `package.json`:

  ```json
  "dev:agent": "turbo run dev --filter=@repo/agent",
  "dev:web+agent": "turbo run dev --filter=web --filter=@repo/agent --filter=@repo/ui"
  ```

- [x] Ensure `pnpm-workspace.yaml` includes `apps/*` (already does)
- [x] Document env location: `apps/agent/.env` only (not repo root)
- [ ] If importing `@repo/*` packages from agent, add `bundler.transpilePackages` in `src/mastra/index.ts`

## Phase 2b — Multi-provider setup

- [x] Add `apps/agent/src/mastra/config/model-providers.ts`
- [x] Wire `feedbackSummarizer` to env-based model selection
- [x] Update `apps/agent/.env.example` with NVIDIA, Groq, Sarvam keys
- [x] Document strategy in [provider-strategy.md](./provider-strategy.md)

Switch provider locally:

```env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=your-key
```

## Phase 3 — Connect `apps/web`

- [x] Install client in web app: `pnpm --filter web add @mastra/client-js`
- [x] Add `apps/web/.env.local` with `MASTRA_API_URL=http://localhost:4111`
- [x] Create server-side Mastra client: `apps/web/lib/mastra-client.ts`
- [x] Add Server Action: `apps/web/app/feedback/actions.ts`
- [x] Add UI page: `apps/web/app/feedback/page.tsx`
- [x] Keep all agent calls **server-side** (no API keys in browser)
- [ ] Verify end-to-end: `pnpm dev:web+agent` → http://localhost:3000/feedback

## Phase 4 — Production database (Supabase Postgres)

Replace template's local LibSQL with Supabase Postgres for production-ready storage.

- [ ] Install Mastra Postgres package:

  ```bash
  pnpm --filter @repo/agent add @mastra/pg pg
  pnpm --filter @repo/agent add -D @types/pg
  ```

- [ ] Update `apps/agent/src/mastra/index.ts` to use `PostgresStore` — see [mastra-supabase-database-architecture.md](../../architecture/mastra-supabase-database-architecture.md)
- [ ] Create Supabase project and connection string in `apps/agent/.env`
- [ ] Replace fixture in `get-feedback.ts` with DB/API query
- [ ] Preserve pagination interface: `limit`, `offset`, `has_more`

## Phase 5 — Production deployment

- [ ] Build: `pnpm --filter @repo/agent build`
- [ ] Deploy `apps/agent` as separate service (deploy root = `apps/agent`)
- [ ] Set production `MASTRA_API_URL` in `apps/web`
- [ ] Add auth between web and agent if exposed
- [ ] Update status to **Done**

## Verification checklist

| Check | Command / action | Status |
|-------|------------------|--------|
| Agent starts | `pnpm --filter @repo/agent dev` | Done |
| Studio loads | http://localhost:4111 | Done |
| Web starts | `pnpm --filter web dev` | Pending |
| End-to-end | http://localhost:3000/feedback | Pending |
| Provider switch | Change `LLM_PROVIDER`, restart agent | Pending |

## Key decisions (see also ADRs)

1. **Separate app** — `apps/agent`, not inside `apps/web` ([ai-platform.md](../../architecture/ai-platform.md))
2. **Package name** — `@repo/agent`, not `mastra`
3. **Node 22+** — Required by Mastra template
4. **Server-side client** — Web calls Mastra from Server Actions
5. **Multi-provider via env** — Central config + `LLM_PROVIDER` ([provider-strategy.md](./provider-strategy.md))
6. **Supabase Postgres for storage** — Phase 4 ([mastra-supabase-database-architecture.md](../../architecture/mastra-supabase-database-architecture.md))

## References

- [Commands](./commands.md)
- [Provider strategy](./provider-strategy.md)
- [Feature architecture](./architecture.md)
- [Mastra providers](https://mastra.ai/models/providers)
- [Mastra server deployment](https://mastra.ai/docs/deployment/mastra-server)
- [Mastra Postgres storage](https://mastra.ai/reference/storage/postgresql)
