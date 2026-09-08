/**
 * "Grouped under one class" comparison — the website's transparency card, shared with
 * the Telegram bot so both show the bill priced BOTH allowed ways.
 *
 * The item-by-item split is the GCC-2022 46A.6 method (classification fixed per BoQ
 * item by the tender). This compares the GENERAL (non-supply) work priced item by item
 * against the same value priced under ONE class — the group's "All items" (…A) class.
 * Steel-supply (…B TMT, …D structural) and cement-supply (…C) items are priced on their
 * own class either way, so they are pulled out and never swing the comparison.
 */
import { prisma } from './db';
import { inferMainClassification, looksCompositeWork } from './work-classification';
import { calculateDynamicClassificationPvc } from './pvc-calculations';

export interface SingleClassEntryInput {
  /** Classification code of the entry (e.g. "5A", "3B"). */
  code: string;
  amount: number;
  /** PVC already worked out for this entry, item by item. */
  totalPvc: number;
  steelTypes?: string[];
  /** Steel share (%) of the entry's class, used to spot steel-natured typed entries. */
  steelShare?: number;
}

export async function compareSingleClassification(o: {
  workDescription: string;
  entries: SingleClassEntryInput[];
  quarterlyAverages: any[];
  extractedSteelTypes: string[];
  /** Full item-by-item PVC of the bill (all components, every entry). */
  totalPvc: number;
}): Promise<any | null> {
  let steelTmtPvc = 0, steelTmtAmount = 0;
  let steelOtherPvc = 0, steelOtherAmount = 0;
  let cementSupplyPvc = 0, cementSupplyAmount = 0;
  let generalPvc = 0, generalAmount = 0;
  const generalByDigit: Record<string, number> = {};

  for (const entry of o.entries) {
    const amt = Number(entry.amount) || 0;
    if (amt <= 0) continue;
    const code = String(entry.code || '').trim().toUpperCase();
    const suffix = code.slice(-1);
    // A STEEL item is classified …B (TMT supply) or …D (structural), or tagged with a
    // steel type on a class whose steel share DOMINATES (>= 50%). A type tag alone is
    // not enough: general entries carry one merely to price their small steel share.
    const ownSteelTypes = Array.isArray(entry.steelTypes) ? entry.steelTypes : [];
    const steelShare = entry.steelShare ?? 0;
    const isSteelItem = suffix === 'B' || suffix === 'D' || (ownSteelTypes.length > 0 && steelShare >= 50);
    const isCementItem = !isSteelItem && suffix === 'C';
    const isTmt = suffix === 'B'
      || (suffix !== 'D' && ownSteelTypes.length > 0 && ownSteelTypes.every((t) => String(t).toUpperCase() === 'TMT'));
    if (isSteelItem) {
      if (isTmt) { steelTmtPvc += entry.totalPvc; steelTmtAmount += amt; }
      else { steelOtherPvc += entry.totalPvc; steelOtherAmount += amt; }
    } else if (isCementItem) {
      cementSupplyPvc += entry.totalPvc; cementSupplyAmount += amt;
    } else {
      generalPvc += entry.totalPvc; generalAmount += amt;
      const d0 = code.charAt(0);
      if (/[1-9]/.test(d0)) generalByDigit[d0] = (generalByDigit[d0] || 0) + amt;
    }
  }
  if (generalAmount <= 0) return null;

  const main = inferMainClassification(o.workDescription || '');
  const compositeInfo = looksCompositeWork(o.workDescription || '');
  const isCompositeWork = compositeInfo.isComposite || !!main.isMultiScope;
  const allClasses = await prisma.subClassification.findMany({
    where: { isActive: true },
    select: {
      id: true, code: true, name: true, groupId: true,
      fixed: true, labour: true, steel: true, cement: true,
      plantMachinery: true, fuel: true, otherMaterials: true, explosives: true,
    },
    orderBy: { code: 'asc' },
  });
  // Candidate SINGLE classes = each group's "All items" (…A) class. A single-scope work
  // has ONE candidate; a COMPOSITE work spans groups, so every group its general items
  // use is an equally arguable single class — try each.
  const candidateDigits = new Set<string>([String(main.code).charAt(0)]);
  if (isCompositeWork) {
    for (const d of Object.keys(generalByDigit)) candidateDigits.add(d);
  }
  const candidateClasses = [...candidateDigits]
    .map((d) => allClasses.find((c) => String(c.code).trim().toUpperCase() === `${d}A`)
      || allClasses.find((c) => String(c.code).trim() === d))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const scored: any[] = [];
  for (const cls of candidateClasses) {
    const r = await calculateDynamicClassificationPvc(generalAmount, o.quarterlyAverages, cls.code, o.extractedSteelTypes);
    if (!r.isProcessingFee) {
      scored.push({
        cls, generalPvc: r.totalPvc,
        matchPct: Math.round(((generalByDigit[String(cls.code).charAt(0)] || 0) / generalAmount) * 100),
      });
    }
  }
  // Shown class is picked by MATCH first, payout only as tie-break.
  scored.sort((a, b) => b.matchPct - a.matchPct || b.generalPvc - a.generalPvc);
  const winner = scored[0];
  if (!winner) return null;
  const allItemsClass = winner.cls;
  const supplyPvc = steelTmtPvc + steelOtherPvc + cementSupplyPvc;

  return {
    mainCode: main.code,
    mainLabel: main.label,
    composite: isCompositeWork ? { subWorkCount: compositeInfo.subWorkCount } : null,
    generalAmount,
    steel: {
      pvc: steelTmtPvc + steelOtherPvc, amount: steelTmtAmount + steelOtherAmount,
      tmt: { pvc: steelTmtPvc, amount: steelTmtAmount },
      other: { pvc: steelOtherPvc, amount: steelOtherAmount },
    },
    cement: { pvc: cementSupplyPvc, amount: cementSupplyAmount },
    current: { general: generalPvc, total: o.totalPvc },
    best: {
      id: allItemsClass.id, code: allItemsClass.code, name: allItemsClass.name, groupId: allItemsClass.groupId,
      fixed: allItemsClass.fixed, labour: allItemsClass.labour, steel: allItemsClass.steel, cement: allItemsClass.cement,
      plantMachinery: allItemsClass.plantMachinery, fuel: allItemsClass.fuel,
      otherMaterials: allItemsClass.otherMaterials, explosives: allItemsClass.explosives,
      generalPvc: winner.generalPvc,
      total: winner.generalPvc + supplyPvc,
    },
    candidates: scored.map((s) => ({
      code: s.cls.code, name: s.cls.name,
      total: s.generalPvc + supplyPvc,
      matchPct: s.matchPct,
    })),
    guideline: (() => {
      const entries = Object.entries(generalByDigit).sort((a, b) => b[1] - a[1]);
      const top = entries[0];
      return top ? {
        bestMatchDigit: top[0],
        bestMatchPct: Math.round((top[1] / generalAmount) * 100),
        inferredDigit: String(main.code).charAt(0),
      } : null;
    })(),
  };
}
