# AI Platform Architecture

How Mastra fits into the Aria monorepo and how the Next.js frontend connects to it.

## Decision summary

**Mastra runs as a separate app (`apps/agent`), not embedded inside `apps/web`.**

## Why separate backend (not direct integration)

| Factor | Separate `apps/agent` | Direct in `apps/web` |
|--------|----------------------|----------------------|
| Scaling | Scale AI service independently | Coupled to Next.js deploy |
| Secrets | API keys stay in agent app | Mixed with frontend bundle risk |
| Studio | `mastra dev` on port 4111 | Harder to use Studio alongside Next |
| Multiple clients | Same agent for web, mobile, CLI | Tied to one frontend |
| Monorepo fit | Matches [Mastra monorepo docs](https://mastra.ai/docs/deployment/monorepo) | OK for MVPs only |

Official Mastra guidance describes two Next.js patterns: [Next.js integration guide](https://mastra.ai/blog/nextjs-integration-guide). We chose **separate backend** for a production monorepo.

## Target topology

```
Browser
  └── apps/web (Next.js :3000)
        └── Server Action / API Route
              └── @mastra/client-js
                    └── apps/agent (Mastra :4111)
                          ├── feedbackSummarizer agent
                          ├── getFeedbackTool
                          └── LibSQL storage + observational memory
```

## Communication pattern

1. **Browser** never calls Mastra directly with API keys.
2. **`apps/web`** exposes a server-side route or Server Action.
3. **`MastraClient`** targets `MASTRA_API_URL` (default `http://localhost:4111`).
4. **`apps/agent`** runs agents, tools, memory, and observability.

```typescript
// apps/web — server-side only
import { MastraClient } from "@mastra/client-js";

const client = new MastraClient({
  baseUrl: process.env.MASTRA_API_URL ?? "http://localhost:4111",
});

const agent = client.getAgent("feedbackSummarizer");
const response = await agent.generate("Summarize all customer feedback");
```

For the full connection guide (memory thread fix, model picker, AI UI package layout, and phased plan), see [Mastra Web Connection](./mastra-web-connection.md).

## Template: customer-feedback-summarization

| Resource | Value |
|----------|-------|
| Template | `customer-feedback-summarization` |
| Agent ID | `feedbackSummarizer` |
| Tool | `getFeedbackTool` (`get-feedback`) |
| Studio | http://localhost:4111 |
| Source | [GitHub template](https://github.com/mastra-ai/template-customer-feedback-summarization) |

## Workspace packages (future)

If `apps/agent` imports shared code from `packages/*`, add to Mastra bundler config if needed:

```typescript
export const mastra = new Mastra({
  bundler: {
    transpilePackages: ["@repo/database"],
  },
});
```

See [Mastra monorepo troubleshooting](https://mastra.ai/docs/deployment/monorepo#workspace-packages).

## UI integration options (later)

- **Mastra Client SDK** — server-side calls from `apps/web/lib/mastra-client.ts` (current)
- **`@repo/ai-ui`** — shared AI Elements + model picker ([Mastra Web Connection](./mastra-web-connection.md))
- **AI SDK UI** — streaming chat via `@mastra/ai-sdk` in Next.js API routes
- **CopilotKit / Assistant UI** — agentic UI components

Feature-specific UI flows are documented in [features/customer-feedback-summarization](../features/customer-feedback-summarization/README.md).

## References

- [Mastra Client SDK](https://mastra.ai/docs/server/mastra-client)
- [AI SDK UI guide](https://mastra.ai/guides/build-your-ui/ai-sdk-ui)
- [Implementation plan](../features/customer-feedback-summarization/implementation-plan.md)
