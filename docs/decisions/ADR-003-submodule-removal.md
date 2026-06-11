# ADR-003: Remove `apps/agent` Submodule, Track as Normal Files

**Status:** Accepted  
**Date:** 2026-06-11

## Context

`apps/agent` (the Mastra AI service) was originally created by cloning the [Mastra customer-feedback-summarizer template](https://github.com/mastra-ai/customer-feedback-summarizer) as a separate git repository, then renaming it to `agent` and placing it under `apps/`.

At some point the nested `.git` directory inside `apps/agent` was deleted. Despite this, the parent Turborepo monorepo continued to treat `apps/agent` as a **git submodule**:

- `git ls-tree HEAD apps/agent` showed `160000 commit <hash>` — a submodule gitlink entry
- All files inside `apps/agent/` were **invisible** to `git status`, `git diff`, and `git add`
- Running `git check-ignore` returned: `Pathspec is in submodule 'apps/agent'`

This was a **phantom submodule** — the gitlink entry persisted in the committed tree even though no `.gitmodules` file or submodule config existed.

## Root Cause

```
Git index tree (committed):
  apps/agent  →  160000 commit 51abd4c4...   ← submodule pointer (gitlink)

On disk:
  apps/agent/.git  →  deleted (not a valid repo)
  apps/agent/src/  →  real files exist

.gitmodules        →  does not exist (never committed or deleted)
```

A submodule is recorded in git as a tree entry of type `160000 commit` (a "gitlink"). Unlike regular files and directories, git does **not** recurse into submodule paths during `git status`. Even after the submodule is deinitialized (`.git` removed), the gitlink entry in the parent commit's tree keeps the path locked as "submodule territory."

This is why:

- The files existed on disk
- No `.gitmodules` or `.git/config` referenced the submodule
- Yet `git status` completely ignored every file under `apps/agent/`

## Decision

Remove the submodule gitlink from the index and re-add `apps/agent/` as normal tracked files.

Run from the monorepo root:

```powershell
# 1. Remove the submodule gitlink from the index (files on disk are untouched)
git rm --cached apps/agent

# 2. Stage all files under apps/agent as normal content
git add apps/agent/

# 3. Commit the change
git commit -m "fix: remove apps/agent submodule, track as normal files"
```

After these commands, `apps/agent/` appears in `git status` as a regular `new file:` entry, and all its source files (including `model-providers.ts`) are visible and trackable.

### What to check before committing

Verify these files are excluded by `.gitignore` (already in `apps/agent/.gitignore` or parent `.gitignore`):

| File | Reason |
|------|--------|
| `node_modules/` | Dependencies |
| `dist/`, `.mastra/` | Build output |
| `.env`, `.env.local` | Secrets |
| `.turbo/` | Turborepo cache |
| `*.db`, `*.db-*` | Local databases |

## Consequences

**Pros**

- `git status`, `git diff`, `git blame` now work inside `apps/agent/`
- No confusing phantom submodule state for new contributors
- Simplifies CI/CD — no submodule init/update step needed
- All tooling (linters, formatters, IDE git integration) sees files correctly

**Cons**

- `apps/agent` version is now coupled to the monorepo's commit history (not independently versioned) — acceptable because it has no external contributors needing an independent repo
- Future upstream Mastra template updates require manual diff/merge instead of `git pull` in the submodule

## Terminology: Monorepo Structure

In a **Turborepo + pnpm workspaces** monorepo, the directories under `apps/` and `packages/` have specific names:

| Term | Meaning | Lives in | Examples |
|------|---------|----------|----------|
| **Monorepo** | The entire repository containing multiple apps and packages | root | `aria/` |
| **Workspace** | A pnpm grouping of packages defined in `pnpm-workspace.yaml` | config | `packages: ["apps/*", "packages/*"]` |
| **App** | A deployable application with its own dev server / entry point | `apps/*` | `web` (Next.js frontend), `docs` (Next.js docs), `agent` (Mastra AI service) |
| **Package** | A shared library consumed by apps or other packages | `packages/*` | `ui` (ShadCN components), `ai-ui` (AI UI components), `eslint-config`, `typescript-config` |

**Key distinction:** These are **apps** and **packages**, not "repos" or "projects." Even though `apps/agent` was originally cloned from an external template, in the monorepo it is a **workspace app** (`@repo/agent`), not a standalone repository.

## Instructions for Future Contributors

If `apps/agent` ever gets stuck in a submodule state again:

```powershell
# Check if it's a submodule
git ls-tree HEAD apps/agent
# Look for "160000 commit" → submodule

# Verify no .gitmodules
Test-Path .gitmodules

# Verify no submodule config
git config --file .git/config --get-regexp submodule

# If gitlink exists but submodule is broken (like this ADR):
git rm --cached apps/agent
git add apps/agent/
```

To verify submodules don't exist anywhere in the repo:

```powershell
# Find any submodule gitlinks in the entire tree
git ls-tree -r HEAD | Select-String "160000"
```

## References

- [Monorepo Architecture](../../docs/architecture/monorepo.md)
- [ADR-001: Mastra as Separate App](./ADR-001-mastra-separate-app.md)
- [Git Tools — Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [Mastra — Deploy in a Monorepo](https://mastra.ai/docs/deployment/monorepo)
