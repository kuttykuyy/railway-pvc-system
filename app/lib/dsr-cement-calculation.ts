export interface DsrCementCoefficientLike {
  dsrCode: string;
  description: string;
  workUnit: string;
  cementQuantityPerUnit: number;
  cementUnit: string;
  source?: string | null;
}

export interface CementCalculationInput {
  dsrCode: string;
  description: string;
  unit: string;
  quantity: number;
  amount?: number;
  coefficient?: DsrCementCoefficientLike | null;
}

export interface CementCalculationResult {
  dsrCode: string;
  description: string;
  unit: string;
  quantity: number;
  amount: number;
  matched: boolean;
  cementQuantity: number;
  cementUnit: string | null;
  cementAmount: number | null;
  coefficient: number | null;
  coefficientSource: string | null;
  reason: string;
}

function normalizeCode(code: string): string {
  return String(code || '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .trim();
}

export function normalizeDsrCode(code: string): string {
  const normalized = normalizeCode(code);
  if (/^MIX-/i.test(normalized)) return normalized.toUpperCase();
  const match = normalized.match(/\d+(?:\.\d+)+/);
  return match ? match[0] : normalized;
}

export function inferCementCoefficientFromMix(
  description: string,
  unit: string,
): DsrCementCoefficientLike | null {
  if (!/\bcum\b/i.test(unit)) return null;

  const text = String(description || '').replace(/\s+/g, ' ');
  const mixes: Array<{ pattern: RegExp; code: string; coefficient: number; label: string }> = [
    { pattern: /1\s*:\s*1\s*:\s*2/i, code: 'MIX-1:1:2', coefficient: 0.61, label: 'cement concrete 1:1:2' },
    { pattern: /1\s*:\s*1\.5\s*:\s*3/i, code: 'MIX-1:1.5:3', coefficient: 0.4, label: 'cement concrete 1:1.5:3' },
    { pattern: /1\s*:\s*2\s*:\s*4/i, code: 'MIX-1:2:4', coefficient: 0.32, label: 'cement concrete 1:2:4' },
    { pattern: /1\s*:\s*3\s*:\s*6/i, code: 'MIX-1:3:6', coefficient: 0.22, label: 'cement concrete 1:3:6' },
    { pattern: /1\s*:\s*4\s*:\s*8/i, code: 'MIX-1:4:8', coefficient: 0.17, label: 'cement concrete 1:4:8' },
  ];

  const matched = mixes.find(mix => mix.pattern.test(text));
  if (!matched) return null;

  return {
    dsrCode: matched.code,
    description: matched.label,
    workUnit: 'Cum',
    cementQuantityPerUnit: matched.coefficient,
    cementUnit: 'MT',
    source: 'DSR 2021 cement consumption coefficient table, inferred from mix ratio',
  };
}

export function calculateDsrCementRequirement(
  items: CementCalculationInput[],
  cementRatePerUnit?: number | null
): CementCalculationResult[] {
  return items.map((item) => {
    const amount = Number(item.amount || 0);
    const quantity = Number(item.quantity || 0);
    const coefficient = item.coefficient;

    if (!coefficient || !coefficient.cementQuantityPerUnit) {
      return {
        dsrCode: normalizeDsrCode(item.dsrCode),
        description: item.description,
        unit: item.unit,
        quantity,
        amount,
        matched: false,
        cementQuantity: 0,
        cementUnit: null,
        cementAmount: null,
        coefficient: null,
        coefficientSource: null,
        reason: 'No DSR 2021 cement coefficient found for this item.',
      };
    }

    const cementQuantity = quantity * coefficient.cementQuantityPerUnit;
    const cementAmount = cementRatePerUnit && cementRatePerUnit > 0
      ? cementQuantity * cementRatePerUnit
      : null;

    return {
      dsrCode: normalizeDsrCode(item.dsrCode),
      description: item.description,
      unit: item.unit,
      quantity,
      amount,
      matched: true,
      cementQuantity,
      cementUnit: coefficient.cementUnit,
      cementAmount,
      coefficient: coefficient.cementQuantityPerUnit,
      coefficientSource: coefficient.source || 'DSR 2021 Analysis of Rates',
      reason: `Quantity ${quantity} x coefficient ${coefficient.cementQuantityPerUnit} ${coefficient.cementUnit}/${coefficient.workUnit}`,
    };
  });
}

export function summarizeCementCalculation(results: CementCalculationResult[]) {
  const matched = results.filter(result => result.matched);
  const unmatched = results.filter(result => !result.matched);
  const cementQuantity = matched.reduce((sum, result) => sum + result.cementQuantity, 0);
  const cementAmount = matched.reduce((sum, result) => sum + (result.cementAmount || 0), 0);

  return {
    matchedItemCount: matched.length,
    unmatchedItemCount: unmatched.length,
    cementQuantity,
    cementAmount,
    hasCementAmount: matched.some(result => result.cementAmount !== null),
  };
}
