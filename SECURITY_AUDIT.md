# IR-PVC Security Audit Report

**Project:** `C:\Users\surface pro7\Downloads\railway-pvc-system-main\railway-pvc-system-main`  
**Audited:** 2026-06-13  
**Scope:** Next.js app (`app/`), WPI automation scripts (`wpi_automation/`), configuration, dependencies, and git history.

---

## Executive Summary

The codebase is a full-stack Next.js SaaS (Indian Railway PVC calculation) with PostgreSQL/Prisma, NextAuth, Razorpay, WhatsApp/Telegram integrations, and S3-compatible file storage. Overall, the project follows reasonable security practices: credentials are environment-driven, API keys are hashed, webhooks verify signatures, and no hardcoded production secrets were found in source control.

However, several issues were identified — mostly around authentication edge cases, unprotected automation endpoints, file storage fallback behavior, and missing security headers. None are critical remote-code-execution flaws, but the high/medium items should be addressed before a production deployment handling real contract/payment data.

---

## Fixes Applied (2026-06-13)

The following high-severity findings have been addressed in code:

| # | Finding | Fix |
|---|---|---|
| 1 | Insecure cookie fallback in middleware | Removed the `secureCookie: false` retry in `app/middleware.ts`. The public PDF bypass based only on query-param presence was also removed. |
| 2 | Unauthenticated WhatsApp incoming webhook | Added shared-secret verification to `POST /api/whatsapp/incoming` using the existing `whatsapp_webhook_verify_token` admin setting (supports `X-Webhook-Token` header or `token` query param). |
| 3 | Unauthenticated Telegram webhook setup | Added `validateAdminAccess` guard to `GET /api/telegram/setup-webhook`. |
| 4 | Razorpay secrets-file fallback | Removed the `~/.config/abacusai_auth_secrets.json` fallback in `app/lib/razorpay.ts`; credentials now come from environment variables only. Deleted `app/scratch/check-secrets.js`. |
| 5 | Public local S3 fallback | Removed `public/uploads` fallback from `app/lib/s3.ts`. The module now uses S3 or the authenticated database-backed `/api/public/uploads` endpoint only. |

Validation: `npx tsc --noEmit` and `npx next lint` both pass after the changes.

---

## Slack Monitoring Added (2026-06-13)

A reusable structured alert helper and operational alerts were added:

- `app/lib/slack-webhook.ts` — added `sendSlackAlert(level, title, fields)` for info/warning/critical alerts.
- `app/app/api/razorpay/webhook/route.ts` — alerts on missing/invalid signature, missing webhook secret, transaction/user not found, and unhandled processing errors.
- `wpi_automation/scripts/slack-alert.js` — standalone Node.js Slack alerting script usable from Python subprocesses.
- `wpi_automation/scripts/update_database.js` — alerts on fatal errors and partial update failures.
- `wpi_automation/scripts/send_notification.js` — alerts on WhatsApp notification failures and success summaries.

Set `SLACK_WEBHOOK_URL` and `ENABLE_SLACK_NOTIFICATIONS=true` in the environment to activate these alerts.

---

## Findings

### 🔴 High

#### 1. Session middleware falls back to insecure cookies
**File:** `app/middleware.ts` (lines 99–112)  
The middleware first tries to read the NextAuth JWT with `secureCookie: true`, then retries with `secureCookie: false` if the first attempt fails. This fallback weakens the cookie security model and can allow session hijacking if the app is ever accessed over HTTP or if a secure cookie is stripped by an intermediary.  
**Recommendation:** Remove the insecure fallback. Require `secureCookie: true` in production and ensure `NEXTAUTH_URL` uses HTTPS.

#### 2. WhatsApp incoming webhook has no request authentication
**File:** `app/app/api/whatsapp/incoming/route.ts` (POST handler)  
The endpoint processes inbound WhatsApp messages from the MyDreams provider but does not verify a signature, bearer token, or IP allow-list. An attacker who discovers the URL can inject fake messages.  
**Recommendation:** Add HMAC/signature verification or a shared secret header matching the provider’s outbound webhook configuration. Reject requests that fail verification.

#### 3. Telegram webhook setup endpoint is unauthenticated
**File:** `app/app/api/telegram/setup-webhook/route.ts` (GET handler)  
Anyone can call `/api/telegram/setup-webhook` to re-register the Telegram webhook URL and secret token. An attacker could point the bot to their own server.  
**Recommendation:** Protect this route with `validateAdminAccess` (or at least session auth). Restrict to admin users only.

#### 4. Razorpay credentials can be loaded from a hardcoded local secrets file
**File:** `app/lib/razorpay.ts` (lines 20–36)  
If environment variables are missing, the code falls back to reading `~/.config/abacusai_auth_secrets.json`. This creates an unexpected credential source and increases the attack surface if the server’s home directory is accessible.  
**Recommendation:** Remove the fallback. Fail closed when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are not set. Delete `app/scratch/check-secrets.js`, which probes the same file.

#### 5. S3 fallback writes uploaded files to `public/uploads`, making them world-readable
**File:** `app/lib/s3.ts` (lines 26–43, 62–83, 92–122)  
When S3 is not configured, files are saved under `public/uploads/...` and served publicly. Combined with the logo/PDF upload flows, this can expose user documents without authorization.  
**Recommendation:** Do not fall back to public local storage. If S3 is required, fail uploads gracefully. If local fallback is truly needed, store files outside the web root and stream them through an authenticated API.

---

### 🟡 Medium

#### 6. Hardcoded primary-admin backdoor email
**File:** `app/lib/role-auth.ts` (lines 36, 128, 164) and `app/app/api/admin/users/[userId]/route.ts` (line 54)  
The email `30prasath93@gmail.com` is hardcoded as an always-admin account. If an attacker can sign up or link a Google/OAuth account with this address, they gain admin privileges.  
**Recommendation:** Remove the hardcoded email. Use role-based access only, seeded via `ADMIN_SEED_EMAIL`.

#### 7. Password-reset URL trusts `Host` / `X-Forwarded-Host` headers
**File:** `app/app/api/auth/forgot-password/route.ts` (lines 49–68)  
The reset link base URL is derived from request headers. A malicious actor who can influence the Host header can cause reset emails to point to an attacker-controlled domain, facilitating account takeover.  
**Recommendation:** Always use a fixed, environment-defined base URL (`process.env.NEXTAUTH_URL` validated against an allow-list) and ignore request headers for password-reset links.

#### 8. Public PDF access token is only checked for existence, not signature/validity in middleware
**File:** `app/middleware.ts` (lines 28–33)  
The middleware allows `/api/bills/[id]/pdf-report?public_access=true&token=...` to bypass auth if both query params are present, but it does not validate the token. The downstream route does validate it, but the middleware should not make auth decisions based solely on parameter presence.  
**Recommendation:** Remove the special-case middleware bypass or verify the JWT before allowing the request through.

#### 9. `bulk-import-all-indices.ts` builds raw SQL via string interpolation
**File:** `app/scripts/bulk-import-all-indices.ts` (lines 59–73, 164–182)  
`$executeRawUnsafe` is used with values concatenated into the SQL string. Although the data source is an internal Excel file, this is a SQL-injection anti-pattern.  
**Recommendation:** Refactor to use parameterized `$executeRaw` with Prisma’s tagged-template variables, or use Prisma’s createMany/upsert helpers.

#### 10. Debug/performance endpoint leaks internal DB metrics without role check
**File:** `app/app/api/debug/performance/route.ts`  
Any authenticated user can view connection-pool status, table sizes, and recent bill creation activity. The middleware protects it, but there is no admin role check.  
**Recommendation:** Restrict to admin users (`validateAdminAccess`).

#### 11. Logo upload relies on client-supplied MIME type
**File:** `app/app/api/settings/branding/route.ts` (lines 134–140)  
The upload validates `file.type`, which is controlled by the client. A malicious user can upload HTML/JS with an `image/png` MIME type and potentially execute it if the file is later served from the same origin (especially in local-fallback mode).  
**Recommendation:** Verify the file magic bytes or use a server-side library (e.g., `file-type`) to confirm the actual format. Serve uploaded files with `Content-Disposition: attachment` or from a separate static domain.

#### 12. In-memory rate limiter does not scale
**File:** `app/lib/rate-limiter.ts`  
Rate limits are stored in a single Node.js process. In a serverless/horizontal-scaling environment, limits are trivially bypassed.  
**Recommendation:** Replace with Redis-backed rate limiting (e.g., Upstash Redis, Vercel KV) or a cloud WAF/CDN rate limit.

---

### 🟢 Low / Informational

#### 13. Missing security headers / CSP
**File:** `app/next.config.js`  
No `headers` configuration for `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, or `Referrer-Policy`.  
**Recommendation:** Add a `headers` export to `next.config.js` with a restrictive CSP and security headers.

#### 14. `ALLOWED_EXTERNAL_ORIGINS` default allows `https://primerp.in`
**File:** `app/.env.example` (line 55) and `app/lib/external-cors.ts`  
The example env includes an external domain. Ensure this is intentional and matches the current production partner.  
**Recommendation:** Update `.env.example` to use a placeholder or remove it; keep CORS origin allow-list minimal.

#### 15. `withTimeout` / abort controllers may leak resources
**Observation:** Several PDF routes use `AbortController` with manual `clearTimeout`. While not directly a vulnerability, ensure abort signals are always cleared in `finally` blocks to avoid timer leaks under load.

#### 16. Backup route files present in repository
**Files:** `app/app/api/bills/[id]/route.ts.backup`, `app/app/api/bills/bulk-pdf-report/route.ts.backup`, etc.  
Backup files can expose outdated logic or accidentally become active if build tooling picks them up.  
**Recommendation:** Delete backup files from source control.

---

## Dependency Vulnerabilities

`npm audit` reported **3 high-severity findings**, all related to **esbuild** (via `react-email` and `tsx`):

- `GHSA-gv7w-rqvm-qjhr` — Missing binary integrity verification in Deno module.
- `GHSA-g7r4-m6w7-qqqr` — Arbitrary file read when running the dev server on Windows.

These primarily affect development-time tooling. The Deno-related RCE is relevant only if `NPM_CONFIG_REGISTRY` is attacker-controlled.  
**Recommendation:** Update `react-email` and `tsx` to versions that pull in a patched `esbuild`. Test thoroughly, as `npm audit fix --force` may introduce breaking changes.

---

## Positive Security Controls Observed

- **No hardcoded secrets** in source files or git history (only `.env.example` with placeholders).
- **NextAuth secret fails closed** when `NEXTAUTH_SECRET` is missing.
- **API keys are SHA-256 hashed** before storage; plaintext keys are returned only once.
- **Razorpay webhook verifies HMAC-SHA256 signature** before processing events.
- **Telegram webhook verifies the secret token** header.
- **Passwords are hashed with bcrypt** (cost factor 12).
- **File uploads enforce size limits** and (for labour-index documents) require PDFs.
- **Prisma ORM** is used for most DB access, preventing SQL injection in the app routes.
- **Role-based access checks** are consistently applied to admin routes.

---

## Recommended Priority Order

1. Remove insecure cookie fallback in `middleware.ts`.
2. Authenticate WhatsApp and Telegram webhook endpoints.
3. Remove Razorpay `abacusai_auth_secrets.json` fallback and delete `scratch/check-secrets.js`.
4. Disable public local-storage fallback or move it out of the web root.
5. Remove hardcoded admin email backdoor.
6. Fix password-reset host-header trust issue.
7. Add security headers and a restrictive CSP in `next.config.js`.
8. Refactor `bulk-import-all-indices.ts` to parameterized queries.
9. Restrict debug/performance endpoint to admins.
10. Upgrade `esbuild`/`react-email`/`tsx` dependencies.
