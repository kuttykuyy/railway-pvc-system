/**
 * The verification checklist an accounts/audit office works through before passing a
 * PVC proposal for payment.
 *
 * Every item here is something the office checks anyway, and something the app already
 * knows — so it shows the computed value beside each and asks only for the tick. That
 * turns "passed for payment" from a bare status into a record of what was actually
 * verified, which is what answers a query six months later.
 *
 * Nothing here decides anything. A flag of "attention" means look closely, not stop.
 */

import { prisma } from './db';
import { getBaseMonth } from './pvc-calculations';
import { inferMainClassification, looksCompositeWork } from './work-classification';

export type CheckTone = 'ok' | 'attention' | 'info';

export interface ChecklistItem {
  key: string;
  label: string;
  /** What the app computed, for the officer to check against the papers. */
  value: string;
  /** Why it matters, in the words an accounts office would use. */
  note?: string;
  tone: CheckTone;
}

const money = (v: number | null | undefined) =>
  `${(v ?? 0) < 0 ? '−' : ''}₹${Math.abs(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthYear = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' }) : '—';

const day = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Builds the checklist for one bill. Returns null when the bill has no calculation —
 * there is nothing to vet.
 */
export async function buildAccountsChecklist(billId: string): Promise<ChecklistItem[] | null> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      contract: {
        select: {
          agreementNo: true, baseMonth: true, dateOfOpening: true, contractValue: true,
          fuelPriceType: true, isExtended: true, extensionType: true, originalCompletionDate: true,
          workDescription: true,
        },
      },
      pvcCalculation: true,
      classificationEntries: { include: { subClassification: { select: { code: true, name: true } } } },
    },
  });
  if (!bill || !bill.pvcCalculation) return null;

  const items: ChecklistItem[] = [];
  const pvc = bill.pvcCalculation;

  // 1. Base month — the single figure that shifts every quarter if it is wrong.
  const expectedBase = bill.contract.dateOfOpening ? getBaseMonth(new Date(bill.contract.dateOfOpening)) : null;
  const baseMatches = expectedBase
    && new Date(bill.contract.baseMonth).getFullYear() === expectedBase.getFullYear()
    && new Date(bill.contract.baseMonth).getMonth() === expectedBase.getMonth();
  items.push({
    key: 'base_month',
    label: 'Base month',
    value: `${monthYear(bill.contract.baseMonth)} (tender closing ${day(bill.contract.dateOfOpening)})`,
    note: baseMatches
      ? 'Month before the tender closing date, as GCC 46A requires. If the tender was NEGOTIATED, the base month must be the month of negotiation instead (MoR, Mar 1988) — CAG found Rs 20+ crore excess where the opening month was used after negotiation (Report 5/2021, para 3.1.5.1).'
      : 'Does NOT sit one month before the recorded closing date — check the tender papers. If the tender was negotiated, the negotiation month governs (MoR, Mar 1988).',
    tone: baseMatches ? 'ok' : 'attention',
  });

  // 1b. Extra (non-schedule) items take their OWN base month — the month the competent
  // authority approved their operation, not the tender month (CR clarification,
  // Dec 2013; CAG Report 5/2021 para 3.1.5.2 found excess where the tender month was
  // used). The app prices them off the contract base month, so a bill that carries
  // them needs the officer's eye.
  const extraItems = Array.isArray(bill.nonScheduleItems) ? (bill.nonScheduleItems as any[]) : [];
  if (extraItems.length > 0) {
    const extraTotal = extraItems.reduce((sum, it: any) => sum + (Number(it?.amount) || 0), 0);
    items.push({
      key: 'extra_items_base',
      label: 'Extra (non-schedule) items — base month',
      value: `${extraItems.length} extra item(s), ${money(extraTotal)}`,
      note: 'PVC on an extra item should use the month its operation was ADMINISTRATIVELY APPROVED as base month, not the tender month. Verify against the approval; the statement prices them off the contract base month.',
      tone: 'attention',
    });
  }

  // 2. Quarter and measurement date.
  items.push({
    key: 'quarter',
    label: 'Quarter and measurement date',
    value: `${bill.quarter} · measured ${day(bill.dateOfMeasurement)}`,
    note: bill.contract.isExtended && bill.contract.extensionType === '17B'
      ? `17B extension — indices frozen at the original completion date (${day(bill.contract.originalCompletionDate)}).`
      : undefined,
    tone: 'info',
  });

  // 3. Provisional indices — the commonest reason a passed bill has to be reopened.
  items.push({
    key: 'indices_final',
    label: 'Indices published as final',
    value: pvc.usedProvisionalIndices ? 'One or more indices were provisional when computed' : 'All indices final',
    note: pvc.usedProvisionalIndices
      ? 'The figure will change when the final indices are published. Passing now commits to a number that is not settled.'
      : undefined,
    tone: pvc.usedProvisionalIndices ? 'attention' : 'ok',
  });

  // 4. Classification split — what the PVC was actually computed on.
  const entryTotal = bill.classificationEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const codes = [...new Set(bill.classificationEntries.map((e) => e.subClassification?.code).filter(Boolean))] as string[];
  const splitMatches = Math.abs(entryTotal - bill.grossBillAmount) < 1;
  items.push({
    key: 'classification',
    label: 'Classification of the bill value',
    value: `${money(entryTotal)} across ${codes.length} sub-classification(s): ${codes.join(', ') || '—'}`,
    note: splitMatches
      ? 'Ties to the gross bill amount.'
      : `Does not tie to the gross bill of ${money(bill.grossBillAmount)} — difference ${money(entryTotal - bill.grossBillAmount)}.`,
    tone: splitMatches ? 'ok' : 'attention',
  });

  // 4b. Classification matches the NATURE of the work (GCC 46A.6). The classification is
  // fixed by the tender per BoQ item — it is not a payout choice. Flag any code that does
  // not belong to the main group the work description implies, so a bill that was collapsed
  // onto a higher-paying single classification (or otherwise mis-classified) is caught here
  // rather than passed. EXCEPTION — a COMPOSITE work (one agreement enumerating several
  // sub-works: "(i) roof renewal … (vi) class room conversion", or one whose name puts
  // several groups in scope) has no single main group: items spanning groups is its
  // correct shape, and flagging them made every composite bill read as suspect.
  const requiredMain = inferMainClassification(bill.contract.workDescription || '');
  const composite = looksCompositeWork(bill.contract.workDescription || '');
  const isComposite = composite.isComposite || !!requiredMain.isMultiScope;
  const outOfGroup = codes.filter((c) => !String(c).startsWith(requiredMain.code));
  const singleCollapsed = codes.length === 1 && bill.classificationEntries.length === 1;
  const classMismatch = !isComposite && outOfGroup.length > 0;
  items.push({
    key: 'classification_nature',
    label: 'Classification matches the work (GCC 46A.6)',
    value: isComposite
      ? `Composite work${composite.subWorkCount >= 2 ? ` (${composite.subWorkCount} sub-works)` : ''}. Bill uses: ${codes.join(', ') || '—'}`
      : `Work implies main group ${requiredMain.code} — ${requiredMain.label}. Bill uses: ${codes.join(', ') || '—'}`,
    note: isComposite
      ? (singleCollapsed
          ? 'A composite work priced under ONE classification — that cannot fit every sub-work. Check each item against its own sub-work.'
          : 'Several sub-works in one agreement, so items rightly span groups — each item takes the class of ITS sub-work (roofing → Buildings, track → its group, steel supply → …B). Verify each against its schedule, not against one main group.')
      : classMismatch
        ? `These codes are outside main group ${requiredMain.code}: ${outOfGroup.join(', ')}. Classification is fixed by the tender per item — verify against the tender, not the payout.`
        : singleCollapsed
          ? 'Whole bill is one classification. Confirm the tender really classifies all items this way (46A.6 is per BoQ item).'
          : 'All codes belong to the work\'s main group.',
    tone: classMismatch ? 'attention' : singleCollapsed ? 'attention' : isComposite ? 'info' : 'ok',
  });

  // 5. Railway-supplied material, which GCC 46A excludes from W.
  const supplied = Number(bill.railwaySuppliedMaterialValue) || 0;
  items.push({
    key: 'railway_material',
    label: 'Railway-supplied material excluded',
    value: supplied > 0 ? `${money(supplied)} deducted` : 'None recorded on this bill',
    note: 'GCC 46A defines W as excluding material supplied by the Railway, free or at fixed rate.',
    tone: 'info',
  });

  // 6. Fuel basis — railways differ, and the wrong one changes the fuel component.
  const fuelBasis = bill.fuelPriceType || bill.contract.fuelPriceType || 'four_city_avg';
  items.push({
    key: 'fuel_basis',
    label: 'Fuel price basis',
    value: fuelBasis === 'zone_city' ? 'Zone city rate' : 'Average of 4 cities (PPAC, GCC 46A.7)',
    note: 'Must match this agreement\'s own terms — zones differ on this.',
    tone: 'info',
  });

  // 7. Eligibility. GCC 46A.1 puts the floor at Rs 2 Cr.
  const value = Number(bill.contract.contractValue) || 0;
  items.push({
    key: 'eligibility',
    label: 'PVC eligibility (GCC 46A.1)',
    value: value > 0 ? `Contract value ${money(value)}` : 'Contract value not recorded',
    note: value > 0
      ? (value >= 20000000 ? 'At or above the Rs 2 Cr floor.' : 'Below the Rs 2 Cr floor — PVC needs the tender condition that allows it.')
      : 'Cannot be checked from the app; verify against the agreement.',
    tone: value === 0 ? 'attention' : value >= 20000000 ? 'ok' : 'attention',
  });

  // 7b. Value of work done vs the contract value — the inflated-bill catch. CAG found
  // Rs 9.54 crore paid on PVC bills whose gross value of work was inflated (by exactly
  // Rs 10 crore per bill) and passed unnoticed (Report 5/2021 para 3.1.6.3, NFR). The
  // running total of billed work materially above the agreement value is the visible
  // symptom, so it is surfaced here rather than assumed checked.
  try {
    const billedAgg = await prisma.bill.aggregate({
      where: { contractId: bill.contractId },
      _sum: { grossBillAmount: true },
    });
    const billedToDate = Number(billedAgg._sum.grossBillAmount) || 0;
    if (value > 0 && billedToDate > 0) {
      // Variations legitimately push work beyond the agreement value; 125% is the
      // customary vitiation threshold, so only a clear overshoot is flagged.
      const over = billedToDate > value * 1.25;
      items.push({
        key: 'billed_vs_contract',
        label: 'Work billed vs contract value',
        value: `${money(billedToDate)} billed to date against agreement value ${money(value)}`,
        note: over
          ? 'Billed value exceeds 125% of the agreement value — confirm sanctioned variations cover it. CAG para 3.1.6.3 records PVC paid on inflated work values that vetting missed.'
          : 'Within the agreement value plus the customary variation margin.',
        tone: over ? 'attention' : 'ok',
      });
    }
  } catch { /* the checklist must never fail over this */ }

  // 8. Cumulative carried forward from the previous bill.
  items.push({
    key: 'cumulative',
    label: 'Cumulative PVC',
    value: `${money(pvc.previousPvcTotal)} carried forward + ${money(pvc.totalPvc)} this bill = ${money(pvc.cumulativePvc)}`,
    note: 'Check against the abstract for the agreement.',
    tone: 'info',
  });

  // 9. GST, which the amount includes.
  items.push({
    key: 'gst',
    label: 'GST basis',
    value: `PVC ${money(pvc.totalPvc)} is inclusive of GST`,
    note: 'W is the gross value of work done, which carries GST. The bill-wise split is in the abstract.',
    tone: 'info',
  });

  return items;
}

/** What is stored against the bill when accounts pass it. */
export interface StoredVerification {
  verified: string[];
  unverified: string[];
  at: string;
  by: string;
}
