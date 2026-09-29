# SRS Analysis

Source: `AI_Commerce_Copilot_SRS.pdf`, version 1.0 (approved implementation baseline, 30 Sep 2026). This document records the SRS before application implementation.

## Product restatement

AI Commerce Operations Copilot is a multi-tenant workspace for importing a Shopify catalog (or a reproducible demo/CSV catalog), auditing product content and metadata, explaining issues, proposing field-level changes, routing edits through a human approval gate, exporting or publishing approved changes, and showing the resulting quality-score improvement. Its core design principle is deterministic first: code computes facts, detects measurable defects, validates changes, and controls access/state; AI drafts language and judgments only where required; a human reviewer decides whether suggested changes proceed. Jobs are resumable and tenant-scoped, every stored suggestion is traceable, and nothing can be published without server-enforced approval.

## Requirements traceability checklist

Paths below follow the SRS Section 11.1 layout; tests are planned under `tests/` and feature-local `*.test.ts` files. `M` = Must; `S` = Should. Status is `planned` until implementation and verification are complete.

| ID      | Priority | Planned implementation                                                  | Verification                                                                  |
| ------- | -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AUTH-01 | M        | `src/app/(auth)/`, `lib/supabase/`, auth actions                        | `tests/integration/auth.test.ts`                                              |
| AUTH-02 | M        | `src/middleware.ts`, `src/app/(marketing)/`, `(auth)/`                  | `tests/integration/auth-routing.test.ts`                                      |
| AUTH-03 | M        | `lib/supabase/workspace.ts`, auth callback                              | `tests/integration/workspace.test.ts`                                         |
| AUTH-04 | S        | `features/settings/`, invite route, membership migration                | `tests/integration/members.test.ts`                                           |
| AUTH-05 | M        | `supabase/migrations/*` membership/RLS                                  | `tests/integration/rls.test.ts`                                               |
| AUTH-06 | M        | `lib/authz/`, route services, role-aware UI                             | `tests/unit/authorization.test.ts`, route tests                               |
| AUTH-07 | S        | demo entry, `features/stores/`, demo sandbox service                    | `tests/integration/demo-entry.test.ts`                                        |
| STO-01  | M        | `lib/shopify/oauth.ts`, `lib/security/hmac.ts`, install/callback routes | `tests/unit/shopify-oauth.test.ts`                                            |
| STO-02  | M        | `lib/security/crypto.ts`, server-only Shopify store service             | `tests/unit/token-crypto.test.ts`                                             |
| STO-03  | M        | `lib/utils/csv.ts`, `features/stores/`, CSV routes                      | `tests/unit/csv-mapper.test.ts`, route tests                                  |
| STO-04  | M        | `lib/shopify/graphql.ts`, `lib/shopify/import.ts`, resumable import job | `tests/unit/shopify-import.test.ts`                                           |
| STO-05  | M        | import service, content hash/upsert migration                           | `tests/unit/import-idempotency.test.ts`                                       |
| STO-06  | M        | `supabase/seed/demo-store.json`, demo seed route                        | `tests/unit/demo-seed.test.ts`                                                |
| STO-07  | S        | import job + stores UI progress/error report                            | `tests/integration/import-progress.test.ts`                                   |
| STO-08  | C        | Shopify webhook route + HMAC                                            | deferred (Could; no MVP acceptance dependency)                                |
| AUD-01  | M        | audit create route, `features/audit/` scope selection                   | `tests/integration/audit-scope.test.ts`                                       |
| AUD-02  | M        | `lib/audit/rules/`, audit runner/version                                | `tests/unit/rules/*.test.ts`                                                  |
| AUD-03  | M        | audit issue model/migration and runner                                  | `tests/unit/audit-issues.test.ts`                                             |
| AUD-04  | M        | `lib/audit/duplicates.ts` exact grouping                                | `tests/unit/duplicates.test.ts`                                               |
| AUD-05  | M        | `lib/audit/duplicates.ts`, AI classifier, config threshold              | `tests/unit/duplicates.test.ts`, `tests/unit/ai-validation.test.ts`           |
| AUD-06  | S        | `lib/audit/rules/lnk-001.ts`, safe link checker                         | `tests/unit/link-checker.test.ts`                                             |
| AUD-07  | M        | `lib/audit/jsonld.ts`, SCH rules                                        | `tests/unit/jsonld.test.ts`                                                   |
| AUD-08  | M        | dashboard route/data, `components/charts/`                              | `tests/integration/dashboard.test.ts`                                         |
| AUD-09  | M        | history/compare route and UI                                            | `tests/integration/audit-history.test.ts`                                     |
| AUD-10  | M        | `lib/jobs/runner.ts`, jobs table, run-batch route                       | `tests/unit/jobs.test.ts`, `tests/integration/audit-batch.test.ts`            |
| AI-01   | M        | `lib/ai/prompts/`, explanation service                                  | `tests/unit/ai-explanation.test.ts`                                           |
| AI-02   | M        | SEO prompt/schema/service                                               | `tests/unit/ai-suggestions.test.ts`                                           |
| AI-03   | M        | rewrite prompt, `lib/ai/fact-lock.ts`                                   | `tests/unit/fact-lock.test.ts`                                                |
| AI-04   | M        | brand voice schema/service + settings UI                                | `tests/unit/brand-voice.test.ts`                                              |
| AI-05   | M        | extraction prompt/schema                                                | `tests/unit/attribute-extraction.test.ts`                                     |
| AI-06   | M        | taxonomy/category prompt/schema                                         | `tests/unit/category-detection.test.ts`                                       |
| AI-07   | S        | deterministic candidate set + links task                                | `tests/unit/internal-links.test.ts`                                           |
| AI-08   | S        | alt-text prompt/schema/sanitizer                                        | `tests/unit/alt-text.test.ts`                                                 |
| AI-09   | M        | `lib/ai/client.ts`, schemas, validation, repair retry, safe fallback    | `tests/unit/ai-client.test.ts`                                                |
| AI-10   | M        | `lib/ai/cache.ts`, `ai_cache` migration                                 | `tests/unit/ai-cache.test.ts`                                                 |
| AI-11   | M        | AI queue/backoff/quota + atomic usage DB function                       | `tests/unit/ai-queue.test.ts`, `tests/integration/usage-limits.test.ts`       |
| AI-12   | M        | versioned prompt templates + suggestion metadata                        | `tests/unit/prompt-version.test.ts`                                           |
| AI-13   | S        | confidence threshold/status UI                                          | `tests/unit/confidence.test.ts`                                               |
| AI-14   | S        | delimited untrusted inputs, HTML allowlist sanitizer                    | `tests/unit/prompt-safety.test.ts`, `tests/unit/sanitizer.test.ts`            |
| REV-01  | M        | review API pagination/filter/sort, TanStack table                       | `tests/integration/suggestions-query.test.ts`                                 |
| REV-02  | M        | diff drawer and field diff component                                    | `tests/unit/suggestion-diff.test.ts`                                          |
| REV-03  | M        | versioned edit service/UI                                               | `tests/integration/suggestion-edit.test.ts`                                   |
| REV-04  | M        | single/bulk/high-confidence approval actions                            | `tests/integration/suggestion-approval.test.ts`                               |
| REV-05  | M        | SERP and product preview components                                     | `tests/unit/preview.test.ts`                                                  |
| REV-06  | M        | projected category/product/store scoring                                | `tests/unit/scoring.test.ts`                                                  |
| REV-07  | S        | regeneration instruction form/service                                   | `tests/integration/suggestion-regenerate.test.ts`                             |
| REV-08  | M        | `lib/review/state-machine.ts`, guarded mutations                        | `tests/unit/state-machine.test.ts`, `tests/integration/approval-gate.test.ts` |
| REV-09  | C        | review notes in versioned action metadata                               | deferred (Could)                                                              |
| PUB-01  | M        | Shopify-compatible export route/service                                 | `tests/unit/export-csv.test.ts`                                               |
| PUB-02  | M        | `lib/shopify/publish.ts`, GraphQL mutations                             | `tests/integration/shopify-publish.test.ts` (mocked), manual dev-store check  |
| PUB-03  | M        | simulated publish applies local snapshot                                | `tests/integration/simulated-publish.test.ts`                                 |
| PUB-04  | S        | publish item snapshots and revert service/UI                            | `tests/integration/publish-revert.test.ts`                                    |
| PUB-05  | M        | server publish service approval check                                   | `tests/integration/approval-gate.test.ts`                                     |
| PUB-06  | M        | resumable publish job / per-item retry                                  | `tests/integration/publish-batch.test.ts`                                     |
| PUB-07  | M        | publish completion starts scoped re-audit and score delta               | `tests/integration/improvement-score.test.ts`                                 |
| PUB-08  | M        | advisory-only handle UI/service policy                                  | `tests/unit/handle-policy.test.ts`                                            |
| SCO-01  | M        | `lib/audit/scoring.ts`                                                  | `tests/unit/scoring.test.ts`                                                  |
| SCO-02  | M        | dashboard breakdown + Recharts                                          | `tests/integration/dashboard.test.ts`                                         |
| SCO-03  | M        | audit score before/after persistence                                    | `tests/integration/improvement-score.test.ts`                                 |
| USG-01  | M        | `config/plans.ts`, limits and usage migrations                          | `tests/unit/usage-limits.test.ts`                                             |
| USG-02  | M        | usage route/meter/warning UI                                            | `tests/integration/usage-meter.test.ts`                                       |
| USG-03  | M        | atomic database usage reservation function                              | `tests/integration/usage-limits.test.ts`                                      |
| LOG-01  | S        | activity log migration/service + key action hooks                       | `tests/integration/activity-log.test.ts`                                      |
| UI-01   | M        | `src/styles/globals.css`, `components/ui/`                              | `tests/static/theme-tokens.test.ts`, manual theme review                      |
| UI-02   | M        | shared async/empty/error/disabled patterns across interactive UI        | `tests/e2e/critical-flows.spec.ts`, manual checklist                          |
| UI-03   | M        | `components/layout/`, app route layout                                  | `tests/e2e/navigation.spec.ts`                                                |
| UI-04   | S        | onboarding stepper                                                      | `tests/e2e/onboarding.spec.ts`                                                |
| UI-05   | S        | theme toggle, responsive layout                                         | `tests/e2e/responsive.spec.ts`, manual review                                 |
| UI-06   | M        | React Hook Form + Zod schemas                                           | `tests/unit/forms.test.ts`, component tests                                   |
| NFR-01  | M        | server/render/data-loading strategy                                     | Lighthouse/performance measurement                                            |
| NFR-02  | M        | bounded batch audit runner                                              | `tests/performance/audit-100.test.ts`                                         |
| NFR-03  | M        | AI batch queue/cache                                                    | `tests/performance/ai-batch.test.ts`                                          |
| NFR-04  | M        | paging, indexes, batch limits                                           | `tests/integration/pagination.test.ts`, 1,000-product load test               |
| NFR-05  | M        | stateless route handlers + DB jobs                                      | `tests/unit/jobs.test.ts`                                                     |
| NFR-06  | M        | idempotency keys, per-item outcomes/retry                               | `tests/integration/job-retry.test.ts`                                         |
| NFR-07  | M        | validation, headers/CSP, state checks, rate limits                      | `tests/security/security-controls.test.ts`                                    |
| NFR-08  | M        | server-only secrets, encrypted tokens                                   | `tests/security/secrets.test.ts`                                              |
| NFR-09  | M        | tenant policies, synthetic demo, store deletion                         | `tests/integration/privacy.test.ts`                                           |
| NFR-10  | M        | guided demo funnel                                                      | `tests/e2e/demo-flow.spec.ts` (timed)                                         |
| NFR-11  | M        | accessible components and navigation                                    | axe/manual WCAG checklist                                                     |
| NFR-12  | M        | strict TS, lint, feature folders, coverage                              | CI lint/typecheck/Vitest coverage                                             |
| NFR-13  | M        | env validation, setup scripts, Vercel config                            | clean-install CI + deployment checklist                                       |
| NFR-14  | M        | request IDs, AI call logs, error boundaries                             | `tests/integration/observability.test.ts`                                     |
| NFR-15  | M        | responsive/browser-compatible UI                                        | Playwright browser matrix/manual                                              |
| NFR-16  | M        | free tier usage caps, no paid dependencies                              | dependency/license review, limit tests                                        |

Could requirements are explicitly listed but not included in the requested Must/Should checklist; STO-08 and REV-09 are recorded as deferred above. SRS Section 16.2 future enhancements are out of MVP scope.

## Ambiguities, conflicts, and risky assumptions

1. **Node version:** SRS permits Node 20 or 22 and requires a committed `.nvmrc`. Decision: target Node 22 LTS, subject to compatibility verification against the selected Next.js/toolchain versions.
2. **Current date and moving package versions:** SRS pins major/minor lines but says to verify compatible versions. Decision: use npm registry and official scaffolding/CLI behavior during implementation, resolve a mutually compatible set, commit `package-lock.json`, and record exact versions. If registry access fails, use SRS version lines and document the constraint.
3. **Empty, non-Git workspace:** the supplied project directory currently has no app files and no `.git`. Decision: scaffold in place after this analysis, initialize Git for the requested conventional commits, and preserve all generated source/configuration. Git initialization is required to make phase commits possible.
4. **Feature breadth vs phases/commit requirement:** the acceptance criteria require end-to-end Shopify, AI, Supabase, demo and safety paths, while several listed items are optional external integrations. Decision: implement in Section 16.1 order, prioritize all Must requirements and the runnable local demo, and clearly trace any integration that cannot be verified without user-owned credentials or external services. No external credentials are assumed.
5. **AI unavailable:** deterministic audits must work without Gemini. Decision: the feature reports “not configured”, preserves the deterministic result, and does not synthesize AI content as though it came from a model.
6. **Supabase availability:** application auth and durable multi-tenancy rely on Supabase. Decision: database-backed capabilities require configured Supabase; provide explicit setup guidance and a working no-account Demo Store only if the architecture can honor tenant isolation and persistence without weakening security. Validate rather than silently substituting insecure local behavior.
7. **100-product seed vs 101st-product limit:** demo seed is 100 and product limit acceptance blocks product 101. Decision: default demo plan permits the 100 seeded products and rejects the next product atomically.
8. **Seed defect counts use approximations:** SRS uses “~” for several counts, and its defect dimensions can overlap. Decision: produce deterministic exact fixtures within stated approximations, assert each rule's seeded defects and clean controls, and document actual counts in seed metadata/tests.
9. **“20+ rules” summary vs Section 5.1:** the catalog enumerates 19 rules (SEO 6, IMG 2, CNT 4, DAT 3, SCH 2, LNK 2). Decision: Section 5.1’s explicit rule IDs/checks are authoritative; implement each listed rule once, and report the actual catalog count. Link HTTP checks remain subject to SSRF-safe same-domain constraints.
10. **Near-duplicate classification is AI-backed but AI optional:** Decision: deterministic Jaccard candidates are always emitted; AI classification is only recorded when available, and missing AI never changes deterministic candidate detection or invents a confirmed label.
11. **Published/exported states differ:** export is an approved terminal path; simulated/Shopify publish requires approval and item snapshots. Decision: implement Section 7.3 transitions exactly, with publish failures recorded per item and no implicit approval.
12. **Scoring blends bounded AI content quality with deterministic 85%:** AI may be absent. Decision: use a documented neutral/manual-pending value for the bounded AI rubric only where source/design permits; surface that state and never represent an unrun model score as observed. Final policy to be pinned in scoring implementation and tests.
13. **OAuth/connect and publish require merchant-owned credentials:** Decision: isolate integration adapters; demo/CSV/simulated publish must remain fully useful. Acceptance AC-06 needs a configured Shopify dev store and must be reported separately from local automated verification.
14. **Phase commits require repository identity:** Decision: initialize Git and create a conventional commit at each completed phase as explicitly required; if a phase is split, commit each coherent verified increment and log it.

## Phased build plan (SRS Section 16.1)

### Phase 0 — Foundation

Official Next.js scaffold and compatible versions; global token theme and shadcn setup; validated environment; CI scripts/workflow; Supabase schema, indexes, membership function and RLS; auth and workspace bootstrap. Verify lint, typecheck, tests and production build; commit; record outcomes in `docs/BUILD_LOG.md`.

### Phase 1 — Import and Demo

CSV mapping/row validation/error report; reproducible 100-product fixture and Demo Store import; Shopify OAuth, encrypted token storage, paginated/throttled GraphQL product import; product/store views and import progress. Verify all commands; commit; update build log.

### Phase 2 — Audit Engine

Pure TypeScript rules from Section 5.1, exact/near duplicate detection, JSON-LD validation, transparent scoring, resumable jobs, audit history/dashboard. Verify every rule against seeded defects and clean controls plus score/job tests; commit; update build log.

### Phase 3 — AI Copilot

Official `@google/genai` adapter; versioned prompts and JSON schemas/Zod; fact lock, sanitizer, one repair retry, response cache, rate-aware queue and atomic quotas; explanations, suggestions, extraction/classification. Verify with mocked Gemini and unconfigured-key behavior; commit; update build log.

### Phase 4 — Review and Publish

Paginated/filterable TanStack review table, versioned inline edits, diffs, SERP/product preview, state-machine approvals, export, Shopify/simulated resumable publishing, snapshots/revert, re-audit improvement score. Verify approval enforcement and mocked integrations; commit; update build log.

### Phase 5 — Limits and Polish

Usage meter/limits, activity log, all loading/empty/error/disabled states, accessibility/responsive pass, complete README, deployment configuration and final acceptance traceability. Run the required CI commands and build, resolve failures, commit, and record any credential-dependent/manual acceptance checks and remaining limitations.
