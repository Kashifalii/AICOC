# AI Commerce Operations Copilot

A Next.js workspace for auditing Shopify catalog content, finding high-impact issues, drafting AI-assisted fixes, and sending changes through a human review step. Deterministic audits work with the synthetic Demo Store and do not require an AI key.

## Current implementation status

This repository contains the project foundation, deterministic audit rules, a 100-product fixture, a working dashboard/demo import, basic CSV mapping, review-state domain logic, a Gemini suggestion adapter, an initial Supabase schema and RLS policies, and CI. Some SRS requirements remain partial or deferred; see [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md). In particular, Shopify GraphQL import/push, durable resumable jobs, durable tenant-scoped product persistence, complete private-route authorization, and production approval-to-publish handling need completion before this should be treated as a deployable SaaS.

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

The authorization-code OAuth install/callback endpoints are implemented with an Owner check, single-use state cookie, timestamp and HMAC verification, minimal read-only product scope, token exchange and AES-256-GCM encrypted token storage. A Shopify app still needs a registered callback URL matching `/api/stores/shopify/callback`; a connection form is not yet in the UI. Paginated GraphQL import, product-update webhooks, write-scope re-consent and approved-change publishing remain open. The token-encryption helper is server-only.

## Deploy

The app is scaffolded for Vercel and CI runs on GitHub Actions. Before deployment:

1. Push the repository to GitHub and import it in Vercel.
2. Set the environment variables from `.env.example` for the relevant deployment environment.
3. Apply the Supabase migration and verify auth/RLS before using real tenant data.
4. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` locally and in CI.

Vercel Hobby and Supabase free projects have execution, storage and idle-pause constraints. The serverless-safe job runner and database-backed demo flow remain open items.

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

- Demo approval state and audit snapshots are browser-session state, not persisted server-side.
- CSV import currently maps common Shopify export headings; a guided mapping UI and downloadable row-error report remain open.
- The rule engine is a deterministic MVP implementation. External link checks require a safe same-domain HTTP checker, and several field/JSON-LD validations need deeper coverage.
- AI output does not yet have a persistent response cache, queue/backoff, daily quota transaction or complete sanitizer/fact-lock coverage.
- Supabase email/password and Google sign-in screens plus workspace bootstrap are implemented. Middleware for every private route, workspace-scoped demo persistence, server role enforcement across all routes, Shopify GraphQL import/push/revert and resumable job endpoints remain open.
- No external credentials were available, so external provider behavior was not tested.
