# Guest Try-Bill Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-out visitors enter a minimal bill on a public `/try-bill` page, see a PVC preview, then sign up and have the bill saved to their new account so they can download the IR Standard PDF.

**Architecture:** A dedicated public guest wizard stores the draft in `localStorage`. A read-only, rate-limited `/api/try-bill/preview` endpoint computes PVC without touching the DB. After signup, an authenticated `/api/try-bill/claim` endpoint creates the real `Contract`, `Bill`, and `PvcCalculation` records by reusing existing Prisma helpers.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Prisma, NextAuth, Vitest.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/middleware.ts` | Allowlist `/try-bill` and `/api/try-bill/preview` |
| `app/page.tsx` | Add secondary "Try it free — no signup" CTA |
| `app/try-bill/types.ts` | Shared `GuestBillDraft` shape |
| `app/try-bill/lib/preview-calculation.ts` | Pure helper that builds PVC preview from draft |
| `app/api/try-bill/preview/route.ts` | Public rate-limited preview endpoint |
| `app/api/try-bill/claim/route.ts` | Authenticated endpoint that persists draft as real records |
| `app/try-bill/components/try-bill-form.tsx` | Guest form UI |
| `app/try-bill/components/preview-card.tsx` | PVC preview UI |
| `app/try-bill/page.tsx` | Public page composing form + preview + signup CTA |
| `app/auth/signup/page.tsx` | After signup, call claim endpoint and redirect to PDF |
| `app/try-bill/lib/preview-calculation.test.ts` | Unit tests for preview math |

---

## Task 1: Allowlist public try-bill routes in middleware

**Files:**
- Modify: `app/middleware.ts`

- [ ] **Step 1: Add `/try-bill` and `/api/try-bill/preview` to the public allowlist**

Edit `app/middleware.ts`. After the existing `pathname.startsWith('/api/external/')` line inside the auth-allowlist block, add:

```ts
      pathname.startsWith('/api/try-bill/preview') ||
```

Then add a new public-page block before the token check:

```ts
  // Allow public try-bill landing page
  if (pathname.startsWith('/try-bill')) {
    return NextResponse.next();
  }
```

Place it immediately before the root-path block (`if (pathname === '/') {`).

- [ ] **Step 2: Verify middleware syntax**

Run:
```bash
cd /c/irpvc/app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/irpvc && git add app/middleware.ts
git commit -m "feat(try-bill): allowlist public try-bill routes"
```

---

## Task 2: Add "Try it free" CTA on landing page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Insert a secondary CTA next to the existing "Get Started Now" button**

In `app/page.tsx`, locate the hero CTA block around the "Get Started Now" `<Link>`/`<Button>`. Add a second button immediately after it:

```tsx
                <Link href="/try-bill">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-semibold bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all duration-300 flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-blue-600" />
                    Try it free — no signup
                  </Button>
                </Link>
```

Make sure `Calculator` is imported from `lucide-react` in the existing import block.

- [ ] **Step 2: Verify the import**

Confirm the import line near the top of `app/page.tsx` includes `Calculator`:

```tsx
import {
  Train, Shield, Calculator, ArrowRight, BarChart3,
  ...
} from 'lucide-react';
```

- [ ] **Step 3: Run type check**

```bash
cd /c/irpvc/app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /c/irpvc && git add app/page.tsx
git commit -m "feat(try-bill): add try-it-free CTA on landing page"
```

---

## Task 3: Create shared try-bill types

**Files:**
- Create: `app/try-bill/types.ts`

- [ ] **Step 1: Write the guest draft interface**

```ts
export interface GuestBillDraft {
  agreementNo: string;
  contractorName: string;
  dateOfOpening: string; // YYYY-MM-DD
  dateOfMeasurement: string; // YYYY-MM-DD
  grossBillAmount: number;
  workClassificationCode?: string;
  zone: string;
  fuelPriceType: 'four_city_avg' | 'zone_city';
}

export interface GuestPreviewResult {
  quarter: string;
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
  indices: Record<string, number>;
}

export const GUEST_DRAFT_STORAGE_KEY = 'irpvc_guest_draft';
```

- [ ] **Step 2: Commit**

```bash
cd /c/irpvc && git add app/try-bill/types.ts
git commit -m "feat(try-bill): add guest draft types"
```

---

## Task 4: Build the preview calculation helper

**Files:**
- Create: `app/try-bill/lib/preview-calculation.ts`
- Create: `app/try-bill/lib/preview-calculation.test.ts`

This helper is pure (no DB writes) and is used by both the preview API and unit tests.

- [ ] **Step 1: Write the helper**

```ts
import {
  calculateClassificationBasedPvcWithComponents,
  getQuarterFromDate,
  getBaseMonth,
} from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getFuelIndexNameForBill, getSteelIndexNamesForZone } from '@/lib/zone-steel-city-mapping';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import type { GuestBillDraft, GuestPreviewResult } from '@/app/try-bill/types';

export async function calculateGuestPreview(
  draft: GuestBillDraft
): Promise<GuestPreviewResult> {
  const dateOfOpening = new Date(draft.dateOfOpening);
  const measurementDate = new Date(draft.dateOfMeasurement);

  if (isNaN(dateOfOpening.getTime()) || isNaN(measurementDate.getTime())) {
    throw new Error('Invalid date format');
  }

  const baseMonth = getBaseMonth(dateOfOpening);

  if (measurementDate <= baseMonth) {
    throw new Error('Measurement date must be after the contract base month');
  }

  const grossAmount = Number(draft.grossBillAmount);
  if (!grossAmount || grossAmount <= 0) {
    throw new Error('Gross bill amount must be greater than zero');
  }

  const classification = await getClassificationOrDefault(draft.workClassificationCode);
  if (!classification) {
    throw new Error('No work classification found');
  }

  const components = {
    fixed: classification.fixed ?? 0,
    labour: classification.labour ?? 0,
    steel: classification.steel ?? 0,
    cement: classification.cement ?? 0,
    plantMachinery: classification.plantMachinery ?? 0,
    fuel: classification.fuel ?? 0,
    otherMaterials: classification.otherMaterials ?? 0,
    explosives: classification.explosives ?? 0,
  };

  const quarter = getQuarterFromDate(measurementDate, baseMonth);

  const steelIndexNames = getSteelIndexNamesForZone(draft.zone);
  const fuelIndexName = getFuelIndexNameForBill(draft.zone, draft.fuelPriceType);

  const priceIndexNames = [
    'Labour',
    'RBI Plant Machinery',
    fuelIndexName,
    'RBI Other Materials',
    'RBI Cement',
    'RBI Explosives',
    ...steelIndexNames,
  ];

  const quarterlyAverages = await getQuarterlyAverages(
    quarter,
    priceIndexNames,
    baseMonth,
    'auto'
  );

  const pvc = calculateClassificationBasedPvcWithComponents(
    grossAmount,
    quarterlyAverages,
    components
  );

  const indices: Record<string, number> = {};
  for (const avg of quarterlyAverages) {
    indices[avg.indexName] = avg.average;
  }

  return {
    quarter,
    ...pvc,
    indices,
  };
}
```

- [ ] **Step 2: Write the unit test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateGuestPreview } from './preview-calculation';

vi.mock('@/lib/db-utils', () => ({
  getQuarterlyAverages: vi.fn(async () => [
    { indexName: 'Labour', average: 150, baseValue: 130 },
    { indexName: 'RBI Plant Machinery', average: 90, baseValue: 84 },
    { indexName: 'MPNG Fuel', average: 100, baseValue: 93 },
    { indexName: 'RBI Other Materials', average: 160, baseValue: 154 },
    { indexName: 'RBI Cement', average: 140, baseValue: 137 },
    { indexName: 'RBI Explosives', average: 200, baseValue: 190 },
    { indexName: 'Steel TMT Bars', average: 75000, baseValue: 70150 },
    { indexName: 'Steel Angle/Channel', average: 74000, baseValue: 69740 },
    { indexName: 'Steel Plates', average: 76000, baseValue: 75540 },
    { indexName: 'Steel Other Sections', average: 73000, baseValue: 71810 },
  ]),
}));

vi.mock('@/lib/classification-helper', () => ({
  getClassificationOrDefault: vi.fn(async () => ({
    id: 'cls-1',
    code: '5A',
    name: 'Earthwork',
    fixed: 0,
    labour: 50,
    steel: 0,
    cement: 0,
    plantMachinery: 15,
    fuel: 15,
    otherMaterials: 5,
    explosives: 0,
  })),
}));

describe('calculateGuestPreview', () => {
  it('computes PVC for a valid draft', async () => {
    const draft = {
      agreementNo: 'TEST/2024/001',
      contractorName: 'Test Contractor',
      dateOfOpening: '2024-01-01',
      dateOfMeasurement: '2024-06-15',
      grossBillAmount: 100000,
      workClassificationCode: '5A',
      zone: 'SR',
      fuelPriceType: 'four_city_avg' as const,
    };

    const result = await calculateGuestPreview(draft);

    expect(result.quarter).toBe('Q2-2024');
    expect(result.totalPvc).toBeGreaterThan(0);
    expect(result.labourPvc).toBeGreaterThan(0);
    expect(result.indices['Labour']).toBe(150);
  });

  it('throws for measurement date before base month', async () => {
    const draft = {
      agreementNo: 'TEST/2024/002',
      contractorName: 'Test Contractor',
      dateOfOpening: '2024-06-01',
      dateOfMeasurement: '2024-01-15',
      grossBillAmount: 100000,
      zone: 'SR',
      fuelPriceType: 'four_city_avg' as const,
    };

    await expect(calculateGuestPreview(draft)).rejects.toThrow('after the base month');
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
cd /c/irpvc/app && npx vitest run app/try-bill/lib/preview-calculation.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 4: Commit**

```bash
cd /c/irpvc && git add app/try-bill/lib
git commit -m "feat(try-bill): add guest preview calculation helper and tests"
```

---

## Task 5: Create the public preview API

**Files:**
- Create: `app/api/try-bill/preview/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { calculateGuestPreview } from '@/app/try-bill/lib/preview-calculation';
import type { GuestBillDraft } from '@/app/try-bill/types';
import { checkDbRateLimit } from '@/lib/rate-limit-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const REQUIRED_FIELDS: (keyof GuestBillDraft)[] = [
  'agreementNo',
  'contractorName',
  'dateOfOpening',
  'dateOfMeasurement',
  'grossBillAmount',
  'zone',
  'fuelPriceType',
];

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimit = await checkDbRateLimit(`try-bill-preview:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many preview requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as Partial<GuestBillDraft>;

    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === '') {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    const draft: GuestBillDraft = {
      agreementNo: String(body.agreementNo).trim(),
      contractorName: String(body.contractorName).trim(),
      dateOfOpening: String(body.dateOfOpening),
      dateOfMeasurement: String(body.dateOfMeasurement),
      grossBillAmount: Number(body.grossBillAmount),
      workClassificationCode: body.workClassificationCode,
      zone: String(body.zone),
      fuelPriceType: body.fuelPriceType as 'four_city_avg' | 'zone_city',
    };

    if (!draft.agreementNo || !draft.contractorName) {
      return NextResponse.json({ error: 'Invalid agreement number or contractor name' }, { status: 400 });
    }

    if (Number.isNaN(draft.grossBillAmount) || draft.grossBillAmount <= 0) {
      return NextResponse.json({ error: 'Gross bill amount must be greater than zero' }, { status: 400 });
    }

    const preview = await calculateGuestPreview(draft);

    return NextResponse.json({ preview }, { status: 200 });
  } catch (error: any) {
    logger.error('[try-bill/preview] Error calculating preview:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to calculate preview' },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: Run type check**

```bash
cd /c/irpvc/app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/irpvc && git add app/api/try-bill/preview/route.ts
git commit -m "feat(try-bill): add public preview API"
```

---

## Task 6: Create the authenticated claim API

**Files:**
- Create: `app/api/try-bill/claim/route.ts`

This endpoint converts a guest draft into real records. It mirrors the relevant parts of `POST /api/contracts` and `POST /api/bills`.

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { normalizeAgreementNo } from '@/lib/railway-division-helper';
import { getBaseMonth, getQuarterFromDate } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import { calculateClassificationBasedPvcWithComponents } from '@/lib/pvc-calculations';
import { logger } from '@/lib/logger';
import type { GuestBillDraft } from '@/app/try-bill/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const draft: GuestBillDraft = body.draft;

    if (!draft) {
      return NextResponse.json({ error: 'Draft is required' }, { status: 400 });
    }

    const required = [
      'agreementNo',
      'contractorName',
      'dateOfOpening',
      'dateOfMeasurement',
      'grossBillAmount',
      'zone',
      'fuelPriceType',
    ];
    for (const field of required) {
      if ((draft as any)[field] === undefined || (draft as any)[field] === '') {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    const normalizedAgreementNo = normalizeAgreementNo(draft.agreementNo);
    if (!normalizedAgreementNo) {
      return NextResponse.json({ error: 'Invalid Agreement Number format' }, { status: 400 });
    }

    const existingContract = await prisma.contract.findFirst({
      where: {
        OR: [
          { agreementNo: { equals: normalizedAgreementNo, mode: 'insensitive' } },
          { agreementNo: { equals: draft.agreementNo.trim(), mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    if (existingContract) {
      return NextResponse.json(
        { error: 'Contract with this Agreement Number already exists' },
        { status: 409 }
      );
    }

    const dateOfOpening = new Date(draft.dateOfOpening);
    const measurementDate = new Date(draft.dateOfMeasurement);
    const baseMonthDate = getBaseMonth(dateOfOpening);

    if (isNaN(dateOfOpening.getTime()) || isNaN(measurementDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    if (measurementDate <= baseMonthDate) {
      return NextResponse.json(
        { error: 'Measurement date must be after the contract base month' },
        { status: 400 }
      );
    }

    const classification = await getClassificationOrDefault(draft.workClassificationCode);
    const workDescription = classification ? `${classification.code} - ${classification.name}` : 'General Work';

    const contract = await prisma.contract.create({
      data: {
        agreementNo: normalizedAgreementNo,
        contractorName: draft.contractorName,
        workDescription,
        workClassification: classification?.code || null,
        dateOfOpening,
        baseMonth: baseMonthDate,
        userId: user.id,
        pvcApplicable: true,
        hasRailwaySuppliedMaterials: false,
      },
    });

    const quarter = getQuarterFromDate(measurementDate, baseMonthDate);
    const grossBillAmount = Number(draft.grossBillAmount);
    const billNo = 'BILL-1';

    const contractBills = await prisma.bill.findMany({
      where: { contractId: contract.id },
      select: { pvcNumber: true },
    });
    let maxSequence = 0;
    for (const b of contractBills) {
      if (b.pvcNumber) {
        const parts = b.pvcNumber.split('/');
        const seq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(seq) && seq > maxSequence) maxSequence = seq;
      }
    }
    const sequenceNumber = String(maxSequence + 1).padStart(3, '0');
    const autoPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;

    const bill = await prisma.bill.create({
      data: {
        contractId: contract.id,
        billNo,
        grossBillAmount,
        billAmount: grossBillAmount,
        dateOfMeasurement: measurementDate,
        quarter,
        zone: draft.zone,
        fuelPriceType: draft.fuelPriceType,
        pvcNumber: autoPvcNumber,
        isChargeable: false,
        processingFee: 0,
        subClassifications: [],
        nonScheduleItems: [],
      },
    });

    const components = {
      fixed: classification?.fixed ?? 0,
      labour: classification?.labour ?? 0,
      steel: classification?.steel ?? 0,
      cement: classification?.cement ?? 0,
      plantMachinery: classification?.plantMachinery ?? 0,
      fuel: classification?.fuel ?? 0,
      otherMaterials: classification?.otherMaterials ?? 0,
      explosives: classification?.explosives ?? 0,
    };

    const steelIndexNames = getSteelIndexNamesForZone(draft.zone);
    const fuelIndexName = getFuelIndexNameForBill(draft.zone, draft.fuelPriceType);
    const allIndices = [
      'Labour',
      'RBI Plant Machinery',
      fuelIndexName,
      'RBI Other Materials',
      'RBI Cement',
      'RBI Explosives',
      ...steelIndexNames,
    ];

    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, baseMonthDate, 'auto');
    const pvc = calculateClassificationBasedPvcWithComponents(
      grossBillAmount,
      quarterlyAverages,
      components
    );

    await prisma.pvcCalculation.create({
      data: {
        contractId: contract.id,
        billId: bill.id,
        labourPvc: pvc.labourPvc,
        plantMachineryPvc: pvc.plantMachineryPvc,
        fuelPowerPvc: pvc.fuelPowerPvc,
        otherMaterialsPvc: pvc.otherMaterialsPvc,
        cementPvc: pvc.cementPvc,
        steelPvc: pvc.steelPvc,
        explosivesPvc: pvc.explosivesPvc,
        dedicatedCementPvc: 0,
        dedicatedSteelPvc: 0,
        dedicatedSteelTmtBarsPvc: 0,
        dedicatedSteelAngleChannelPvc: 0,
        dedicatedSteelPlatesPvc: 0,
        dedicatedSteelOtherSectionsPvc: 0,
        totalPvc: pvc.totalPvc,
        previousPvcTotal: 0,
        cumulativePvc: pvc.totalPvc,
      },
    });

    await prisma.billTransaction.create({
      data: {
        userId: user.id,
        billId: bill.id,
        amount: 0,
        originalAmount: 0,
        discount: 0,
        status: 'paid',
        isFree: true,
        paymentMethod: 'free_trial',
        paidAt: new Date(),
      },
    });

    const { getBillingSettings } = await import('@/lib/admin-settings');
    const billingSettings = await getBillingSettings();
    const freeTrialLimit = billingSettings.freeTrialBills || 1;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        freeTrialUsed: { increment: 1 },
        totalBillsProcessed: { increment: 1 },
      },
      select: { freeTrialUsed: true },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isTrialActive: updatedUser.freeTrialUsed < freeTrialLimit,
      },
    });

    return NextResponse.json({ contractId: contract.id, billId: bill.id }, { status: 201 });
  } catch (error: any) {
    logger.error('[try-bill/claim] Error claiming draft:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create bill' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Run type check**

```bash
cd /c/irpvc/app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/irpvc && git add app/api/try-bill/claim/route.ts
git commit -m "feat(try-bill): add authenticated draft claim API"
```

---

## Task 7: Build the guest form component

**Files:**
- Create: `app/try-bill/components/try-bill-form.tsx`

- [ ] **Step 1: Implement the form**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import type { GuestBillDraft } from '@/app/try-bill/types';

interface ClassificationOption {
  id: string;
  code: string;
  name: string;
}

interface TryBillFormProps {
  initialDraft: Partial<GuestBillDraft>;
  onSubmit: (draft: GuestBillDraft) => void;
  isLoading: boolean;
}

export function TryBillForm({ initialDraft, onSubmit, isLoading }: TryBillFormProps) {
  const zoneOptions = getRailwayZoneOptions();
  const [classifications, setClassifications] = useState<ClassificationOption[]>([]);
  const [formData, setFormData] = useState<GuestBillDraft>({
    agreementNo: initialDraft.agreementNo || '',
    contractorName: initialDraft.contractorName || '',
    dateOfOpening: initialDraft.dateOfOpening || '',
    dateOfMeasurement: initialDraft.dateOfMeasurement || '',
    grossBillAmount: initialDraft.grossBillAmount || 0,
    workClassificationCode: initialDraft.workClassificationCode || '',
    zone: initialDraft.zone || zoneOptions[0]?.value || 'SR',
    fuelPriceType: initialDraft.fuelPriceType || 'four_city_avg',
  });

  useEffect(() => {
    fetch('/api/classifications/active')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const options = Array.isArray(data)
          ? data.map((c: any) => ({ id: c.id, code: c.code, name: c.name }))
          : [];
        setClassifications(options);
      })
      .catch(() => setClassifications([]));
  }, []);

  const updateField = <K extends keyof GuestBillDraft>(field: K, value: GuestBillDraft[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter bill details</CardTitle>
        <CardDescription>
          Try IR-PVC with a single bill. No signup required for the preview.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agreementNo">Agreement Number</Label>
              <Input
                id="agreementNo"
                value={formData.agreementNo}
                onChange={(e) => updateField('agreementNo', e.target.value)}
                placeholder="SR/MAS/Civil/2024/001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractorName">Contractor Name</Label>
              <Input
                id="contractorName"
                value={formData.contractorName}
                onChange={(e) => updateField('contractorName', e.target.value)}
                placeholder="M/s Example Contractors"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfOpening">Date of Opening</Label>
              <Input
                id="dateOfOpening"
                type="date"
                value={formData.dateOfOpening}
                onChange={(e) => updateField('dateOfOpening', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfMeasurement">Date of Measurement</Label>
              <Input
                id="dateOfMeasurement"
                type="date"
                value={formData.dateOfMeasurement}
                onChange={(e) => updateField('dateOfMeasurement', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grossBillAmount">Gross Bill Amount (₹)</Label>
              <Input
                id="grossBillAmount"
                type="number"
                min={1}
                step="0.01"
                value={formData.grossBillAmount || ''}
                onChange={(e) => updateField('grossBillAmount', Number(e.target.value))}
                placeholder="100000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone">Railway Zone</Label>
              <Select value={formData.zone} onValueChange={(v) => updateField('zone', v)}>
                <SelectTrigger id="zone">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {zoneOptions.map((z) => (
                    <SelectItem key={z.value} value={z.value}>
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workClassificationCode">Work Classification</Label>
              <Select
                value={formData.workClassificationCode}
                onValueChange={(v) => updateField('workClassificationCode', v)}
              >
                <SelectTrigger id="workClassificationCode">
                  <SelectValue placeholder="Select classification (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {classifications.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuelPriceType">Fuel Price Type</Label>
              <Select
                value={formData.fuelPriceType}
                onValueChange={(v) => updateField('fuelPriceType', v as 'four_city_avg' | 'zone_city')}
              >
                <SelectTrigger id="fuelPriceType">
                  <SelectValue placeholder="Select fuel price type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="four_city_avg">4-City Average</SelectItem>
                  <SelectItem value="zone_city">Zone City</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Calculating...' : 'Calculate PVC Preview'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify `/api/classifications/active` exists**

Run:
```bash
ls /c/irpvc/app/app/api/classifications
```

If `active/route.ts` does not exist, add a minimal public endpoint in Task 8 instead of relying on it. (If it exists, continue.)

- [ ] **Step 3: Commit**

```bash
cd /c/irpvc && git add app/try-bill/components/try-bill-form.tsx
git commit -m "feat(try-bill): add guest bill form component"
```

---

## Task 8: Add a public classifications endpoint (if missing)

**Files:**
- Create: `app/api/classifications/active/route.ts` (only if it does not exist)

- [ ] **Step 1: Check if the endpoint exists**

```bash
ls /c/irpvc/app/app/api/classifications/active/route.ts
```

If the file exists, skip to Task 9.

- [ ] **Step 2: Create the endpoint**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const subClassifications = await prisma.subClassification.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });

    if (subClassifications.length > 0) {
      return NextResponse.json(subClassifications);
    }

    const legacy = await prisma.classification.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });

    return NextResponse.json(legacy);
  } catch (error) {
    console.error('Error fetching classifications:', error);
    return NextResponse.json([], { status: 500 });
  }
}
```

- [ ] **Step 3: Allowlist the endpoint in middleware**

In `app/middleware.ts`, add:

```ts
      pathname.startsWith('/api/classifications/active') ||
```

inside the public API allowlist block.

- [ ] **Step 4: Type check and commit**

```bash
cd /c/irpvc/app && npx tsc --noEmit
cd /c/irpvc && git add app/api/classifications/active/route.ts app/middleware.ts
git commit -m "feat(try-bill): add public active classifications endpoint"
```

---

## Task 9: Build the preview card component

**Files:**
- Create: `app/try-bill/components/preview-card.tsx`

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileDown } from 'lucide-react';
import type { GuestPreviewResult } from '@/app/try-bill/types';

interface PreviewCardProps {
  preview: GuestPreviewResult;
  onSignup: () => void;
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function PreviewCard({ preview, onSignup }: PreviewCardProps) {
  const rows = [
    { label: 'Labour PVC', value: preview.labourPvc },
    { label: 'Plant & Machinery PVC', value: preview.plantMachineryPvc },
    { label: 'Fuel & Power PVC', value: preview.fuelPowerPvc },
    { label: 'Other Materials PVC', value: preview.otherMaterialsPvc },
    { label: 'Cement PVC', value: preview.cementPvc },
    { label: 'Steel PVC', value: preview.steelPvc },
    { label: 'Explosives PVC', value: preview.explosivesPvc },
  ];

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle>PVC Preview</CardTitle>
        <CardDescription>
          Quarter: {preview.quarter}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) =>
            row.value !== 0 ? (
              <div key={row.label} className="flex justify-between rounded-lg bg-white px-4 py-3 border">
                <span className="text-slate-600">{row.label}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(row.value)}</span>
              </div>
            ) : null
          )}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-blue-600 px-6 py-4 text-white">
          <span className="text-lg font-medium">Total PVC</span>
          <span className="text-2xl font-bold">{formatCurrency(preview.totalPvc)}</span>
        </div>
        <Button size="lg" className="w-full" onClick={onSignup}>
          <FileDown className="mr-2 h-5 w-5" />
          Sign up to save & download PDF
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/irpvc && git add app/try-bill/components/preview-card.tsx
git commit -m "feat(try-bill): add PVC preview card component"
```

---

## Task 10: Build the public `/try-bill` page

**Files:**
- Create: `app/try-bill/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TryBillForm } from '@/app/try-bill/components/try-bill-form';
import { PreviewCard } from '@/app/try-bill/components/preview-card';
import type { GuestBillDraft, GuestPreviewResult } from '@/app/try-bill/types';
import { GUEST_DRAFT_STORAGE_KEY } from '@/app/try-bill/types';
import { toast } from 'react-hot-toast';

export default function TryBillPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Partial<GuestBillDraft>>({});
  const [preview, setPreview] = useState<GuestPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(GUEST_DRAFT_STORAGE_KEY);
      if (saved) {
        setDraft(JSON.parse(saved));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleSubmit = async (values: GuestBillDraft) => {
    setIsLoading(true);
    setPreview(null);

    try {
      const response = await fetch('/api/try-bill/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to calculate preview');
        return;
      }

      setPreview(data.preview);
      localStorage.setItem(GUEST_DRAFT_STORAGE_KEY, JSON.stringify(values));
    } catch (error) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = () => {
    const saved = localStorage.getItem(GUEST_DRAFT_STORAGE_KEY);
    if (saved) {
      router.push(`/auth/signup?tryBillDraft=local:${encodeURIComponent(saved)}`);
    } else {
      router.push('/auth/signup');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Try IR-PVC for free</h1>
          <p className="text-slate-600">
            Enter a few details and see your PVC calculation instantly. Sign up only when you want to download the PDF.
          </p>
        </div>
        <TryBillForm initialDraft={draft} onSubmit={handleSubmit} isLoading={isLoading} />
        {preview && <PreviewCard preview={preview} onSignup={handleSignup} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

```bash
cd /c/irpvc/app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/irpvc && git add app/try-bill/page.tsx
git commit -m "feat(try-bill): add public try-bill page"
```

---

## Task 11: Wire signup page to claim the guest draft

**Files:**
- Modify: `app/auth/signup/page.tsx`

- [ ] **Step 1: Read the draft token from the query string**

Near the top of the `SignUpPage` component, add:

```tsx
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
```

Then inside the component:

```tsx
const searchParams = useSearchParams();
const tryBillDraftParam = searchParams?.get('tryBillDraft');
```

- [ ] **Step 2: After successful signup, sign in and claim the draft**

Replace the success branch in `handleSubmit`:

```tsx
      if (response.ok) {
        if (data.requiresVerification) {
          router.push(`/auth/verify-notice?email=${encodeURIComponent(email)}`);
          return;
        }

        // Sign in so the claim call is authenticated
        const signInResult = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (signInResult?.error || !signInResult?.ok) {
          router.push(`/auth/signin?registered=true&email=${encodeURIComponent(email)}`);
          return;
        }

        if (tryBillDraftParam?.startsWith('local:')) {
          try {
            const draftJson = decodeURIComponent(tryBillDraftParam.slice(6));
            const draft = JSON.parse(draftJson);
            const claimRes = await fetch('/api/try-bill/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ draft }),
            });

            if (claimRes.ok) {
              const { billId } = await claimRes.json();
              localStorage.removeItem('irpvc_guest_draft');
              router.push(`/bills/${billId}`);
              return;
            }
          } catch (claimError) {
            console.error('Failed to claim try-bill draft:', claimError);
          }
        }

        router.push('/contracts');
      }
```

- [ ] **Step 3: Type check and commit**

```bash
cd /c/irpvc/app && npx tsc --noEmit
cd /c/irpvc && git add app/auth/signup/page.tsx
git commit -m "feat(try-bill): wire signup page to claim guest draft"
```

---

## Task 12: Full validation

- [ ] **Step 1: Run all unit tests**

```bash
cd /c/irpvc/app && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run type check**

```bash
cd /c/irpvc/app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
cd /c/irpvc/app && npm run lint
```

Expected: no new lint errors (fix any that appear).

- [ ] **Step 4: Manual smoke test checklist**

1. Start dev server: `cd /c/irpvc/app && npm run dev`
2. Log out / use incognito.
3. Visit `http://localhost:3000/try-bill`.
4. Fill the form and click *Calculate PVC Preview*.
5. Confirm preview appears.
6. Click *Sign up to save & download PDF*.
7. Complete signup.
8. Confirm redirect to the new bill page and that the bill is listed under the user's contracts.

- [ ] **Step 5: Final commit**

```bash
cd /c/irpvc && git add -A
git commit -m "feat(try-bill): complete guest try-bill flow"
```

---

## Spec Coverage Check

| Spec Requirement | Implementing Task |
|------------------|-------------------|
| Public `/try-bill` page | Task 10 |
| Minimal 5-field form | Task 7 |
| PVC preview | Tasks 4, 5, 9 |
| Signup gate | Tasks 9, 11 |
| Persist draft after signup | Tasks 6, 11 |
| Landing page CTA | Task 2 |
| Middleware allowlist | Task 1 (and Task 8) |
| Rate limiting | Task 5 |
| No DB writes on preview | Task 4/5 |
| Tests | Task 4 |

No placeholders remain. All type names (`GuestBillDraft`, `GuestPreviewResult`) are consistent between files.
