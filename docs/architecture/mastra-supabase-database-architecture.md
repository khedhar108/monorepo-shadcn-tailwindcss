# Mastra Supabase Database Architecture

Production database strategy for the Mastra AI platform using Supabase Postgres.

## Decision Summary

**Use Supabase Postgres via `@mastra/pg` for production Mastra storage**, replacing the template's default local LibSQL.

## Why Not LibSQL In Production

The customer-feedback-summarization template uses `@mastra/libsql` with a local file (`file:./mastra.db`). This is perfect for local development and quick prototyping, but inadequate for production:

| Aspect | LibSQL (local) | Supabase Postgres |
|--------|----------------|-------------------|
| Persistence | Local filesystem | Managed, backed-up |
| Concurrency | Single node | Connection pooling |
| Scaling | Vertical only | Horizontal read replicas |
| Access | Same machine only | Network accessible |
| Team dev | Conflicts | Shared instance |

## Runtime Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    apps/web (Next.js)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Server Action / API Route                               ││
│  │  └─ @mastra/client-js                                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    apps/agent (Mastra)                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   ││
│  │  │ feedback     │  │ getFeedback  │  │ PostgresStore│   ││
│  │  │ Summarizer   │  │ Tool         │  │ @mastra/pg    │   ││
│  │  │   Agent      │  │              │  │              │   ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              │ DATABASE_URL
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Postgres (aws-[region])               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  mastra schema                                          ││
│  │  ├─ threads                                            ││
│  │  ├─ messages                                           ││
│  │  ├─ memory                                             ││
│  │  └─ traces                                             ││
│  ├─────────────────────────────────────────────────────────┤│
│  │  public schema (your product tables)                   ││
│  │  ├─ feedback                                           ││
│  │  └─ customers                                          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Supabase Connection Strategy

Mastra runs as a **long-running Node.js server** (via `mastra start`), not serverless functions. This affects connection mode choice.

| Mode | Port | Best For | Use For Mastra? |
|------|------|----------|-----------------|
| Direct connection | `5432` | Migrations, long-lived backend | ✅ Yes |
| Session pooler | `5432` | Persistent backend on IPv4-only networks | ✅ Yes |
| Transaction pooler | `6543` | Serverless/edge functions, short-lived tasks | ❌ No |

### Recommended: Direct or Session Pooler

Since Mastra is a persistent server, use direct connection or session pooler:

```env
# Direct connection (IPv6, or IPv4 with add-on)
DATABASE_URL=postgresql://postgres.[project]:[password]@db.[project].supabase.co:5432/postgres

# Session pooler (IPv4 on all tiers)
DATABASE_URL=postgresql://postgres.[project]:[password]@aws-[region].pooler.supabase.com:5432/postgres
```

### Why Not Transaction Pooler?

Transaction mode (`:6543`) is optimized for short-lived connections in serverless environments. For a long-running Mastra server:

- Adds ~2ms latency per query
- Unnecessary connection multiplexing
- Loses session features Mastra may use (prepared statements)

## Environment Variables

### apps/agent (Mastra server)

```env
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://postgres.[project]:[password]@db.[project].supabase.co:5432/postgres

# Optional
PORT=4111
NODE_OPTIONS=--max-old-space-size=4096
```

### apps/web (Next.js)

```env
# Development
MASTRA_API_URL=http://localhost:4111

# Production
MASTRA_API_URL=https://your-agent-service.example.com
```

**Critical:** Never add `DATABASE_URL` to `apps/web`. The web app only talks to Mastra via HTTP, never directly to the database.

## Mastra Storage Configuration

Replace the template's LibSQL configuration in `apps/agent/src/mastra/index.ts`:

```typescript
import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { PostgresStore } from "@mastra/pg";
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { feedbackSummarizer } from "./agents/feedback-summarizer";
import { actionabilityScorer, completenessScorer } from "./scorers/feedback-scorers";

// Production storage: Supabase Postgres
const storage = new PostgresStore({
  id: "mastra-storage",
  connectionString: process.env.DATABASE_URL!,
  schemaName: "mastra",
  ssl: true,
});

export const mastra = new Mastra({
  agents: { feedbackSummarizer },
  scorers: { actionabilityScorer, completenessScorer },
  storage,
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
```

### Schema Isolation

Using `schemaName: "mastra"` keeps Mastra's internal tables separate from your product tables in `public`. This is important because:

- Mastra tables are internal implementation details
- You may want different access patterns for product data
- Easier to distinguish in monitoring and backups

## Security Checklist

### Database Level

- [ ] Enable RLS on all product tables in `public` schema
- [ ] Keep `mastra` schema tables private (no RLS needed — not user-facing)
- [ ] Use separate Supabase project or restricted DB user for Mastra if multi-tenant
- [ ] Never expose `service_role` key in any client code

### Application Level

- [ ] `DATABASE_URL` only in `apps/agent`, never in `apps/web`
- [ ] `OPENAI_API_KEY` only in `apps/agent`
- [ ] `MASTRA_API_URL` in `apps/web` points to deployed agent URL
- [ ] Add API key or JWT auth between web and agent in production

### Connection String Security

- [ ] URL-encode special characters in password (especially `@`, `#`, `?`, `&`)
- [ ] Use Supabase pooler if direct connection exposes IPv6 issues
- [ ] Rotate credentials if stored in environment and suspected leaked

## Deployment Commands

### Build

```bash
# From repo root
pnpm --filter @repo/agent build
```

Creates `.mastra/output/` with standalone server.

### Start Production Server

```bash
# Option 1: Using Mastra CLI (recommended)
pnpm --filter @repo/agent start

# Option 2: Direct Node.js
node apps/agent/.mastra/output/index.mjs
```

The `mastra start` command:
- Loads `.env.production` then `.env`
- Handles graceful shutdown signals
- Provides better error messages for missing modules

### Platform Deployment

On most platforms (Railway, Render, Fly.io, etc.):

1. Set root directory to `apps/agent` (not monorepo root)
2. Build command: `pnpm install && pnpm mastra build`
3. Start command: `pnpm mastra start` or `node .mastra/output/index.mjs`
4. Set `DATABASE_URL` and `OPENAI_API_KEY` as secrets

See [Mastra deployment docs](https://mastra.ai/docs/deployment/mastra-server).

## Troubleshooting

### SCRAM Authentication Error

```
SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing
```

**Causes:**
1. Special characters in password not URL-encoded
2. Wrong port (using 6543 transaction pooler instead of 5432)
3. Incorrect password (account password vs database password)
4. Region-specific issue (try resetting password in Supabase dashboard)

**Fixes:**
- URL-encode password: `p%40ss` instead of `p@ss`
- Use port 5432 for session/direct connection
- Reset password in Supabase Dashboard → Database → Reset Password
- Try direct connection instead of pooler

### Connection Pool Exhaustion

If you see `sorry, too many clients already`:

- Check if multiple Mastra instances are running
- Verify no connection leaks in custom tools
- Consider Supabase connection pooler if many concurrent agents

### SSL Errors

If local development works but production fails:

```typescript
const storage = new PostgresStore({
  // ...
  ssl: {
    rejectUnauthorized: false, // Only for debugging, not production
  },
});
```

For production, ensure proper SSL certificates.

## References

- [Mastra server deployment](https://mastra.ai/docs/deployment/mastra-server)
- [Mastra monorepo deployment](https://mastra.ai/docs/deployment/monorepo)
- [Mastra Postgres storage](https://mastra.ai/reference/storage/postgresql)
- [Supabase connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
