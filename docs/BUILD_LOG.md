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
- Status: demo fixture and basic CSV import work; interactive column mapping, durable product persistence and paginated GraphQL import remain open. Invalid CSV rows trigger a downloadable error report. No Shopify credentials were available for live verification.
- Verification: fixture count and seeded rule coverage are asserted by Vitest.
- Commit: included in the consolidated implementation commit; phase remains partial.

## Phase 2 — Audit Engine (partial)

- Added pure TypeScript SEO, image, content, catalog data, category-attribute, JSON-LD and collection/link-candidate checks; exact/near duplicate detection; transparent score functions; dashboard findings/history views.
- Status: the 19 Section 5.1 rule IDs are represented, but external same-domain broken-link checks and detailed category/metafield/structured-data checks need completion. Audits currently execute in the demo client rather than resumable DB-backed batches.
- Verification: core deterministic tests pass on the synthetic fixture; independent no-false-positive clean-product suite and AC-02 coverage remain open.
- Commit: included in the consolidated implementation commit; phase remains partial.

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
- Status: AI generation calls the atomic daily/monthly quota function; product/audit/publish reservations and usage-meter synchronization remain open. Activity log, WCAG audit, Lighthouse, deploy and full README-only acceptance verification remain open.
- Commit: included in the consolidated implementation commit; phase remains partial.
