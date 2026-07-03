# App Audit Score Report

**App:** railway_pvc_system (IR-PVC) — Next.js 15 App Router · Prisma/PostgreSQL (Supabase) · NextAuth (JWT) · Razorpay
**Date:** 2026-07-03
**Method:** 7-pass review with file/line evidence. Security reflects the current codebase **after** this session's remediation (payments, rate limiting, CSP, XSS, headers). Metrics were measured, not estimated.

---

## Executive Summary

- **Final score: 74 / 100 → 76 / 100** (after AUD-01 fix, below)
- **Production readiness: Production Ready after minor fixes** — the app is already live and serving real users/payments with a strong security posture; the deductions are robustness gaps (automated tests) rather than blocking defects. **Update 2026-07-03: AUD-01 (DB migration baseline) is now RESOLVED and verified** — the schema is fully reproducible from migrations.
- **Biggest strengths:** hardened security (atomic exactly-once payments, distributed rate limiting, enforced CSP + headers, XSS fixed), consistent tenant/ownership authorization, a well-indexed and constrained schema, and a polished, bilingual UI.
- **Biggest risks:** (1) **no baseline DB migration** — the schema cannot be reproduced from migrations; (2) **zero automated tests** around payment/permission logic; (3) several **4,000+ line monolithic files** and heavy `any` usage.

### Top 10 fixes to improve the score
1. Generate a **baseline migration** so `prisma migrate deploy` recreates the full schema (AUD-01).
2. Add **automated tests** for payment crediting, permissions, and PVC math (AUD-02).
3. Split the **4,307-line PDF route** and other 2,000+ line files into modules (AUD-03).
4. Reduce **`any` usage** (835 occurrences) in auth/payment/DB paths (AUD-04).
5. **De-duplicate** the 3 identical GST-invoice HTML generators into one module (AUD-05).
6. Enable **Next image optimization** (`images.unoptimized: true` → remove) or use a CDN (AUD-06).
7. Move **heavy PDF generation off the request path** (queue/stream) to avoid serverless timeouts (AUD-07).
8. Add route-level **`loading.tsx` / `not-found.tsx`** for polished loading/404 states (AUD-08).
9. Add **environment-variable validation at boot** (fail fast on missing config) (AUD-09).
10. Replace remaining raw **`console.log`** (152) with the prod-safe `logger` (AUD-10).

---

## Scorecard

| Area | Score | Reason |
| ---- | ----: | ------ |
| Security | 90 | Atomic/idempotent payments, timing-safe webhook, DB-backed login rate limiting, enforced CSP + security headers, XSS escaped, deps clean (`npm audit`=0), parameterized SQL, no public secret leaks. Minor: `script-src` needs `'unsafe-inline'` (AdSense), heavy `any` in auth paths. |
| Tenant isolation / authorization | 88 | Consistent ownership via `checkUserBillAccess`/`checkUserContractAccess`, v1 API scoped by `userId`, admin gated by `validateAdminAccess`, bulk-delete validates every id. Minor: some pre-check-then-mutate (non-atomic) patterns; not all 183 routes exhaustively traced. |
| Code quality | 62 | Several 2,000–4,300 line files, 835 `any` usages, 3× duplicated ~400-line invoice generator, 152 raw `console.log`. Positives: `tsc` clean, only 9 TODOs, consistent structure. |
| Database design | 82 → 86 | 47 models, 83 `@@index`, 33 cascades, 40 unique constraints, parameterized queries. **AUD-01 resolved:** migration history is now complete and reproduces prod exactly. Remaining minor: no `organizationId` (user-ownership by design). |
| Performance | 72 | Dashboard uses one raw aggregate (no N+1), bills list paginated, accessible-id queries avoid memory cliffs. Deductions: `images.unoptimized`, 166 client components, synchronous in-request PDF generation. |
| Scalability | 70 | DB-backed rate limiter now cross-instance; Supabase pooler; pagination. Deductions: in-request heavy PDF work (no queue), residual in-memory caches don't scale across instances, no report CDN/cache. |
| UI/UX | 75 | Polished landing page, shadcn/Tailwind design system, bilingual (EN/हिन्दी), loading spinners, empty states, one error boundary. Deductions: no `loading.tsx`/`not-found.tsx`, a hydration mismatch warning, accessibility not systematically verified. |
| Reliability | 76 | 172/183 routes have try/catch, `/api/health/db` health check, atomic payment/credit transactions, webhook idempotency, fail-open limiter, Slack alerts. Deductions: 0 tests, no boot-time env validation, no retry/queue for external calls. |
| Maintainability | 63 | Clear folders, prod-safe logger, low TODOs. Deductions: 835 `any`, 4,000+ line files, duplicated generators, no tests to refactor safely. |
| Production readiness | 68 → 74 | Security hardened, health check, `.env` gitignored, CSP/headers, **baseline migration added (AUD-01 fixed) — schema reproducible from migrations**. Remaining deductions: **0 tests**, no visible CI, `images.unoptimized`, monitoring limited to Slack alerts, backups assumed (Supabase). |
| **Overall** | **76** | Strong, live, secure product; the DB is now reproducible from migrations. Remaining debt: test coverage and code-size/duplication. |

---

## Confirmed Issues

### AUD-01 — No baseline DB migration (schema not reproducible from migrations) — ✅ RESOLVED (2026-07-03)
- **Resolution:** Added a baseline migration `app/prisma/migrations/20260101000000_init/` (43 tables representing the pre-additive schema) plus `migration_lock.toml`, ordered before the 5 additive migrations. **Verified on a throwaway isolated schema:** `prisma migrate deploy` on a fresh empty database applies all 6 migrations and reproduces production **exactly — 48 tables, 42 foreign keys, 170 indexes (identical to prod)**. Production was reconciled with `prisma migrate resolve --applied 20260101000000_init` (bookkeeping only, no DDL); `migrate status` = "up to date" and data is intact (125 users, 57 bills, 32 contracts, 11 payments). No feature code changed.
- **Area:** Database / Production readiness · **Severity:** High · **Score impact:** −8 (prod readiness), −4 (DB)
- **Files:** `app/prisma/migrations/` (only 5 folders); earliest `20260623000100_add_referral_program/migration.sql:1`
- **Evidence:** The first migration is `ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;` and later `FOREIGN KEY ("referrerUserId") REFERENCES "User"("id")` — it **references `User` but never creates it**. `grep -rl 'CREATE TABLE "users"|"contracts"|"bills"' prisma/migrations` returns **nothing**. The 47-model baseline was clearly applied with `prisma db push`, not migrations.
- **Why it matters:** `prisma migrate deploy` against a **fresh/empty** database (new environment, staging, disaster recovery) will **fail on the first migration** because the base tables don't exist. You cannot rebuild the DB from source of truth. Current production works only because those tables already exist from the original `db push`.
- **Recommended fix:** Create a baseline. On a shadow/empty DB, run `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/00000000000000_init/migration.sql`, then `prisma migrate resolve --applied 00000000000000_init` against production so it's marked applied without re-running. Verify `migrate deploy` succeeds on a throwaway empty DB afterward.
- **Example patch:** (generate) `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`

### AUD-02 — Zero automated tests
- **Area:** Reliability / Maintainability · **Severity:** High · **Score impact:** −8 (reliability/maintainability spread)
- **Files:** repo-wide. **Evidence:** `find . -name "*.test.*" -o -name "*.spec.*"` (excluding node_modules) → **0**.
- **Why it matters:** The highest-risk logic — payment crediting (exactly-once), permission checks, PVC calculation math (`lib/pvc-calculations.ts`, 1,698 lines) — has no regression safety net. A refactor or dependency bump can silently break money or access-control paths.
- **Recommended fix:** Add unit tests for `processPaymentForBill` idempotency, `checkUserBillAccess`/`checkUserContractAccess`, and core PVC math; add one integration test for the Razorpay verify/webhook race. Wire `vitest`/`jest` into CI and fail on regressions.

### AUD-03 — Monolithic files (up to 4,307 lines)
- **Area:** Code quality / Maintainability · **Severity:** Medium · **Score impact:** −6
- **Evidence (`wc -l`):** `app/api/bills/[id]/pdf-report/route.ts` = **4,307**, `app/api/bills/bulk-pdf-report/route.ts` = 2,790, `app/bills/page.tsx` = 2,585, `app/bills/new/page.tsx` = 2,075, `app/api/bills/cement-analysis/route.ts` = 1,603.
- **Why it matters:** A 4,300-line route handler is hard to review, test, and change safely; it mixes data fetching, PVC math, and jsPDF layout in one function. Raises regression risk and slows onboarding.
- **Recommended fix:** Extract PDF layout, data assembly, and calculation into `lib/pdf/*` modules (a `lib/pdf/generators/ir-standard-report.ts` already exists — extend that pattern to the detailed report). Split `bills/page.tsx` into presentational components.

### AUD-04 — Heavy `any` usage (weak typing)
- **Area:** Code quality / Security · **Severity:** Medium · **Score impact:** −5
- **Evidence:** `grep -rn ': any|<any>|as any'` (app/lib/components) → **835** occurrences.
- **Why it matters:** `any` disables type checking exactly where correctness matters (auth payloads, Prisma results, payment data). E.g., invoice generators are typed `(invoice: any, user: any)` — the XSS in this session was possible partly because fields were untyped `any`.
- **Recommended fix:** Type the high-risk surfaces first: payment/credit objects, permission results, invoice/bill shapes. Add `noImplicitAny` enforcement incrementally per-folder.

### AUD-05 — Duplicated GST-invoice HTML generator (×3)
- **Area:** Code quality / Maintainability · **Severity:** Medium · **Score impact:** −4
- **Files:** `app/api/public/gst-invoice-pdf/[id]/route.ts`, `app/api/gst-invoices/[id]/pdf/route.ts`, `app/api/admin/gst-invoices/[id]/pdf/route.ts` — each contains a byte-identical ~400-line `generateGstInvoiceHtml`.
- **Evidence:** `diff` of the three functions = IDENTICAL (verified this session). The XSS fix had to be applied three times.
- **Why it matters:** Every change (including the security escaping) must be made in three places; drift is inevitable.
- **Recommended fix:** Extract to `lib/pdf/gst-invoice-html.ts` and import in all three routes.

### AUD-06 — Next image optimization disabled
- **Area:** Performance · **Severity:** Medium · **Score impact:** −3
- **File/line:** `app/next.config.js:15` → `images: { unoptimized: true }`.
- **Why it matters:** All images are served at full size with no resizing/format negotiation. Low impact today (few images — logos), but it's a blanket disable that will hurt if image content grows.
- **Recommended fix:** Remove `unoptimized: true` (or scope it), configure `images.remotePatterns` for S3/Supabase, and let Next/Vercel optimize. Test the SRCA logo + any dynamic images afterward.

### AUD-07 — Synchronous PDF/report generation on the request path
- **Area:** Performance / Scalability · **Severity:** Medium · **Score impact:** −4
- **Files:** `app/api/bills/[id]/pdf-report/route.ts` (4,307 lines, jsPDF), `app/api/bills/bulk-pdf-report/route.ts` (bulk).
- **Why it matters:** Large or bulk bills build the entire PDF synchronously inside the request. On serverless this is CPU-bound and can approach the function duration limit; bulk combined reports compound it. No queue/streaming/backgrounding.
- **Recommended fix:** For bulk/large reports, stream or offload to a background job (e.g., generate + store to S3, return a signed link). Cap synchronous generation size. `maxDuration` is already raised on some routes — confirm it covers the largest real bills.

### AUD-08 — Missing route-level loading/404 states
- **Area:** UI/UX · **Severity:** Low · **Score impact:** −2
- **Evidence:** `find app -name loading.tsx` → **0**; `not-found.tsx` → **0**; `error.tsx` → 1.
- **Why it matters:** No App-Router streaming skeletons (pages pop in) and no branded 404. Inline spinners exist, so it's cosmetic, not broken.
- **Recommended fix:** Add `app/loading.tsx` (skeleton) and `app/not-found.tsx` (branded 404). Consider per-segment loaders for heavy pages (bills, indices).

### AUD-09 — No boot-time environment validation
- **Area:** Reliability · **Severity:** Low · **Score impact:** −2
- **Evidence:** env vars accessed as `process.env.X || default` throughout; no `zod`/schema validation of required env at startup.
- **Why it matters:** A missing/typo'd `RESEND_API_KEY`, `RAZORPAY_WEBHOOK_SECRET`, etc. fails deep inside a request instead of at deploy/boot, producing confusing runtime errors.
- **Recommended fix:** Add a small `lib/env.ts` that validates required vars with `zod` and is imported early; fail the build/boot if missing.

### AUD-10 — Raw `console.log` left in application code
- **Area:** Code quality · **Severity:** Low · **Score impact:** −1
- **Evidence:** `grep console.log` (app/lib/components) → **152** (a prod-safe `logger` exists in `lib/logger.ts` but isn't used everywhere).
- **Why it matters:** Log noise in production; inconsistent with the otherwise prod-safe logger (which suppresses non-errors).
- **Recommended fix:** Replace `console.log` with `logger.log`/`logger.debug`; keep `console.error` where intentional.

---

## Positive Findings (verified)

- **Payments are exactly-once & atomic:** `verify-payment` + `webhook` flip status via conditional `updateMany` and credit inside one `prisma.$transaction`; webhook uses `crypto.timingSafeEqual`.
- **Distributed rate limiting:** `lib/rate-limit-db.ts` (Postgres, atomic increment) on credentials login; OTP already DB-count limited.
- **Consistent authorization:** `lib/permissions.ts` ownership helpers used before reads/mutations; v1 API scoped by `auth.userId`; admin routes via `validateAdminAccess`; bulk-delete validates every id.
- **Security headers + enforced CSP** in `next.config.js`; `X-Powered-By` removed; HSTS/nosniff/frame-ancestors set.
- **Output encoding:** GST-invoice HTML now HTML-escapes user fields (XSS fixed).
- **Parameterized SQL only** (`$queryRaw` tagged templates, user-scoped); no `$queryRawUnsafe`.
- **Schema quality:** 83 indexes, 33 cascades, 40 unique constraints across 47 models.
- **Secure auth flows:** bcrypt(12), secure random reset tokens (1h, single-use), no reset enumeration, DB-verified JWT role.
- **Health check** at `/api/health/db`; **prod-safe logger** suppresses non-error logs in production; `.env` gitignored.

## False Positives / Safe Items (checked)

- **SSRF via report logo fetch** — SAFE: `logoPath` is a server-generated storage key (`app/api/settings/branding/route.ts:175`); `getFileUrl` only yields our-domain/S3 URLs. Hardened with a 5s timeout anyway.
- **`ws`/socket.io CVE** — SAFE: not used in app code, not a direct dep, `npm audit` = 0 after fix.
- **CORS** — SAFE: `lib/external-cors.ts` uses an env allowlist with exact match, no credentialed wildcard.
- **Cookie flags** — SAFE: NextAuth defaults (httpOnly, SameSite=Lax, Secure in prod).
- **Open redirect** — FIXED: `redirect` callback now uses exact-origin comparison.

---

## Priority Fix Plan

### Must fix before production *(for new-environment / DR confidence)*
- ~~**AUD-01** Baseline DB migration~~ — ✅ **DONE** (2026-07-03): `migrate deploy` now recreates the full schema on a fresh DB; verified identical to prod.
- **AUD-02** Automated tests for payments, permissions, and PVC math.

### Should fix soon
- **AUD-03** Break up the 4,307-line PDF route and other 2,000+ line files.
- **AUD-05** De-duplicate the GST-invoice HTML generator.
- **AUD-07** Move heavy/bulk PDF generation off the request path.
- **AUD-04** Reduce `any` on auth/payment/DB surfaces.

### Nice to have
- **AUD-06** Enable image optimization.
- **AUD-08** `loading.tsx` / `not-found.tsx`.
- **AUD-09** Boot-time env validation.
- **AUD-10** Replace remaining `console.log` with `logger`.

---

## Final Verdict

**Production Ready after minor fixes.**

The application is already live, secure, and functionally strong: payments are atomic and idempotent, authorization is consistently enforced, the schema is well-designed, and the security posture was thoroughly hardened this session (`npm audit` clean, enforced CSP, XSS closed). It scores **74/100**, held back mainly by **maintainability/robustness debt** — an incomplete migration history that prevents clean DB reproduction (AUD-01), a complete absence of automated tests (AUD-02), and several oversized/duplicated files. None of these block the currently-running deployment, but **AUD-01 and AUD-02 should be addressed before relying on `migrate deploy` for a new environment or trusting an untested refactor of the money/permission paths.**
