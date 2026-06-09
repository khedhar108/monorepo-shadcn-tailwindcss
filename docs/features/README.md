# Features

Feature-specific documentation. Each feature gets its own folder with a consistent structure.

## Index

| Feature | Status | Docs |
|---------|--------|------|
| Mastra integration (customer feedback template) | In progress | [mastra-integration-via-customer-feedback-summarization-template](./mastra-integration-via-customer-feedback-summarization-template/README.md) |

## Folder template (copy for new features)

```
docs/features/<feature-slug>/
├── README.md              # Overview, status, links
├── implementation-plan.md # Phased checklist
├── commands.md            # Exact commands run / to run
└── architecture.md        # Feature-specific design (UI, routes, data)
```

## When to create a new feature folder

Create `docs/features/<slug>/` when you:

- Add a user-facing capability or agent workflow
- Need to track commands and decisions specific to that capability
- Want AI agents to load focused context without reading the whole repo

Platform-wide choices (Mastra placement, monorepo layout) stay in [architecture/](../architecture/README.md).

## Adding a feature

See [Documenting a new feature](../guides/documenting-features.md).
