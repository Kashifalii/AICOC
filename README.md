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

Open `http://localhost:3000`. The public demo is available without signing in. Sign in to save products and audits to your workspace, create durable suggestions, and connect providers. Choose **Stores & import → Load Demo Store**, then **Run audit**. The synthetic catalog contains 100 products and injected examples for the rule catalog.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL Editor and run every `supabase/migrations/*.sql` file in filename order. The app requires the persisted-jobs, role-scoped RLS, and simulated-publish migrations in addition to the initial schema.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`.
4. Sign up through `/sign-in`. The database trigger creates the initial private Owner workspace.
5. Sign in, choose **Stores & import → Load Demo Store**, then run an audit. Saved products, audits, and suggestions load again on later visits.

Create a stable encryption key for Shopify tokens with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and save it as `ENCRYPTION_KEY` in `.env.local`. Keep the same value for the lifetime of connected stores and back it up securely; replacing it prevents decrypting previously stored tokens.

## Gemini (optional)

Create an API key in Google AI Studio, set `GEMINI_API_KEY`, and choose `GEMINI_MODEL` in `.env.local`. The suggestion route uses the official `@google/genai` SDK with JSON-schema output, Zod validation, a validation repair attempt, prompt versioning, workspace-scoped database response cache, usage reservations, fact checks, HTML sanitization, and bounded rate-limit retries. Generated drafts are saved to the selected workspace and can be edited and approved through the review flow.

Without `GEMINI_API_KEY`, deterministic audits still work and the UI reports that generated suggestions are unavailable.

## Shopify (optional)

The authorization-code OAuth install/callback endpoints use an Owner check, a state cookie, timestamp and HMAC verification, `read_products` and `write_products` scopes, token exchange and AES-256-GCM token storage. Set `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and a base64-encoded 32-byte `ENCRYPTION_KEY` in `.env.local`. Register `/api/stores/shopify/callback` as the redirect URL in Shopify and enable both scopes. Use **Stores & import → Connect Shopify** to authorize and import products; approved changes can be published from the review workflow. Publishing changes live Shopify product data, so review and explicitly publish only intended changes. Token decryption stays in server-only code.

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

- Deterministic audit computation runs in the application; saved product catalogs, audit snapshots/findings, and generated/manual suggestions are persisted in Supabase.
- CSV import currently maps common Shopify export headings; a guided mapping UI and downloadable row-error report remain open.
- The rule engine is a deterministic MVP implementation. External link checks require a safe same-domain HTTP checker, and several field/JSON-LD validations need deeper coverage.
- Supabase migrations must be applied in order. The configured project was found to be missing the persisted-jobs migration; saved demo/Shopify batch imports require the current migration set.
- Cross-tenant RLS behavior still needs live Postgres integration testing. Shopify publishing is not resumable and revert is not implemented.
- Provider credentials, OAuth scope grants, and live third-party calls must be validated in the deployment environment. Keep service-role, Shopify secret, Gemini key, and encryption key server-side.
