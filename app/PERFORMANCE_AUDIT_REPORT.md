# PERFORMANCE AUDIT REPORT — IR-PVC (railway_pvc_system)

_Read-only audit. No code was modified. Every claim below is backed by a measured command or a cited file. Items that could not be verified are marked **NOT VERIFIED**._

Audit date: 2026-07-05 · Environment: Windows dev machine · Build run locally (`next build`, clean dist dir).

---

## Executive Summary

This is a large, feature-rich Next.js 15 (App Router) SaaS. The **backend/data layer is genuinely well-built for serverless scale** — correct pgbouncer pooling, a heavily-indexed schema, and small connection pools. The **weak areas are all on the front end and the request model**: very large client-component pages, no route-level code splitting, heavy charting/spreadsheet/PDF libraries in client bundles, almost no framework caching (nearly everything is `force-dynamic`), and a per-request "session + user lookup" auth pattern that multiplies DB round-trips.

Nothing here is fatal, but several pages ship **430–715 kB of First Load JS** (3–4× a healthy budget) and heavy work (PDF generation) runs synchronously in serverless functions.

**Overall Performance Score: 61 / 100.**

---

## PHASE 1 — Project Analysis (measured)

| Item | Value | Evidence |
|---|---|---|
| Framework | Next.js App Router | `app/` dir, `next.config.js` |
| Next.js version | **15.5.19** | `package.json` |
| React version | **18.3.1** (not 19) | `package.json` — the audit prompt assumed React 19; **it is React 18** |
| Dependencies | 104 prod, 22 dev | `package.json` |
| Database | PostgreSQL (Supabase) | `prisma/schema.prisma`, `lib/db.ts` |
| ORM | Prisma 6.7.0 · **49 models, 126 indexes/uniques** | schema grep |
| Auth | NextAuth 4.24.14 (JWT), Google + Credentials | `lib/auth.ts` |
| Image handling | **`images: { unoptimized: true }`** | `next.config.js` — next/image does **no** resize/AVIF/WebP |
| Middleware | `getToken()` (JWT decode) up to **2×/request** | `middleware.ts:69,93` |
| Caching | SW (PWA) + in-memory `AdvancedCache` (per-lambda) + security headers | `public/sw.js`, `lib/advanced-cache.ts` |
| Deployment | Vercel, Node serverless, **0 edge routes** | grep `runtime = 'edge'` → 0 |
| Build config issue | `next.config.js` has an **invalid `api` key** (ignored in App Router; prints a warning every build) | build output |

---

## PHASE 2 — Build Analysis (measured)

- **Compile time: 2.4 min** (`✓ Compiled successfully in 2.4min`), then 119 static pages generated.
- **Shared First Load JS: 102 kB** (healthy baseline).
- Route split: **static ○ = 71, dynamic ƒ = 197**.

**Largest routes by First Load JS (measured from build output):**

| Route | First Load JS |
|---|---|
| `/auth/signup` | **715 kB** ⚠ public page |
| `/indices/component-documents` | **655 kB** |
| `/class-analyzer` | 478 kB |
| `/profile` | 477 kB |
| `/admin/users` | 468 kB |
| `/indices/spreadsheet` | 461 kB |
| `/indices/detailed` | 461 kB |
| `/indices/manage` | 458 kB |
| `/indices/table` | 456 kB |
| `/classifications-new` | 450 kB |
| `/admin/credit-statements` | 445 kB |
| `/indices/fuel-prices` / `steel-import` / `monthly` | 431–432 kB |

A reasonable First Load JS budget is ~130–170 kB. **Most authenticated pages are 2.5–4× over budget.**

> **NOT VERIFIED:** the exact modules inflating `/auth/signup` to 715 kB. The page file itself is small (335 LOC, 13 imports, no obvious heavy import). Confirming needs `@next/bundle-analyzer`, which is not installed.

---

## PHASE 3 — Next.js Performance

- **`use client` in 183 of 546 `.ts/.tsx` files (~33%).** (grep)
- **The biggest pages are client components:** `app/bills/page.tsx` (2585 LOC), `app/bills/new/page.tsx` (2247), `app/class-analyzer/page.tsx` (1917), `app/bills/[id]/bill-detail-client.tsx` (1418), `components/bills/bill-pdf-cement-analyzer.tsx` (1471) — all begin with `'use client'`. → large hydration + client bundles.
- **`next/dynamic` used 0 times** → no lazy loading of heavy client widgets.
- **`loading.tsx` = 0, `template.tsx` = 0, `error.tsx` = 1** → no route-level streaming/loading boundaries (missed streaming/Suspense wins). `<Suspense>` appears in 10 files.
- `generateMetadata`/`metadata` in 21 files.
- **131 routes `force-dynamic`**, 4 with `revalidate`/ISR → almost nothing is statically cached/streamed.

---

## PHASE 4 — React Performance

- Huge client pages (above) imply heavy re-render surface and large DOM. `app/bills/page.tsx` at 2585 LOC as a single client component is the clearest case.
- **`lodash` is a dependency but has 0 imports** in `app/`, `components/`, `lib/` → **unused dependency**.
- Providers are reasonable: `SessionProvider` → `LanguageProvider` → `ThemeProvider` + `Toaster` (`components/providers.tsx`). Not excessive.
- 4 components use `setInterval`.
> **NOT VERIFIED (per-component):** specific missing `useMemo`/`useCallback`/re-render counts — not measured (needs React Profiler traces on a running instance).

---

## PHASE 5 — Database Performance

- **174 `findMany` calls; only 7 use `select`.** → pervasive `SELECT *` over-fetch (returns every column, including large JSON/text fields). This is the single most systematic DB inefficiency.
- **Well-indexed:** 126 `@@index`/`@unique` across 49 models (e.g., `Bill` has composite indexes on `contractId,dateOfMeasurement` etc.). "Missing indexes" is **not** a general problem — verified present.
- **Correct serverless pooling:** `lib/db.ts` detects the Supabase transaction pooler (port 6543), forces a tiny `connection_limit`, and disables keep-alive to avoid P2024 pool exhaustion. This is a genuine strength.
- Per-iteration `await prisma…` loops exist (e.g. `fuel-sync`, WPI import upsert-per-month/index, `cement-analysis`) — mostly admin/cron paths, acceptable there.

---

## PHASE 6 — API Performance

- **94 API routes call `getServerSession`; 76 of those also `prisma.user.findUnique`.** → every authenticated request = JWT decode + a user-row DB query before doing any work. At scale this multiplies DB round-trips.
- **0 edge routes; 131 `force-dynamic`** → all API is Node serverless, cold-startable, uncached.
- **Very large route handlers:** `app/api/bills/[id]/pdf-report/route.ts` = **4335 LOC**, `bulk-pdf-report` = 2790 LOC. PDF generation is synchronous and heavy — a single IR PDF took **~28 s** in an earlier observed run. `maxDuration` is set to 60 s on some routes → **timeout/concurrency risk under load**.
- Only 2 `fetch` calls use cache hints (`no-store`/`revalidate`).

---

## PHASE 7 — Image Optimization

- **`images: { unoptimized: true }`** globally → next/image emits raw `<img>` with no resizing, no AVIF/WebP, no responsive `srcset`.
- Only 3 files import `next/image`; **0 raw `<img>`**. Image surface is small, so impact is limited — but the setting defeats the point of `next/image` where it is used (logos, YouTube thumbnails).

---

## PHASE 8 — CSS Performance

- Tailwind (JIT/purged by default). No obvious global CSS bloat found.
> **NOT VERIFIED:** unused-CSS %, CLS from layout, font-loading strategy — not measured (needs Lighthouse/real render).

---

## PHASE 9 — JavaScript Performance

- **Heavy libs and where they land:**
  - `recharts` (large): **3 files, all client** — `dashboard`, `admin/analytics`, `tendering-estimator`. Dashboard is a main user page.
  - `xlsx` (~1 MB): imported in a **client** page `app/contracts/import/page.tsx`.
  - `pdf-lib`: imported in a **client** page `app/indices/component-documents/page.tsx` (655 kB route).
  - `jspdf` (6 files), `pdfjs-dist` (1), `framer-motion` (1): **server-side only** → good.
- **`lodash` present but unused** (remove).
- date-fns v3 imported via named imports (tree-shakeable) — fine. No moment.js.

---

## PHASE 10 — Network Performance

- SW: Cache-First for `/_next/static` and images, Network-First for HTML, cross-origin bypassed. Reasonable.
- Security headers + CSP set in `next.config.js`.
- Compression: Vercel default (gzip/br) — **NOT VERIFIED** at the edge from here.
- Almost no HTTP/data caching (see Phase 6) → repeated identical requests re-hit the server/DB.

---

## PHASE 11 — Security vs Performance

- Middleware runs `getToken()` (JWT verify/decode) up to **2× per request** across the matcher. Small CPU cost, but on every navigation/API call.
- Rate limiting is **DB-backed** (`checkDbRateLimit`) → a DB write per rate-limited action (signup, etc.). Fine at current scale; a Redis/edge KV would scale better.

---

## PHASE 12 — Mobile Performance

- **NOT VERIFIED (field metrics):** CLS/LCP/FID/INP/TTFB were not measured — that requires Lighthouse/CrUX on a deployed instance, which this read-only local audit cannot produce.
- **Strong inference from measured data:** many authenticated pages ship 430–715 kB First Load JS and are large client components (bills page = 2585-LOC client). On mid-range mobile this will produce poor LCP/TTI/INP. This is the most likely real-world user complaint.

---

## PHASE 13 — Memory

- `AdvancedCache` = in-memory `Map` + a `setInterval` sweeper (`lib/advanced-cache.ts:21,208`). On serverless it is **per-lambda** (not shared, lost on cold start) → limited effectiveness, bounded memory.
- 4 components use `setInterval`. > **NOT VERIFIED:** whether each clears on unmount (not individually traced).

---

## PHASE 14 — Vercel

- **0 edge routes**, mostly `force-dynamic` → no ISR, no Data Cache, no Route Cache, minimal `fetch`/React cache. Image cache N/A (unoptimized). The app leans entirely on runtime compute + the DB for every request.

---

## PHASE 15 — Scores

| Area | Score | Basis |
|---|---:|---|
| Architecture | 70 | Clean separation; but 4335-LOC routes & 2585-LOC client pages |
| Frontend | 45 | 430–715 kB pages, no code splitting, giant client components |
| Backend | 72 | Solid handlers, but heavy synchronous PDF work |
| Database | 78 | Great indexing & pooling; **over-fetch (7/174 use `select`)** drags it |
| API | 58 | Repeated auth + user query; no caching; 0 edge |
| React | 55 | Huge client components; memoization unmeasured |
| Next.js | 55 | No loading/streaming; 131 force-dynamic; invalid config key |
| Bundle | 42 | Heaviest weakness — many 400 kB+ First Load JS routes |
| Caching | 45 | SW good; framework/data caching almost absent |
| Images | 55 | Small surface, but `unoptimized: true` |
| CSS | 70 (partial) | Tailwind purged; deeper metrics NOT VERIFIED |
| Network | 60 | Headers/SW good; no HTTP caching |
| Mobile | 45 (inferred) | Heavy bundles → likely poor LCP/INP; field metrics NOT VERIFIED |
| Developer Experience | 70 | 62 passing tests, typed, clear libs; some 2000+ LOC files |
| Production Readiness | 65 | Runs, scales on Vercel; PDF/caching/bundle risks |
| **Overall** | **61 / 100** | |

---

## PHASE 16 — Priority List

### 🔴 CRITICAL
1. **Over-fetch: 167/174 `findMany` return all columns.**
   - Why slow: pulls large JSON/text columns over the pooler on every list/detail query; more bytes, more memory, slower serialization.
   - Evidence: `grep findMany` = 174, `findMany(...select` = 7.
   - Improvement: 20–50% smaller/faster reads on hot endpoints. Difficulty: Medium. Time: 1–2 days (start with `bills`, `contracts`, `pdf-report`).

2. **Heavy pages: 430–715 kB First Load JS, no code splitting.**
   - Why slow: large download + parse + hydrate, worst on mobile.
   - Evidence: build table (`/auth/signup` 715 kB, `/indices/component-documents` 655 kB, `/class-analyzer` 478 kB…). `next/dynamic` used 0×.
   - Improvement: `next/dynamic` for recharts/xlsx/pdf-lib and splitting the 2000+ LOC client pages can cut 200–400 kB off several routes. Difficulty: Medium. Time: 2–4 days.

### 🟠 HIGH
3. **Per-request auth = JWT decode + user DB query on 76 routes.**
   - Evidence: `getServerSession` in 94 routes, `prisma.user.findUnique` in 76.
   - Fix: put `role`/`id` in the JWT/session (already partly there) and stop re-querying the user on every route. Improvement: one fewer DB round-trip per authed request. Difficulty: Medium. Time: 1 day.

4. **Synchronous, heavy PDF generation (28 s observed; 4335-LOC route).**
   - Why risky: long function duration → concurrency pressure and timeout risk under load; poor UX.
   - Fix: cache generated PDFs (durably, not in-lambda), and/or move to a background job/queue. Difficulty: High. Time: 3–5 days.

5. **Nearly everything `force-dynamic`, ~no ISR/data cache.**
   - Fix: cache reference data (indices, classifications, contract lists) with `revalidate`/tags. Difficulty: Medium. Time: 1–2 days.

### 🟡 MEDIUM
6. `images: { unoptimized: true }` — enable optimization (or `remotePatterns`) where next/image is used.
7. `recharts` on the **dashboard** client bundle — lazy-load it.
8. Middleware `getToken` twice per request — dedupe to once.
9. Invalid `api` key in `next.config.js` — remove (dead config).

### 🟢 LOW
10. Remove unused `lodash` dependency.
11. Add `loading.tsx` to heavy route segments for streaming skeletons.
12. `AdvancedCache` is per-lambda — document it or move hot caching to Vercel KV/Redis.

---

## PHASE 17 — Top 20 Quick Wins (highest speed / least effort)

1. Add `select` to the top 10 hottest `findMany` (bills list, contracts list, pdf-report). ⏱ hours
2. `next/dynamic(() => import('recharts'…), { ssr:false })` on dashboard/analytics. ⏱ hours
3. Lazy-load `xlsx` in `contracts/import` (dynamic import on the action, not top-level). ⏱ 1h
4. Lazy-load `pdf-lib` in `indices/component-documents` (655 kB route). ⏱ 1h
5. Remove the invalid `api` key from `next.config.js`. ⏱ 5 min
6. Remove unused `lodash`. ⏱ 5 min
7. Stop re-querying `prisma.user.findUnique` where `session.user.id/role` already suffices. ⏱ hours
8. Cache the IR PDF per (bill, format, docs) durably; return cached bytes on repeat. ⏱ half-day
9. `export const revalidate` on read-only reference pages (pricing/about/indices/view). ⏱ hours
10. Collapse middleware `getToken` to a single call. ⏱ 30 min
11. Split `app/bills/page.tsx` (2585 LOC) — move table/rows into a lazily-loaded child. ⏱ half-day
12. Enable next/image optimization for the 3 image usages + YouTube thumbnails. ⏱ 30 min
13. Add `loading.tsx` skeletons to `/bills`, `/indices/*`. ⏱ hours
14. Investigate `/auth/signup` 715 kB with `@next/bundle-analyzer` and trim. ⏱ hours
15. Paginate any unbounded list `findMany` (verify `bills`, `dailyFuelPrice`). ⏱ hours
16. Add HTTP `Cache-Control` to static JSON API responses (indices, classifications). ⏱ hours
17. Move `recharts`/`framer-motion` behind Suspense boundaries. ⏱ hours
18. Batch per-item `await` DB writes into `createMany`/transactions in sync/import paths. ⏱ hours
19. Preconnect/prefetch the API origin on first paint. ⏱ 30 min
20. Add `@next/bundle-analyzer` to the build to make bundle regressions visible. ⏱ 30 min

---

## PHASE 18 — Summary Tables

**Largest bundles (First Load JS):** `/auth/signup` 715 kB · `/indices/component-documents` 655 kB · `/class-analyzer` 478 kB · `/profile` 477 kB · `/admin/users` 468 kB.

**Largest source files (LOC):** `pdf-report/route.ts` 4335 · `bulk-pdf-report/route.ts` 2790 · `bills/page.tsx` 2585 · `bills/new/page.tsx` 2247 · `indices/spreadsheet/page.tsx` 1983.

**Largest client components:** `bills/page.tsx` (2585), `bills/new/page.tsx` (2247), `class-analyzer/page.tsx` (1917), `bill-pdf-cement-analyzer.tsx` (1471), `bill-detail-client.tsx` (1418).

**Heaviest dependencies — installed size on disk (measured; note: disk ≠ client bundle):** `pdf-parse` 92 MB (used server-side in `cement-analysis`), `@napi-rs/canvas` 37 MB, `pdfjs-dist` 36 MB, `lucide-react` 31 MB (tree-shaken per-icon), `date-fns` 31 MB (tree-shaken), `jspdf` 29 MB, `pdf-lib` 23 MB, `twilio` 19 MB, `openai` 15 MB. Build-time-only (not shipped): `next`/`@next` 320 MB, `@prisma`/`prisma` 147 MB, `typescript` 40 MB, `vite`/`webpack`/`@babel`. The runtime-heavy ones (pdf/canvas/twilio/openai) are **server-side**, so they inflate cold-start/function size, not the browser bundle.

**Slowest observed operation:** IR PDF generation ~28 s (single run, earlier in session).

**Estimated gain if CRITICAL + HIGH done:** First Load JS on top pages down ~40–55% (→ ~200–320 kB); authed-request DB round-trips roughly halved; PDF endpoints no longer a timeout risk. Overall score → **~78–82/100**.

---

## FINAL VERDICT

### Can this application comfortably support 10,000+ daily active users on Vercel?

**Qualified yes — with two real caveats.**

**Why yes (evidence):**
- The database layer is built correctly for serverless scale: the Supabase **transaction pooler is detected and the connection pool is deliberately kept tiny with no keep-alive** (`lib/db.ts`), which is exactly what prevents pool exhaustion at high concurrency. The schema is **heavily indexed (126 indexes)**. Vercel auto-scales the Node functions. 10k DAU (typically a few requests/user, spread over a day) is well within what this shape handles.

**The two caveats that will bite before user _count_ does:**
1. **Heavy synchronous PDF generation** (observed ~28 s, 4335-LOC route, `maxDuration 60`). If many users generate PDFs in a burst, you'll hit function concurrency limits, timeouts, and cost — not a DB problem, a **compute-duration** problem. Cache/queue this before scaling marketing.
2. **No caching + per-request user query.** With `force-dynamic` everywhere and a `user.findUnique` on ~76 authed routes, every request does real DB work. It will *work*, but it's more DB load and Vercel cost than necessary; caching reference data and trimming the auth query gives large headroom cheaply.

**Separately, user-perceived performance (not capacity)** is the weakest point: 430–715 kB First Load JS on core pages will feel slow on mobile. That won't stop 10k DAU from working, but it will hurt conversion/retention.

**Bottom line:** capacity for 10k DAU is realistic on the current backend; **fix PDF caching/queuing and add data caching first**, then trim the client bundles for the mobile experience.

_Generated by a read-only audit. Bundle root-causes marked NOT VERIFIED require `@next/bundle-analyzer`; field/mobile metrics require Lighthouse/CrUX on a deployed instance._
