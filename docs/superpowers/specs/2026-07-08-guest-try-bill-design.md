# Guest Try-Bill Flow — Design Spec

**Project:** IR-PVC (railway_pvc_system)  
**Date:** 2026-07-08  
**Feature:** Let visitors create a bill before signing up; after they see the PVC preview, they sign up and download the IR Standard PDF.

---

## Goal

Reduce signup friction for contractors who land on the marketing site. Instead of forcing `/auth/signin` immediately, let them enter a few bill fields, see a PVC calculation preview, and then sign up to persist the bill and download the PDF.

---

## User Flow

1. **Landing page** gets a second CTA: *"Try it free — no signup"*.
2. **Guest wizard** (`/try-bill`) collects the minimum data needed for a PVC preview:
   - Agreement Number
   - Contractor Name
   - Base Month
   - Date of Measurement
   - Gross Bill Amount
   - Work Classification (dropdown)
   - Railway Zone (dropdown)
3. **Preview** shows:
   - Estimated PVC amount
   - Quarter and index summary
   - Clear message: *"Sign up to save this bill and download the IR Standard PDF"*
4. **Signup gate** when the user clicks *Download PDF / Save Bill*:
   - Draft is carried to `/auth/signup?tryBillDraft=<token>`.
   - After successful signup, the draft is converted into real records.
5. **Post-signup** the user is redirected to the newly created bill and the PDF download starts.

---

## Approach

**Chosen approach:** Dedicated guest wizard + `localStorage` draft + public preview API.

This avoids DB schema changes and anonymous records. The preview endpoint is read-only and rate-limited. Persistence happens only after the user has an authenticated account.

Alternatives considered:
- Server-side guest session with temp DB rows: rejected because it needs migrations, cleanup jobs, and more auth complexity.
- Making the full `/bills/new` form public: rejected because the existing form is large, authenticated-API heavy, and higher risk.

---

## New Files

| File | Purpose |
|------|---------|
| `app/try-bill/page.tsx` | Public guest wizard and PVC preview UI |
| `app/try-bill/types.ts` | Shared TypeScript types for the guest draft |
| `app/api/try-bill/preview/route.ts` | Public, rate-limited preview API (read-only) |
| `app/api/try-bill/claim/route.ts` | Authenticated endpoint that converts draft to real `Contract` + `Bill` + `PvcCalculation` |
| `app/try-bill/components/try-bill-form.tsx` | Form section of the wizard |
| `app/try-bill/components/preview-card.tsx` | PVC preview card |

## Modified Files

| File | Change |
|------|--------|
| `app/page.tsx` | Add *"Try it free — no signup"* secondary CTA |
| `app/middleware.ts` | Allowlist `/try-bill` and `/api/try-bill/preview` |
| `app/auth/signup/page.tsx` | Read `tryBillDraft` token from query and pass it to `/api/try-bill/claim` after signup |
| `app/api/signup/route.ts` | Return the new user session/token so the claim call can be authenticated |

---

## Data Model

No new Prisma models. The draft shape (TypeScript interface only):

```ts
interface GuestBillDraft {
  agreementNo: string;
  contractorName: string;
  baseMonth: string;       // YYYY-MM-DD
  dateOfMeasurement: string; // YYYY-MM-DD
  grossBillAmount: number;
  workClassificationId?: string;
  zone: string;
  fuelPriceType?: 'four_city_avg' | 'zone_city';
}
```

Stored in `localStorage` under key `irpvc_guest_draft`.

---

## API Details

### `POST /api/try-bill/preview`

Public. Rate-limited by IP (using existing `lib/rate-limit-db.ts`).

Request body: `GuestBillDraft`

Response:
```json
{
  "preview": {
    "quarter": "Q1-2025",
    "labourPvc": 1234.56,
    "plantMachineryPvc": 789.01,
    "fuelPowerPvc": 456.78,
    "otherMaterialsPvc": 321.09,
    "cementPvc": 0,
    "steelPvc": 0,
    "explosivesPvc": 0,
    "totalPvc": 2801.44
  },
  "indices": {
    "labour": 154.3,
    "fuel": 142.1,
    ...
  }
}
```

Implementation:
- Validate input (same rules as `POST /api/bills`).
- Compute quarter from `dateOfMeasurement`.
- Fetch quarterly averages via existing `getQuarterlyAverages`.
- Run `calculateClassificationBasedPvcWithComponents` with a default classification.
- Do **not** write to DB.

### `POST /api/try-bill/claim`

Authenticated. Uses existing `validateApiAccess`.

Request body:
```json
{
  "draft": { /* GuestBillDraft */ }
}
```

Behavior:
1. Validate `draft`.
2. Normalize agreement number and check for duplicates.
3. Create `Contract` for the authenticated user.
4. Create `Bill` + `PvcCalculation` + `BillTransaction` (free trial if eligible).
5. Return `{ contractId, billId }`.
6. Clear `localStorage` draft on the client.

This endpoint reuses existing Prisma writes from `POST /api/contracts` and `POST /api/bills` (either by calling shared helpers or by duplicating the minimal logic).

---

## Auth Changes

Update `app/middleware.ts` public allowlist:

```ts
if (pathname.startsWith('/try-bill') ||
    pathname.startsWith('/api/try-bill/preview')) {
  return NextResponse.next();
}
```

`/api/try-bill/claim` remains protected by `validateApiAccess`.

---

## UI/UX Notes

- The guest form should match the existing design system (`shadcn` Card, Button, Input, Select).
- Show inline validation errors (same messages as authenticated form).
- Disable the *Download PDF* button until preview is generated.
- After signup, show a brief loading state while claim runs.
- If the user closes the tab and returns, `localStorage` restores the draft.

---

## Security & Abuse

- Preview endpoint rate-limited by IP (20/hour) using `lib/rate-limit-db.ts`.
- No DB writes on preview; cannot pollute production data.
- Draft token passed to signup is signed with `NEXTAUTH_SECRET` and short-lived (15 minutes) to prevent tampering.
- Claim endpoint validates ownership and duplicate agreement numbers.

---

## Out of Scope

- AI PDF extraction for guests.
- Bulk bill creation for guests.
- Multiple draft management.
- Guest contract/bill persistence before signup.
- Watermarked preview PDF (preview is numbers only).

---

## Success Criteria

1. A logged-out visitor can land on `/try-bill`, fill the form, and see a PVC preview within 3 seconds.
2. Clicking *Save & Download* redirects to signup.
3. After signup, the bill exists under the new user's account and the PDF downloads.
4. `tsc --noEmit` and existing tests still pass.
5. No anonymous records are left in the database.
