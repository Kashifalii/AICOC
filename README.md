# AI Commerce Operations Copilot

A Next.js workspace for auditing Shopify catalog content, finding high-impact issues, drafting AI-assisted fixes, and sending changes through a human review step. Deterministic audits work with the synthetic Demo Store and do not require an AI key.

## Current implementation status

This repository contains the Next.js/Supabase foundation, deterministic audit rules and 100-product fixture, tenant-scoped Demo Store import, resumable demo and Shopify import batches, Gemini suggestion drafts, role-aware transitions, approval-gated export and publishing APIs, Shopify OAuth, and CI. SRS requirements still remain partial or deferred; see [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md) before treating this as a production-ready SaaS.

## Prerequisites

- Node.js 22 LTS and npm 10+
- A Supabase project for authenticated persistence (optional for viewing the local demo)
- A Google AI Studio Gemini key for actual generated suggestions (optional)
- A Shopify Partner/custom app and dev store for optional OAuth connection and later GraphQL import/publishing

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Choose **Stores & import → Load Demo Store**, then **Run audit**. Visit `/sign-in` to create a Supabase account and enable authenticated AI suggestions. The synthetic catalog contains 100 products and injected examples for the rule catalog. The dashboard computes findings locally; the demo API returns the checked-in fixture.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase/migrations/202609300001_initial_schema.sql`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
4. The fixture is checked in at `supabase/seed/demo-store.json`; automated workspace/product seed persistence is not yet connected to the app.

## Gemini (optional)

Create an API key in Google AI Studio, set `GEMINI_API_KEY`, and choose `GEMINI_MODEL` in `.env.local`. The suggestion route uses the official `@google/genai` SDK with JSON-schema output, Zod validation, one validation repair attempt, prompt versioning, workspace database response cache, atomic monthly and daily quota reservations, numeric/material/size fact checks, HTML sanitization, and bounded rate-limit retries. Per-workspace concurrency queueing and complete fact extraction remain open. Product text is synthetic in the demo.

Without `GEMINI_API_KEY`, deterministic audits still work and the AI route responds with an explicit not-configured error.

## Shopify (optional)

The authorization-code OAuth install/callback endpoints use an Owner check, a state cookie, timestamp and HMAC verification, the `write_products` scope, token exchange and AES-256-GCM token storage. Register `/api/stores/shopify/callback` in the Shopify app. Import jobs start with `POST /api/stores/{storeId}/import` and continue through `POST /api/jobs/{jobId}/run-batch`. Approved product title, description and SEO updates use Shopify Admin GraphQL `productUpdate`; use `POST /api/publish/shopify` with the store ID and approved suggestion IDs. Webhooks, publish retries/revert and a complete store connection/import UI remain open. Token decryption stays in server-only code.

## Deploy

The app is scaffolded for Vercel and CI runs on GitHub Actions. Before deployment:

1. Push the repository to GitHub and import it in Vercel.
2. Set the environment variables from `.env.example` for the relevant deployment environment.
3. Apply the Supabase migration and verify auth/RLS before using real tenant data.
4. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` locally and in CI.

Vercel Hobby and Supabase free projects have execution, storage and idle-pause constraints. Apply the migrations before trying authenticated persistence. Database migrations and integrations still need a real Supabase project for end-to-end validation.

## Scripts

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start Next.js development server |
| `npm run lint`      | ESLint                           |
| `npm run format`    | Prettier formatting check        |
| `npm run typecheck` | TypeScript strict type-check     |
| `npm run test`      | Vitest unit tests                |
| `npm run build`     | Production build                 |

## Project layout

- `src/app/` — App Router page and API handlers
- `src/features/dashboard/` — demo dashboard and interactive product views
- `src/lib/audit/` — deterministic rules, JSON-LD checks, duplicate detection and scoring
- `src/lib/ai/` — Gemini schemas, versioned prompt and fact lock
- `src/lib/review/` — suggestion lifecycle domain logic
- `supabase/migrations/` — PostgreSQL schema, RLS and database functions
- `supabase/seed/demo-store.json` — deterministic 100-product fixture
- `tests/unit/` — audit, scoring, state machine, CSV, AI guardrail and JSON-LD tests

## Known limitations

- Deterministic audit results/history are still browser-session state; database-backed audit jobs and issue persistence remain open.
- CSV import currently maps common Shopify export headings; a guided mapping UI and downloadable row-error report remain open.
- The rule engine is a deterministic MVP implementation. External link checks require a safe same-domain HTTP checker, and several field/JSON-LD validations need deeper coverage.
- AI output does not yet have a persistent response cache, queue/backoff, daily quota transaction or complete sanitizer/fact-lock coverage.
- Middleware, workspace-scoped demo persistence, role-scoped RLS declarations and route role checks are implemented. Cross-tenant RLS behavior still needs live Postgres verification. Shopify import and push are implemented behind APIs but still require a configured Shopify app; publishing is not yet resumable and revert is open.
- No external credentials were available, so external provider behavior was not tested.
