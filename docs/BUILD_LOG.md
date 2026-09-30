# Build log

## Phase 0 — Foundation (partial)

- Scaffolded Next.js 15.5.26 / React 19 / TypeScript / Tailwind 4 with the official `create-next-app` CLI; initialized shadcn and added the global design tokens, lockfile, Node 22 pin, environment example and CI workflow.
- Added an initial Supabase schema, tenant membership helper, RLS policies, workspace bootstrap trigger, atomic usage reservation function, suggestion transition function and publish approval trigger.
- Status: scaffold and core schema are present. Email/password and Google sign-in screens, SSR/browser clients, user workspace bootstrap and core server role checks exist. Middleware for every private route and complete role-specific RLS verification remain open.
- Verification: npm registry confirmed the requested Next 15, React 19, Tailwind 4 and Recharts 2.15 lines; `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` passed after fixes. Vitest 5 and Node 22 typings were selected together; Next’s PostCSS dependency is pinned to patched 8.5.28 and `npm audit` reports no advisories. TanStack Table 8 and `diff` 5.2 were pinned to the SRS lines.
- Commit: included in the consolidated implementation commit; phase remains partial.

## Phase 1 — Import and Demo (partial)

- Added deterministic 100-product JSON fixture, demo seed endpoint, browser-side Shopify CSV mapper and basic product import view.
- Added Shopify authorization-code install/callback routes with Owner authorization, state cookie, timestamp/HMAC validation, minimal read-only scope, code exchange and AES-GCM encrypted storage.
- Status: demo fixture and basic CSV import work; authenticated durable demo-product persistence now exists. Interactive column mapping, CSV persistence and paginated Shopify GraphQL import remain open. Invalid CSV rows trigger a downloadable error report. No Shopify credentials were available for live verification.
- Implementation continuation: added authenticated persistence for the deterministic Demo Store, content-hash idempotent product upserts, image persistence, and resumable ten-product import batches backed by job leases, cursor/progress checkpoints, and per-item outcomes. A saved-product GET path feeds the workspace after import.
- Verification: batch-window and normalized demo-row mapping tests added. This environment has no Supabase CLI or Docker, so SQL/RLS behavior has not been exercised against a live Postgres instance; do not treat database integration as complete.
- Verification: fixture count and seeded rule coverage are asserted by Vitest; database behavior still needs a configured Supabase integration run.
- Commit: this continuation is committed separately; phase remains partial.

## Phase 2 — Audit Engine (partial)

- Added pure TypeScript SEO, image, content, catalog data, category-attribute, JSON-LD and collection/link-candidate checks; exact/near duplicate detection; transparent score functions; dashboard findings/history views.
- Implementation continuation: all 19 Section 5.1 rules now have explicit assertions, with controlled seed defect counts and a clean-product control. Rebuilt both seed copies to match the SRS profile; added HTML structure checks, category attributes, normalized SEO uniqueness, JSON-LD validation, orphan/inbound-link logic and impact calculation.
- Added an SSRF-safe same-domain link checker with DNS pinning, public-address validation, bounded redirects, timeout and concurrency controls. It is tested, but not yet called from a persisted server audit job.
- Status: deterministic rule coverage is implemented. DB-backed audit creation, rule-set version persistence, audit history, and live link-check integration into audit batches remain open.
- Implementation continuation: added durable job lease/cursor/checkpoint infrastructure, currently wired to Demo Store import only. Resumable audit execution and persisted audit/issues remain open and are next in sequence.
- Verification: rule tests assert every ID, seeded defect counts, seed copy equality, and zero findings on a clean product. This covers deterministic AC-02 behavior; audit job integration remains open.
- Commit: included in the consolidated implementation commit; phase remains partial.

## Continuation 1 — Database persistence and resumable jobs (partial)

- Added migration `202609300002_persisted_jobs.sql` with persisted job leases, cursor/progress counters, idempotent item outcomes, protected claim/checkpoint functions, Demo Store uniqueness, product vendor storage, and stable audit-issue fingerprints.
- Added authenticated Demo Store persistence and ten-product resumable import batches. Import updates are skipped when the normalized description content hash is unchanged.
- Verification: `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test` (15 tests), and `npm run build` pass. No local Postgres/Supabase runner is installed, so the migration and RLS functions still need execution/integration validation against Supabase.
- Remaining: persist/execute audit, AI, Shopify import and publish jobs; per-item retry route; real CSV persistence; live DB integration tests.
- Commit: committed as a separate continuation change.

## Continuation 2 — Deterministic rule coverage (partial)

- Reworked Section 5.1 rules and seed data; added dedicated deterministic rule tests and SSRF-safe link-checker unit tests.
- Fixture assertions: 16 exact-duplicate products; 7 near-duplicate pairs / 14 candidate findings; 40 missing alts; 10 filename alts; 30 weak SEO titles; 35 missing/invalid meta descriptions; 10 invalid catalog metadata; 25 missing category attributes; 12 thin descriptions; 6 broken product-link targets; 8 orphan products.
- Verification: `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test` (30 tests), and `npm run build` pass. Link checks use injected dependencies in tests; live network and database audit integration still need environment validation.
- Remaining: call the checker from audit jobs and persist audit issues/history. The rule implementations are complete; audit workflow requirements remain open and traced separately.
- Commit: committed as a separate continuation change.

## Phase 3 — AI Copilot (partial)

- Added official Gemini SDK adapter, JSON-schema constrained suggestions, Zod output validation, one validation retry, versioned prompt, workspace response cache, atomic daily/monthly quota reservation, bounded 429 retry, numeric/material/size fact-lock, HTML sanitizer and server authorization checks.
- Status: explanations, all task schemas, persistent concurrency queue and complete fact extraction remain open. Keyless state returns a clear not-configured response.
- Verification: pure fact-lock unit test; no Gemini credentials were supplied, so live generation was not tested.
- Commit: included in the consolidated implementation commit; phase remains partial.

## Phase 4 — Review and Publish (partial)

- Added tested suggestion state machine, TanStack review table with pagination, editable issue drawer, local review-session approvals, approved-value CSV export, and simulated demo apply/re-audit with a real score delta.
- Status: durable versioned edits, server role enforcement, real diff/SERP preview, approval-backed export, Shopify publishing, server-enforced endpoint approval checks, publish snapshots/revert and persistent post-publish re-audit remain open.
- Verification: state-machine unit tests cover forbidden transitions; approval gate integration is not yet connected.
- Commit: included in the consolidated implementation commit; phase remains partial.

## Phase 5 — Limits and Polish (partial)

- Added responsive dashboard styling, theme token definitions, usage display, docs and CI.
- Final polish pass connected the dashboard import and chart actions to real navigation and removed misleading fixed date-range and dead footer links.
- Status: AI generation calls the atomic daily/monthly quota function; product/audit/publish reservations and usage-meter synchronization remain open. Activity log, WCAG audit, Lighthouse, deploy and full README-only acceptance verification remain open.
- Verification after the polish pass: `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test` (10 tests) and `npm run build` pass.
- Commit: included in the consolidated implementation commit; phase remains partial.
