# Commands: Customer Feedback Summarization

Exact commands for scaffolding, development, and integration. Copy-paste safe.

## Environment setup

```bash
nvm use
pnpm install
```

## Scaffold Mastra template (one-time)

Preferred on Windows (PowerShell fallback):

```powershell
cd D:\MajorProjectSem4\major-aria\aria\apps
git clone https://github.com/mastra-ai/template-customer-feedback-summarization agent
cd agent
pnpm install
cd ..\..
pnpm install
```

Alternative (may fail on Windows due to quoted path in `git clone`):

```bash
cd apps
pnpm create mastra@latest --template customer-feedback-summarization
```

Ensure `apps/agent/package.json` has `"name": "@repo/agent"`.

## Provider environment (`apps/agent/.env`)

```env
LLM_PROVIDER=nvidia

NVIDIA_API_KEY=your-nvidia-key
GROQ_API_KEY=your-groq-key
SARVAM_API_KEY=your-sarvam-key
OPENAI_API_KEY=your-openai-key
```

Switch provider:

```env
LLM_PROVIDER=groq
```

Restart agent after changing provider:

```bash
pnpm dev:agent
```

Verify models in registry:

```bash
node .agents/skills/mastra/scripts/provider-registry.mjs --provider nvidia
node .agents/skills/mastra/scripts/provider-registry.mjs --provider groq
node .agents/skills/mastra/scripts/provider-registry.mjs --provider sarvam
```

## Web environment (`apps/web/.env.local`)

```env
MASTRA_API_URL=http://localhost:4111
```

## Development

```bash
# Agent + Studio (port 4111)
pnpm dev:agent

# Web only (port 3000)
pnpm dev:web

# Web + agent + UI together
pnpm dev:web+agent
```

## Phase 3 verification

1. Terminal 1: `pnpm dev:agent`
2. Terminal 2: `pnpm dev:web`
3. Open http://localhost:3000/feedback
4. Submit: `Summarize all customer feedback`

## Build

```bash
pnpm --filter @repo/agent build
pnpm --filter web build
pnpm build
```

## Commands already used in this repo

| Command | Purpose | Status |
|---------|---------|--------|
| `git clone ... agent` | Scaffold template on Windows | Done |
| `pnpm install` | Workspace install | Done |
| `pnpm dev:agent` | Start Mastra Studio | Done |
| `pnpm --filter web add @mastra/client-js` | Web client for agent | Done |
| `pnpm dev:web+agent` | Run web + agent together | Ready |

## External references

- [Mastra providers](https://mastra.ai/models/providers)
- [NVIDIA](https://mastra.ai/models/providers/nvidia) · [Groq](https://mastra.ai/models/providers/groq) · [Sarvam](https://mastra.ai/models/providers/sarvam)
- Mastra Studio: http://localhost:4111
