# ADR-002: Require Node.js >=22.13.0

**Status:** Accepted  
**Date:** 2026-06-08

## Context

Root `package.json` previously required Node `>=18`. The Mastra `customer-feedback-summarization` template specifies `"node": ">=22.13.0"` in its `engines` field.

## Decision

Raise root engine requirement to **`>=22.13.0`** and add `.nvmrc` with `22.13.0`.

## Consequences

**Pros**

- Compatible with Mastra templates and tooling
- Avoids subtle runtime issues on older Node versions

**Cons**

- Developers must upgrade from Node 18/20
- CI must use Node 22+

## References

- [template package.json](https://github.com/mastra-ai/template-customer-feedback-summarization/blob/main/package.json)
- Root `.nvmrc`
