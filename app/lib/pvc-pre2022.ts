/**
 * Price variation for contracts under the PRE-2022 General Conditions of Contract.
 *
 * This is a second calculator, not an option on the first one. A tender that closed
 * before GCC April 2022 is priced under a clause that differs from GCC-2022 in the
 * percentage table, the quarter rule, what the varying amount is, and which published
 * indices feed it — so little is shared that threading both through one calculator would
 * put every current contract at risk to serve the old ones. `pvc-calculations.ts` is not
 * touched by any of this and keeps pricing GCC-2022 contracts exactly as before.
 *
 * Verified against the agreement for tender 367-DRM-W-GNT-TId-2433, closing 20/08/2021
 * (RUBs at LC 50 & 46, Guntur-Nadikudi). Differences from GCC-2022:
 *
 *   base month     the month containing the day 28 days before OPENING, where GCC-2022
 *                  takes the month before CLOSING
 *   quarters       begin the month after the OPENING month, not after the base month —
 *                  which is one month later than GCC-2022 lands for the same contract
 *   work types     six, with no A-E sub-classes
 *   cement, steel  taken OUT of the varying amount and paid on the value actually
 *                  supplied, at the full index movement — GCC-2022 instead carries them
 *                  as percentages within the group and applies an 85% factor
 *   fuel index     the WPI Fuel & Power group, not the PPAC diesel price
 *   steel index    WPI mild steel per Clause 46A.9, not JPC ex-works rates
 *
 * Everything here is a pure function: no database, no index lookups. Callers fetch the
 * index values and pass them in, which is what makes the whole clause testable against
 * a statement worked by hand.
 */

/** The six work types of the pre-2022 Clause 46A.6 table. */
export type Pre2022WorkType =
  | 'earthwork-bridges-ballast-tunnelling'
  | 'minor-tunnelling-explosives'
  | 'major-important-bridges'
  | 'building'
  | 'permanent-way-linking'
  | 'other-works-manual';

export interface Pre2022Percentages {
  labour: number;
  otherMaterial: number;
  plantMachinery: number;
  fuel: number;
  explosives: number;
  /** Carries no index and never varies. Present so the split visibly sums to 100. */
  fixed: number;
}

/**
 * Clause 46A.6, copied from the agreement. Each column sums to 100 and there is no
 * cement or steel row — those sit outside this table entirely, which is the structural
 * difference from GCC-2022 and the reason `varyingAmount` below is net of them.
 */
export const PRE_2022_WORK_TYPES: Record<Pre2022WorkType, { label: string; percentages: Pre2022Percentages }> = {
  'earthwork-bridges-ballast-tunnelling': {
    label: 'Earthwork, Bridges, Ballast supply and Tunnelling not involving explosives',
    percentages: { labour: 20, otherMaterial: 10, plantMachinery: 30, fuel: 25, explosives: 0, fixed: 15 },
  },
  'minor-tunnelling-explosives': {
    label: 'Minor works and Tunnelling involving explosives',
    percentages: { labour: 20, otherMaterial: 15, plantMachinery: 15, fuel: 15, explosives: 20, fixed: 15 },
  },
  'major-important-bridges': {
    label: 'Major and Important Bridges',
    percentages: { labour: 20, otherMaterial: 30, plantMachinery: 20, fuel: 15, explosives: 0, fixed: 15 },
  },
  building: {
    label: 'Building works',
    percentages: { labour: 40, otherMaterial: 35, plantMachinery: 5, fuel: 5, explosives: 0, fixed: 15 },
  },
  'permanent-way-linking': {
    label: 'Permanent Way linking works',
    percentages: { labour: 50, otherMaterial: 5, plantMachinery: 15, fuel: 15, explosives: 0, fixed: 15 },
  },
  'other-works-manual': {
    label: 'Other works done manually',
    percentages: { labour: 20, otherMaterial: 20, plantMachinery: 30, fuel: 15, explosives: 0, fixed: 15 },
  },
};

/** How many days before opening the base month is read from. */
const BASE_MONTH_DAYS_BEFORE_OPENING = 28;

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function assertUsableDate(date: Date | null | undefined, what: string): Date {
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${what} provided for a pre-2022 GCC calculation`);
  }
  const year = date.getUTCFullYear();
  if (year < 1970 || year > 2100) {
    throw new Error(`${what} year must be between 1970 and 2100, got ${year}`);
  }
  return date;
}

/**
 * The base month: the month containing the day 28 days before the tender opened.
 *
 * Note this can land in the same month as the opening — a tender opening on the 30th
 * takes its base from the 2nd of that same month. GCC-2022's "month before closing"
 * never can, which is exactly why this cannot be folded into the other calculator.
 */
export function pre2022BaseMonth(dateOfOpening: Date): Date {
  const opening = assertUsableDate(dateOfOpening, 'date of opening');
  const shifted = new Date(opening.getTime() - BASE_MONTH_DAYS_BEFORE_OPENING * 86400000);
  return firstOfMonth(shifted);
}

/**
 * The month the first quarter starts in: the month after the month the tender opened.
 *
 * Deliberately taken from the opening date rather than from the base month. For a tender
 * opening 20/08/2021 the base month is July and the first quarter starts in September —
 * so anchoring on the base month, as GCC-2022 does, would start every quarter a month
 * early and put each bill in the wrong one.
 */
export function pre2022FirstQuarterMonth(dateOfOpening: Date): Date {
  const opening = assertUsableDate(dateOfOpening, 'date of opening');
  return new Date(Date.UTC(opening.getUTCFullYear(), opening.getUTCMonth() + 1, 1));
}

/** Whole months from `from` to `to`, negative when `to` is earlier. */
function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

/**
 * Which quarter a measurement date falls in, as `Q3-2022`.
 *
 * Returns `Q0` for a date before the first quarter — the same signal the GCC-2022
 * calculator uses — rather than throwing, so a caller can report it plainly.
 */
export function pre2022QuarterFromDate(date: Date, dateOfOpening: Date): string {
  const measured = assertUsableDate(date, 'measurement date');
  const start = pre2022FirstQuarterMonth(dateOfOpening);

  const monthsFromStart = monthsBetween(start, measured);
  if (monthsFromStart < 0) return 'Q0';

  const quarterNum = Math.floor(monthsFromStart / 3) + 1;
  const quarterStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (quarterNum - 1) * 3, 1));
  return `Q${quarterNum}-${quarterStart.getUTCFullYear()}`;
}

/** The three months whose index values are averaged for a quarter. */
export function pre2022QuarterMonths(quarter: string, dateOfOpening: Date): Date[] {
  if (quarter === 'Q0') {
    throw new Error('Measurement date is before the first quarter of this contract.');
  }
  const parsed = /^Q(\d+)-(\d{4})$/.exec(quarter || '');
  if (!parsed) {
    throw new Error(`Invalid quarter: ${quarter}. Expected a value like Q3-2022.`);
  }
  const quarterNum = parseInt(parsed[1], 10);
  if (quarterNum < 1 || quarterNum > 1000) {
    throw new Error(`Invalid quarter number: Q${quarterNum}`);
  }

  const start = pre2022FirstQuarterMonth(dateOfOpening);
  const firstMonth = start.getUTCMonth() + (quarterNum - 1) * 3;
  return [0, 1, 2].map(offset => new Date(Date.UTC(start.getUTCFullYear(), firstMonth + offset, 1)));
}

/** A base value and a quarter average for one published series. */
export interface Pre2022IndexPair {
  base: number;
  quarter: number;
}

/** One steel category under Clause 46A.9, with the value supplied against it. */
export interface Pre2022SteelSupply {
  /** For the statement — e.g. 'Reinforcement bars (Cl.46A.9(1))'. */
  category: string;
  /** Gross value of this category supplied, in rupees. */
  value: number;
  index: Pre2022IndexPair;
}

export interface Pre2022PvcInput {
  workType: Pre2022WorkType;
  /** Gross value of work done in the bill, before anything is taken out. */
  grossValueOfWork: number;
  /**
   * Value of cement supplied, and the WPI Cement, Lime & Plaster movement against it.
   * Omit when the contract supplied none.
   */
  cement?: { value: number; index: Pre2022IndexPair };
  /** Steel supplied, by Clause 46A.9 category. Omit or leave empty when none. */
  steel?: Pre2022SteelSupply[];
  indices: {
    labour: Pre2022IndexPair;
    otherMaterial: Pre2022IndexPair;
    plantMachinery: Pre2022IndexPair;
    fuel: Pre2022IndexPair;
    /** Required only for the work type that carries an explosives percentage. */
    explosives?: Pre2022IndexPair;
  };
}

export interface Pre2022PvcComponent {
  name: string;
  /** The rupee figure this component's percentage was applied to. */
  appliedTo: number;
  percentage: number;
  baseIndex: number;
  quarterIndex: number;
  amount: number;
}

export interface Pre2022PvcResult {
  workType: Pre2022WorkType;
  workTypeLabel: string;
  grossValueOfWork: number;
  cementValue: number;
  steelValue: number;
  /** Gross value of work less the cement and steel supplied — the amount the table works on. */
  varyingAmount: number;
  components: Pre2022PvcComponent[];
  totalPvc: number;
}

/**
 * The formula, matching the GCC-2022 calculator's arithmetic and rounding so the two
 * produce identical figures from identical inputs: the index difference is rounded to
 * two decimals first, as the printed statements do.
 */
function componentAmount(appliedTo: number, index: Pre2022IndexPair, percentage: number): number {
  if (!index.base) return 0;
  const movement = Math.round((index.quarter - index.base) * 100) / 100;
  return (appliedTo * movement * (percentage / 100)) / index.base;
}

function requireIndex(pair: Pre2022IndexPair | undefined, name: string): Pre2022IndexPair {
  // A missing index must stop the calculation, never quietly contribute zero. Zero is a
  // legitimate result when prices did not move, so it cannot also mean "no data" — that
  // is how a statement goes out understating what is owed and nobody notices.
  if (!pair || !Number.isFinite(pair.base) || !Number.isFinite(pair.quarter)) {
    throw new Error(`Missing ${name} index values for this quarter — cannot price this bill.`);
  }
  if (pair.base <= 0) {
    throw new Error(`Base ${name} index must be greater than zero, got ${pair.base}.`);
  }
  return pair;
}

/**
 * Price one bill under the pre-2022 clause.
 *
 * Cement and steel come out of the varying amount and are paid on the value actually
 * supplied, at the full index movement — there is no 85% factor in this clause.
 */
export function calculatePre2022Pvc(input: Pre2022PvcInput): Pre2022PvcResult {
  const workType = PRE_2022_WORK_TYPES[input.workType];
  if (!workType) {
    throw new Error(`Unknown pre-2022 work type: ${input.workType}`);
  }
  const pct = workType.percentages;

  const cementValue = input.cement?.value ?? 0;
  const steelSupplies = input.steel ?? [];
  const steelValue = steelSupplies.reduce((sum, s) => sum + s.value, 0);

  const varyingAmount = input.grossValueOfWork - cementValue - steelValue;
  if (varyingAmount < 0) {
    throw new Error(
      'Cement and steel supplied exceed the gross value of work done. Check the bill before pricing it.'
    );
  }

  const components: Pre2022PvcComponent[] = [];
  const add = (name: string, appliedTo: number, pair: Pre2022IndexPair, percentage: number) => {
    components.push({
      name,
      appliedTo,
      percentage,
      baseIndex: pair.base,
      quarterIndex: pair.quarter,
      amount: componentAmount(appliedTo, pair, percentage),
    });
  };

  add('Labour', varyingAmount, requireIndex(input.indices.labour, 'labour'), pct.labour);
  add('Other Materials', varyingAmount, requireIndex(input.indices.otherMaterial, 'other materials'), pct.otherMaterial);
  add('Plant & Machinery', varyingAmount, requireIndex(input.indices.plantMachinery, 'plant and machinery'), pct.plantMachinery);
  add('Fuel & Lubricants', varyingAmount, requireIndex(input.indices.fuel, 'fuel'), pct.fuel);

  if (pct.explosives > 0) {
    add('Explosives', varyingAmount, requireIndex(input.indices.explosives, 'explosives'), pct.explosives);
  }

  // Cement and steel take the whole index movement — the percentage is 100 because the
  // value supplied is already the exact amount at risk, not a share of a larger sum.
  if (cementValue > 0 && input.cement) {
    add('Cement supplied', cementValue, requireIndex(input.cement.index, 'cement'), 100);
  }
  for (const supply of steelSupplies) {
    if (supply.value <= 0) continue;
    add(`Steel supplied - ${supply.category}`, supply.value, requireIndex(supply.index, `steel (${supply.category})`), 100);
  }

  // The fixed portion is recorded so the statement shows the split adding to 100, but it
  // carries no index and contributes nothing.
  components.push({
    name: 'Fixed portion (no variation)',
    appliedTo: varyingAmount,
    percentage: pct.fixed,
    baseIndex: 0,
    quarterIndex: 0,
    amount: 0,
  });

  return {
    workType: input.workType,
    workTypeLabel: workType.label,
    grossValueOfWork: input.grossValueOfWork,
    cementValue,
    steelValue,
    varyingAmount,
    components,
    totalPvc: components.reduce((sum, c) => sum + c.amount, 0),
  };
}
