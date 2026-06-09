# ADR-001: Mastra as Separate App

**Status:** Accepted  
**Date:** 2026-06-08

## Context

We need to integrate Mastra (customer feedback summarization template) into a Turborepo monorepo with an existing Next.js app (`apps/web`). Mastra supports both direct Next.js embedding and separate backend deployment.

## Decision

Run Mastra as **`apps/agent`** (`@repo/agent`), not inside `apps/web`.

Connect via `@mastra/client-js` from Next.js server routes/actions.

## Consequences

**Pros**

- Independent scaling and deployment of AI backend
- Mastra Studio on port 4111 without conflicting with Next dev server
- Aligns with [Mastra monorepo documentation](https://mastra.ai/docs/deployment/monorepo)
- Multiple frontends can share one agent service

**Cons**

- Two dev processes in local development
- Requires `MASTRA_API_URL` configuration in web app
- Slightly more setup than `mastra init` inside Next.js

## References

- [docs/architecture/ai-platform.md](../architecture/ai-platform.md)
- [Mastra Next.js integration guide](https://mastra.ai/blog/nextjs-integration-guide)
