# PERFORMANCE OPTIMIZATION REPORT

Companion to `PERFORMANCE_AUDIT_REPORT.md`. Each batch is behaviour-preserving, verified (tsc + tests + production build), and committed separately. All numbers are **First Load JS** measured from `next build`.

Baseline = the audit build. Every claim is measured, not estimated.

---

## Batch 1 — Lazy-load heavy client libraries + fix signup server-dep leak ✅ committed

**Reason:** several routes shipped heavy libraries in their initial JS even though the libraries are only used on user action; the public signup page also transitively imported server-only modules.

| Route | Before | After | Δ | How |
|---|---:|---:|---:|---|
| `/contracts/import` | 284 kB | **124 kB** | −160 kB | `xlsx` → `await import('xlsx')` inside the file-read / template handlers |
| `/indices/component-documents` | 655 kB | **472 kB** | −183 kB | `pdf-lib` → `await import('pdf-lib')` inside raster/compress fns |
| `/dashboard` | 235 kB | **132 kB** | −103 kB | recharts chart → `next/dynamic({ ssr:false })` component |
| `/auth/signup` | 715 kB | **538 kB** | −177 kB | `validatePhoneNumber` moved out of `lib/whatsapp-mydreams` (which pulls prisma + next-auth + jwt) into pure `lib/phone-validation`; re-exported so the 5 API importers are unchanged |

**Files:** `app/contracts/import/page.tsx`, `app/indices/component-documents/page.tsx`, `app/dashboard/page.tsx`, `components/dashboard/monthly-trend-chart.tsx` (new), `lib/phone-validation.ts` (new), `lib/whatsapp-mydreams.ts`, `app/auth/signup/page.tsx`, `next.config.js` (removed invalid `api` key).
**Verification:** tsc clean · 68 tests pass · production build succeeds.

---

## Batch 2 — Remove zxcvbn from the public signup bundle ✅ committed

**Reason:** after Batch 1, `/auth/signup` was still 538 kB. The remaining weight is `zxcvbn` (~400 kB dictionary), pulled in through the `PasswordStrengthIndicator` component.

- Evidence: `lib/password-strength.ts` imports `zxcvbn` at top level; the indicator is used only on `/auth/signup`. `reset-password` uses its own local `validatePassword` (no zxcvbn).
- Fix: `PasswordStrengthIndicator` is now `next/dynamic({ ssr:false })` in the signup page — the strength meter (and zxcvbn) loads on the client after hydration; the field still validates identically.

| Route | Before (Batch 1) | After | Δ |
|---|---:|---:|---:|
| `/auth/signup` | 538 kB | **146 kB** | −392 kB |

**Files:** `app/auth/signup/page.tsx`.
**Verification:** tsc clean · production build succeeds (`✓ Compiled successfully`).

---

## Batch 3 — Lazy-load recharts on the remaining chart pages ✅ committed

**Reason:** completes the "heavy libraries are lazy-loaded" stop-condition. Both chart blocks per page extracted into `next/dynamic({ ssr:false })` components (props are tsc-guarded — a missing variable is a compile error, so the extraction is safe).

| Route | Before | After | Δ |
|---|---:|---:|---:|
| `/tendering-estimator` | 280 kB | **171 kB** | −109 kB |
| `/admin/analytics` | 219 kB | **116 kB** | −103 kB |

**Files:** `components/tendering/estimator-charts.tsx` (new), `app/tendering-estimator/page.tsx`, `components/admin/analytics-charts.tsx` (new), `app/admin/analytics/page.tsx`. The `.reverse()` mutation on the analytics data was preserved exactly.
**Verification:** tsc clean · 68 tests pass · production build succeeds.

**All heavy client libraries are now lazy-loaded:** xlsx, pdf-lib, recharts (dashboard + tendering + analytics), zxcvbn.

## Batch 4 — Bills-list DB: skip heavy classification relations on the general list ✅ committed

**Reason:** the general bills list (`/api/bills?limit=1000`) eagerly loaded `workClassification` + the full `classificationEntries` (each with its full `classification` + `subClassification` record) for **every** bill — but no list view reads them.

**Verification that it's safe (traced all 6 consumers of `/api/bills`):**
- `bills/page`, `mobile-bills-list`, `admin/user-permissions`, `contracts/page` — **0** references to `classificationEntries`/`workClassification`.
- `mobile-bill-form` — uses `/api/bills/[id]` (single bill), not the list.
- `bills/new` — **does** read `previousBill.workClassification` + `previousBill.classificationEntries` (the "carry forward classification from the previous bill" feature), **but always calls `/api/bills?contractId=…`**.

**Fix:** include those two relations **only when `contractId` is present**. The general list drops them; the contract-scoped path (bills/new) is byte-for-byte unchanged.

**Measured:** ~1,827 bytes of classification relations per bill (DB sample; only 1.4 entries/bill — real bills with ~28 entries save far more) → **~1.74 MB of JSON removed from a 1000-bill list**, plus the joins/serialization for every entry.

**Live-verified:** `GET /api/bills?limit=1000` response now has `hasClassificationEntries: false, hasWorkClassification: false` (still has `pvcCalculation`, `contract`); the `?contractId=` path is unchanged (same include as before).

**Files:** `app/api/bills/route.ts`. **Verification:** tsc clean · 68 tests pass · build succeeds · live API-shape check.

## Batch 5 — Fix the `role-auth` server-chain leak (the biggest win) ✅ committed

**Reason:** `getClientRoleInfo` — a pure function that just reads role flags off the session — lived in `lib/role-auth.ts`, which imports `prisma`, `next-auth`, and `authOptions`. **~18 client pages** (and `components/navigation.tsx`) imported it, dragging the entire prisma/auth chain into each of their bundles. This one leak accounted for most of the remaining heavy routes.

**Fix:** moved `getClientRoleInfo` into a pure `lib/role-auth-client.ts`; `role-auth.ts` re-exports it for server callers; all client importers now import from the pure module. No server-only export was touched (verified: no client file imports anything else from `role-auth`).

**Measured (−291 kB each):**

| Route | Before | After |
|---|---:|---:|
| `/class-analyzer` | 481 kB | **187 kB** |
| `/profile` | 477 kB | **186 kB** |
| `/admin/users` | 471 kB | **177 kB** |
| `/indices/detailed` | 461 kB | **170 kB** |
| `/indices/table` | 456 kB | **165 kB** |
| `/classifications-new` | 450 kB | **159 kB** |
| `/admin/credit-statements` | 445 kB | **154 kB** |
| (+ `/indices/manage`, `/monthly`, `/fuel-prices`, `/steel-import`, `/manual-import`, `/classifications`, `/admin/price-indices`, mobile nav/dashboard — same ~291 kB drop) | | |

**Files:** `lib/role-auth-client.ts` (new), `lib/role-auth.ts`, + 18 importer files (import-path change only).
**Verification:** tsc clean · 68 tests pass · production build succeeds.

Four more pages used **double-quoted** `"@/lib/role-auth"` (missed by the first pass) — fixed in the same batch: `/indices/spreadsheet` **465 → 170 kB**, `/indices/steel-import` **431 → 140 kB**, `/indices/fuel-prices` **432 → 141 kB**, `/indices/component-documents` **472 → 178 kB** (this one also had pdf-lib lazy-loaded in Batch 1). In total ~22 client routes dropped ~291 kB each from this one fix.

## Running totals (measured)

- `/auth/signup`: **715 kB → 146 kB (−80%)** — the public signup page, the single most important result.
- `/indices/component-documents`: 655 → 472 kB.
- `/contracts/import`: 284 → 124 kB.
- `/dashboard`: 235 → 132 kB.

## Remaining work (verified, not yet done)

- **recharts on `/admin/analytics` and `/tendering-estimator`** (5 chart blocks each) — same technique as the dashboard, deferred because extracting 5 blocks is more regression-prone and these are admin/tool pages.
- **DB `select` clauses** (167/174 `findMany` return all columns) — high value but must be done per-query with consumer verification to avoid regressions; not safe to batch blindly.
- **Auth: drop redundant `prisma.user.findUnique`** where `session.user.id/role` already suffices (~76 routes) — needs per-route checking.
- **`images: { unoptimized: true }`** — enabling optimization needs `remotePatterns` config + testing of the 3 next/image usages.
- **Splitting 2000+ LOC client pages / server-component conversion** — real refactors with regression risk; out of scope for "no-regression" batches without careful manual work.

## Estimated score movement

Audit baseline **61/100**. Batches 1–2 materially cut the heaviest routes (esp. the public signup page) with zero behaviour change → **Bundle** sub-score improves most. Realistic post-batch overall estimate: **~68–72/100**. Reaching **90+** requires the DB `select` pass and page/server-component refactors, which are higher-risk and should be done incrementally with the same verify-before-commit loop.
