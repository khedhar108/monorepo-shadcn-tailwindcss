# Documenting a New Feature

Convention for keeping documentation scalable as the project grows.

## Where docs live

| Content | Location | Example |
|---------|----------|---------|
| High-level index | `docs/README.md` | Links to all sections |
| Cross-app / platform | `docs/architecture/` | Mastra, auth, deployment |
| Product feature | `docs/features/<slug>/` | Feedback summarization |
| Irreversible decisions | `docs/decisions/ADR-NNN-*.md` | "Why separate Mastra app" |
| AI agent navigation | `docs/agents/README.md` | Context loading order |

**Do not** put detailed feature architecture only in the root README. Root README stays a quick start; `docs/` holds durable design docs.

## Feature folder checklist

When adding feature `<slug>`:

1. Create `docs/features/<slug>/`
2. Add files:
   - `README.md` — overview, status, links
   - `implementation-plan.md` — phased checklist with `[ ]` tasks
   - `commands.md` — exact CLI commands
   - `architecture.md` — diagrams, data flow, file paths
3. Add row to [features/README.md](../features/README.md) index
4. If platform-wide decision: add ADR in `docs/decisions/`
5. Link from [docs/README.md](../README.md) if major feature

## Slug naming

- Lowercase, hyphen-separated: `customer-feedback-summarization`
- Match app or domain name when possible
- Avoid version numbers in folder names

## Implementation plan format

Use phases with checkboxes:

```markdown
## Phase 1 — Scaffold
- [ ] Step with command in fenced block
- [ ] Verification step

## Phase 2 — Integrate
...
```

Update status in feature `README.md`: **Planned** | **In progress** | **Done**

## Commands doc format

- Group by: setup, dev, build, deploy
- Include copy-paste blocks
- Table of "commands already used" vs "commands to run"
- Note which directory to run from (root vs `apps/`)

## When to use root-level architecture

Add or update `docs/architecture/` when:

- A new **app** is added to `apps/`
- Integration affects **multiple features** (e.g. new auth provider)
- Deployment or env var strategy changes for the whole repo

Keep feature-specific UI routes and pages in `docs/features/<slug>/architecture.md`.

## AI agent tips

- Point agents to `docs/agents/README.md` first
- Feature folders are self-contained context bundles
- Prefer linking over duplicating architecture content
