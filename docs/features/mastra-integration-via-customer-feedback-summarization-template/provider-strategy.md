# Multi-Provider LLM Strategy

How to add and switch between OpenAI, Groq, NVIDIA, and Sarvam AI in `apps/agent`.

## Decision summary

Use a **single config module** plus **environment variables** to switch providers. Do not hardcode model strings in multiple agent files.

| Layer | Location |
|-------|----------|
| Provider presets | `apps/agent/src/mastra/config/model-providers.ts` |
| Agent usage | `apps/agent/src/mastra/agents/feedback-summarizer.ts` |
| Secrets | `apps/agent/.env` only |

## Why this pattern

Mastra's model router uses `"provider/model-name"` strings and reads API keys from env automatically ([providers docs](https://mastra.ai/models/providers)). Industry-standard practice:

1. **Centralize** provider/model mapping in one file
2. **Switch via env** (`LLM_PROVIDER`) for dev/staging/prod
3. **Override per model** with `LLM_AGENT_MODEL` / `LLM_MEMORY_MODEL` when needed
4. **Keep secrets server-side** in `apps/agent`, never in `apps/web`

Mastra also supports **dynamic model selection** per request via `model: ({ requestContext }) => ...` ([NVIDIA provider docs](https://mastra.ai/models/providers/nvidia)).

## Static defaults vs dynamic Studio list

The current `apps/agent` setup is **partly static** and **partly dynamic**:

- **Static in this repo:** [`apps/agent/src/mastra/config/model-providers.ts`](../../../apps/agent/src/mastra/config/model-providers.ts) defines the default `agent` and `memory` model for each provider.
- **Dynamic in Mastra Studio:** Studio can show many models from the same provider because Mastra uses its broader provider registry and model router catalog, not just the four defaults in `model-providers.ts`.

That means:

- `model-providers.ts` answers: "What should this app use by default for OpenAI/Groq/NVIDIA/Sarvam?"
- Studio answers: "What models does Mastra know about for this provider right now?"

So if you see many models under one provider in Studio, that is expected and good. Your project file is **not** limiting Studio to one model per provider. It is only setting the fallback/default selection for runtime.

Mastra docs also note that Studio and editor autocomplete can use the provider registry and, in development, Mastra can auto-refresh the local model list over time.

## How multiple models from one provider appear

Example with NVIDIA:

- Your config default might be `nvidia/meta/llama-3.3-70b-instruct`
- Studio may still show many NVIDIA models such as other Llama, DeepSeek, Nemotron, or partner models

Why? Because Mastra's model router supports a provider-wide catalog. The selected provider API key unlocks access to that provider's supported models, while your local config file only chooses the default one your agent should start with.

In short:

1. `LLM_PROVIDER=nvidia` tells the app which provider is active by default
2. `PROVIDER_MODELS.nvidia.agent` gives the default project model
3. Mastra Studio can still display many NVIDIA models from the registry
4. If you choose another one in Studio, that is a Studio-side dev workflow, not a permanent change to `model-providers.ts`

## Supported providers (this feature)

| Provider | Env var | Default agent model | Default memory model | Docs |
|----------|---------|---------------------|----------------------|------|
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-5.2` | `openai/gpt-5-mini` | [openai](https://mastra.ai/models/providers/openai) |
| Groq | `GROQ_API_KEY` | `groq/llama-3.3-70b-versatile` | `groq/llama-3.1-8b-instant` | [groq](https://mastra.ai/models/providers/groq) |
| NVIDIA | `NVIDIA_API_KEY` | `nvidia/meta/llama-3.3-70b-instruct` | `nvidia/meta/llama-3.1-8b-instruct` | [nvidia](https://mastra.ai/models/providers/nvidia) |
| Sarvam AI | `SARVAM_API_KEY` | `sarvam/sarvam-105b` | `sarvam/sarvam-30b` | [sarvam](https://mastra.ai/models/providers/sarvam) |

Verify model names before production:

```bash
node .agents/skills/mastra/scripts/provider-registry.mjs --provider nvidia
node .agents/skills/mastra/scripts/provider-registry.mjs --provider groq
node .agents/skills/mastra/scripts/provider-registry.mjs --provider sarvam
```

## Environment setup

`apps/agent/.env`:

```env
LLM_PROVIDER=nvidia

NVIDIA_API_KEY=your-nvidia-key
GROQ_API_KEY=your-groq-key
SARVAM_API_KEY=your-sarvam-key
OPENAI_API_KEY=your-openai-key

# Optional overrides
# LLM_AGENT_MODEL=nvidia/deepseek-ai/deepseek-v4-flash
# LLM_MEMORY_MODEL=groq/llama-3.1-8b-instant
```

Switch provider by changing one variable:

```env
LLM_PROVIDER=groq
```

Restart the agent after changing env:

```bash
pnpm dev:agent
```

## How switching works in code

```typescript
// apps/agent/src/mastra/config/model-providers.ts
export function getActiveProvider(): LlmProvider {
  return parseProvider(process.env.LLM_PROVIDER);
}

export function getAgentModel(provider = getActiveProvider()): string {
  return process.env.LLM_AGENT_MODEL ?? PROVIDER_MODELS[provider].agent;
}
```

```typescript
// apps/agent/src/mastra/agents/feedback-summarizer.ts
model: ({ requestContext }) => resolveAgentModel(requestContext),
```

Future per-request override (optional):

```typescript
await agent.generate("Summarize feedback", {
  requestContext: { llmProvider: "groq" },
});
```

Current behavior of this repo:

- `llmProvider` override is **dynamic**
- the actual model chosen for that provider is still the default from `PROVIDER_MODELS`, unless `LLM_AGENT_MODEL` is set
- this means provider switching is dynamic, but full user-selectable model switching is not yet implemented in the web app

To make the application itself behave more like chat platforms, add:

1. a model picker UI in `apps/web`
2. a shared model catalog for allowed models
3. a `requestContext` model override such as `llmModel`

Then the user can choose from multiple models from the same provider in your app, not only in Studio.

## Free-tier / dev testing recommendation

| Use case | Suggested provider | Why |
|----------|-------------------|-----|
| Fast local iteration | Groq | Low latency, free tier friendly |
| Free NVIDIA catalog testing | NVIDIA | Many models via `NVIDIA_API_KEY` |
| India-focused LLM | Sarvam | `sarvam/sarvam-105b`, `sarvam/sarvam-30b` |
| Production quality baseline | OpenAI | Template default, strongest eval baseline |

Use **cheaper memory model** than agent model to control cost (already configured per provider).

## What not to do

- Do not put provider API keys in `apps/web/.env.local`
- Do not hardcode `model: "openai/..."` in every agent file
- Do not name workspace package `mastra` (conflicts with CLI package)
- Do not guess model slugs — verify in [Mastra providers](https://mastra.ai/models/providers)
- Do not expect `model-providers.ts` to be the full provider catalog; it should stay small and opinionated

## `bundler.transpilePackages` note

You do **not** need `bundler.transpilePackages` right now.

Only add it if `apps/agent` starts importing workspace packages like `@repo/database` or another shared internal package. For example:

```typescript
export const mastra = new Mastra({
  bundler: {
    transpilePackages: ["@repo/database"],
  },
});
```

If `apps/agent` only imports local files under its own `src/mastra/*`, leave that checklist item unchecked.

## Related

- [Implementation plan](./implementation-plan.md)
- [Commands](./commands.md)
- [AI Platform architecture](../../architecture/ai-platform.md)
