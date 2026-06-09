# Customer Feedback Summarization

AI agent that retrieves customer feedback, categorizes by sentiment and source, and produces actionable executive summaries with observational memory across sessions.

**Status:** In progress — Phase 1–3 wired, Phase 4 pending

## Links

| Doc | Purpose |
|-----|---------|
| [Implementation plan](./implementation-plan.md) | Phased checklist to integrate the template |
| [Provider strategy](./provider-strategy.md) | Multi-provider setup (OpenAI, Groq, NVIDIA, Sarvam) |
| [Commands](./commands.md) | Exact CLI commands |
| [Architecture](./architecture.md) | Feature-specific data flow and web integration |
| [AI Platform (Mastra)](../../architecture/ai-platform.md) | Why Mastra lives in `apps/agent` |

## Template source

- [Mastra template page](https://mastra.ai/templates/customer-feedback-summarization)
- [GitHub repo](https://github.com/mastra-ai/template-customer-feedback-summarization)

## What the template includes

| Component | Name | Notes |
|-----------|------|-------|
| Agent | `feedbackSummarizer` | GPT-based analyst with structured summary format |
| Tool | `getFeedbackTool` | Paginated feedback fetch with filters |
| Memory | Observational Memory | Tracks patterns across sessions |
| Storage | LibSQL (`mastra.db`) | Local file storage |
| Scorers | `actionabilityScorer`, `completenessScorer` | Eval quality |

## Example prompts (Studio)

- "Summarize all customer feedback"
- "What are the critical issues from enterprise customers?"
- "Show me only the feature requests from pro users"
- "Compare support tickets to app reviews"
