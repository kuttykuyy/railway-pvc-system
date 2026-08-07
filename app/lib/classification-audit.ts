/**
 * Checks the component percentages the app actually prices with against the GCC 46A.6
 * table.
 *
 * The live figures live in the `sub_classifications` table, seeded from
 * lib/gcc-classifications-data.ts once and editable in admin ever since. That file was
 * verified row by row against the printed GCC table (all 35 rows, zero mismatches), so
 * it is the reference — and anything in the database that has drifted from it is
 * changing every PVC computed under that classification, silently. Nothing else in the
 * app would ever say so.
 *
 * Read-only. Repairing is a separate, deliberate action.
 */

import { prisma } from './db';
import { GCC_CLASSIFICATIONS } from './gcc-classifications-data';

export const COMPONENT_KEYS = [
  'fixed', 'labour', 'steel', 'cement', 'plantMachinery', 'fuel', 'otherMaterials', 'explosives',
] as const;

export type ComponentKey = typeof COMPONENT_KEYS[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  fixed: 'Fixed',
  labour: 'Labour',
  steel: 'Steel',
  cement: 'Cement',
  plantMachinery: 'Plant & machinery',
  fuel: 'Fuel',
  otherMaterials: 'Other materials',
  explosives: 'Explosives',
};

export interface ComponentDrift {
  component: ComponentKey;
  label: string;
  gcc: number;
  live: number;
}

export interface AuditRow {
  code: string;
  name: string;
  /** Percentages differing from the GCC table. */
  drift: ComponentDrift[];
  /** What the live row's components add up to. The GCC table is 100 on every row. */
  liveTotal: number;
  totalIsWrong: boolean;
}

export interface ClassificationAudit {
  checkedAt: string;
  liveCount: number;
  gccCount: number;
  /** Rows whose percentages no longer match the GCC table. */
  drifted: AuditRow[];
  /** Live rows whose components do not add to 100, whatever the GCC says. */
  badTotals: AuditRow[];
  /** In the GCC table but not in the database — nothing can be classified as these. */
  missing: string[];
  /** In the database but not in the GCC table — a code the clause does not define. */
  unknown: Array<{ code: string; name: string }>;
  clean: boolean;
}

export async function auditClassificationPercentages(): Promise<ClassificationAudit> {
  const live = await prisma.subClassification.findMany({
    select: {
      code: true, name: true, isActive: true,
      fixed: true, labour: true, steel: true, cement: true,
      plantMachinery: true, fuel: true, otherMaterials: true, explosives: true,
    },
    orderBy: { code: 'asc' },
  });

  const gccByCode = new Map(GCC_CLASSIFICATIONS.map(c => [c.code.toUpperCase(), c]));
  const liveCodes = new Set(live.map(r => r.code.toUpperCase()));

  const drifted: AuditRow[] = [];
  const badTotals: AuditRow[] = [];
  const unknown: Array<{ code: string; name: string }> = [];

  for (const row of live) {
    const gcc = gccByCode.get(row.code.toUpperCase());
    const liveTotal = Math.round(
      COMPONENT_KEYS.reduce((sum, key) => sum + (Number((row as any)[key]) || 0), 0) * 100,
    ) / 100;
    const totalIsWrong = Math.abs(liveTotal - 100) > 0.005;

    if (!gcc) {
      unknown.push({ code: row.code, name: row.name });
      // A code the clause does not define still has to add to 100 to price anything.
      if (totalIsWrong) badTotals.push({ code: row.code, name: row.name, drift: [], liveTotal, totalIsWrong });
      continue;
    }

    const drift: ComponentDrift[] = [];
    for (const key of COMPONENT_KEYS) {
      const expected = Number((gcc.components as any)[key]) || 0;
      const actual = Number((row as any)[key]) || 0;
      if (Math.abs(expected - actual) > 0.005) {
        drift.push({ component: key, label: COMPONENT_LABELS[key], gcc: expected, live: actual });
      }
    }

    const auditRow: AuditRow = { code: row.code, name: row.name, drift, liveTotal, totalIsWrong };
    if (drift.length > 0) drifted.push(auditRow);
    if (totalIsWrong) badTotals.push(auditRow);
  }

  const missing = GCC_CLASSIFICATIONS
    .map(c => c.code)
    .filter(code => !liveCodes.has(code.toUpperCase()));

  return {
    checkedAt: new Date().toISOString(),
    liveCount: live.length,
    gccCount: GCC_CLASSIFICATIONS.length,
    drifted,
    badTotals,
    missing,
    unknown,
    clean: drifted.length === 0 && badTotals.length === 0 && missing.length === 0,
  };
}

/**
 * Puts drifted rows back to the GCC figures.
 *
 * Only touches codes the clause defines, and only the eight percentages — names,
 * descriptions and group membership are left alone. Returns what changed, so the
 * repair is as accountable as the drift it fixes.
 */
export async function restoreClassificationPercentages(codes?: string[]): Promise<{
  repaired: Array<{ code: string; changed: ComponentDrift[] }>;
}> {
  const audit = await auditClassificationPercentages();
  const wanted = codes?.length ? new Set(codes.map(c => c.toUpperCase())) : null;
  const targets = audit.drifted.filter(row => !wanted || wanted.has(row.code.toUpperCase()));

  const repaired: Array<{ code: string; changed: ComponentDrift[] }> = [];
  for (const row of targets) {
    const gcc = GCC_CLASSIFICATIONS.find(c => c.code.toUpperCase() === row.code.toUpperCase());
    if (!gcc) continue;
    await prisma.subClassification.update({
      where: { code: row.code },
      data: Object.fromEntries(COMPONENT_KEYS.map(key => [key, Number((gcc.components as any)[key]) || 0])),
    });
    repaired.push({ code: row.code, changed: row.drift });
  }
  return { repaired };
}
