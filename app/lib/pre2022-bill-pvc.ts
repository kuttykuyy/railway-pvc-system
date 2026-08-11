/**
 * Pricing a real bill under the pre-2022 GCC clause.
 *
 * This sits between the database and `pvc-pre2022.ts`, which is pure arithmetic and
 * knows nothing about bills. Here we work out the quarter by the old rule, fetch the
 * index values, decide what comes out of the varying amount, and hand over.
 *
 * The index PLUMBING is shared with GCC-2022 on purpose — `getQuarterlyAverages` handles
 * the base-month lookup, the June 2026 series bridge, missing-month fallbacks and UTC
 * normalisation, and those are the same whichever clause is being priced. Only the
 * quarter months are ours, and they are passed in.
 */

import { prisma } from './db';
import { getQuarterlyAverages } from './db-utils';
import { resolvePre2022Setup, type ContractForPre2022 } from './pre2022-contract';
import {
  calculatePre2022Pvc,
  pre2022BaseMonth,
  pre2022QuarterFromDate,
  pre2022QuarterMonths,
  type Pre2022IndexPair,
  type Pre2022PvcResult,
  type Pre2022SteelSupply,
} from './pvc-pre2022';

/** Raised when a bill cannot be priced under this clause, always saying why. */
export class Pre2022PricingError extends Error {}

const LABOUR = 'Labour';
const OTHER_MATERIAL = 'RBI Other Materials';
const PLANT = 'RBI Plant Machinery';
const FUEL = 'WPI Fuel & Power';
const EXPLOSIVES = 'RBI Explosives';
const CEMENT = 'RBI Cement';
const STEEL_BARS = 'WPI Steel Bright Bars';
const STEEL_ANGLES = 'WPI Steel Angles & Channels';
const STEEL_PLATES = 'WPI Steel Flat Products';

export interface Pre2022BillPricing {
  quarter: string;
  baseMonth: Date;
  quarterMonths: Date[];
  workTypeLabel: string;
  /** True when the work type was proposed from the description rather than recorded. */
  workTypeProposed: boolean;
  result: Pre2022PvcResult;
  /** Anything the person signing should know, in plain words. */
  notes: string[];
}

interface BillLike {
  dateOfMeasurement: Date;
  grossBillAmount?: number | null;
  billAmount: number;
  railwaySuppliedMaterialValue?: number | null;
  extraItemsOutsidePvc?: number | null;
  cementAmount?: number | null;
  steelTmtBarsAmount?: number | null;
  steelAngleChannelAmount?: number | null;
  steelPlatesAmount?: number | null;
  steelOtherSectionsAmount?: number | null;
  contract: ContractForPre2022 & { dateOfOpening: Date };
}

/**
 * Clause 46A.9(4): any other section of steel takes the average of the three named
 * categories. It is not a published index, so it is averaged here — base and quarter
 * separately, because averaging the movements instead would weight them wrongly.
 */
function averageOfThree(pairs: Pre2022IndexPair[]): Pre2022IndexPair {
  return {
    base: pairs.reduce((sum, p) => sum + p.base, 0) / pairs.length,
    quarter: pairs.reduce((sum, p) => sum + p.quarter, 0) / pairs.length,
  };
}

export async function pricePre2022Bill(bill: BillLike): Promise<Pre2022BillPricing> {
  const setup = resolvePre2022Setup(bill.contract);

  if (!setup.isPre2022 || !setup.workType) {
    throw new Pre2022PricingError(
      'This contract is not on the pre-2022 clause, so it must not be priced with it.'
    );
  }

  const opening = new Date(bill.contract.dateOfOpening);
  const baseMonth = pre2022BaseMonth(opening);
  const quarter = pre2022QuarterFromDate(bill.dateOfMeasurement, opening);

  if (quarter === 'Q0') {
    throw new Pre2022PricingError(
      'The measurement date falls before this contract\'s first quarter, which starts the month '
      + 'after the tender opened. Check the measurement date.'
    );
  }

  const quarterMonths = pre2022QuarterMonths(quarter, opening);

  const cementValue = bill.cementAmount ?? 0;
  const steelBars = bill.steelTmtBarsAmount ?? 0;
  const steelAngles = bill.steelAngleChannelAmount ?? 0;
  const steelPlates = bill.steelPlatesAmount ?? 0;
  const steelOther = bill.steelOtherSectionsAmount ?? 0;

  // Only fetch what this bill actually needs, so a missing index for a category the
  // contract never supplied cannot stop an otherwise sound bill from being priced.
  const needed = [LABOUR, OTHER_MATERIAL, PLANT, FUEL];
  const percentages = setup.workType === 'minor-tunnelling-explosives';
  if (percentages) needed.push(EXPLOSIVES);
  if (cementValue > 0) needed.push(CEMENT);
  if (steelBars > 0 || steelOther > 0) needed.push(STEEL_BARS);
  if (steelAngles > 0 || steelOther > 0) needed.push(STEEL_ANGLES);
  if (steelPlates > 0 || steelOther > 0) needed.push(STEEL_PLATES);

  const averages = await getQuarterlyAverages(quarter, needed, baseMonth, 'auto', quarterMonths);
  const byName = new Map(averages.map((a: any) => [a.indexName, a]));

  const pairFor = (name: string): Pre2022IndexPair => {
    const row: any = byName.get(name);
    if (!row || !Number.isFinite(row.baseValue) || !Number.isFinite(row.average)) {
      throw new Pre2022PricingError(
        `No published values for "${name}" covering ${baseMonth.toISOString().slice(0, 7)} and `
        + `${quarter}. Import the 2011-12 WPI workbook, which carries April 2012 to April 2026, `
        + 'then price this bill again.'
      );
    }
    return { base: row.baseValue, quarter: row.average };
  };

  const steel: Pre2022SteelSupply[] = [];
  if (steelBars > 0) {
    steel.push({ category: 'Reinforcement bars and rounds (Cl.46A.9(1))', value: steelBars, index: pairFor(STEEL_BARS) });
  }
  if (steelAngles > 0) {
    steel.push({ category: 'Angles, channels and joists (Cl.46A.9(2))', value: steelAngles, index: pairFor(STEEL_ANGLES) });
  }
  if (steelPlates > 0) {
    steel.push({ category: 'Plates (Cl.46A.9(3))', value: steelPlates, index: pairFor(STEEL_PLATES) });
  }
  if (steelOther > 0) {
    steel.push({
      category: 'Other sections (Cl.46A.9(4), average of the three)',
      value: steelOther,
      index: averageOfThree([pairFor(STEEL_BARS), pairFor(STEEL_ANGLES), pairFor(STEEL_PLATES)]),
    });
  }

  // Railway-supplied material and extra items sit outside price variation, exactly as
  // they do under GCC-2022. Cement and steel are NOT taken out here — the calculator
  // removes them itself, because under this clause they are paid separately rather than
  // simply excluded.
  const gross = bill.grossBillAmount ?? bill.billAmount;
  const outsidePvc = (bill.railwaySuppliedMaterialValue ?? 0) + (bill.extraItemsOutsidePvc ?? 0);
  const grossValueOfWork = gross - outsidePvc;

  const result = calculatePre2022Pvc({
    workType: setup.workType,
    grossValueOfWork,
    ...(cementValue > 0 ? { cement: { value: cementValue, index: pairFor(CEMENT) } } : {}),
    ...(steel.length ? { steel } : {}),
    indices: {
      labour: pairFor(LABOUR),
      otherMaterial: pairFor(OTHER_MATERIAL),
      plantMachinery: pairFor(PLANT),
      fuel: pairFor(FUEL),
      ...(percentages ? { explosives: pairFor(EXPLOSIVES) } : {}),
    },
  });

  const notes: string[] = [
    'Priced under the pre-2022 price variation clause: quarters start the month after the tender '
    + 'opened, cement and steel are paid on the value supplied with no 85% factor, fuel is the WPI '
    + 'Fuel & Power group and steel is WPI mild steel.',
  ];
  if (setup.workTypeSource === 'from-description') {
    notes.push(
      `The work type "${setup.workTypeLabel}" was proposed from the work description and has not been `
      + 'confirmed against the tender. The percentages differ a great deal between work types.'
    );
  }
  if (outsidePvc > 0) {
    notes.push(`Rs ${outsidePvc.toFixed(2)} of railway-supplied material and extra items was left out of the varying amount.`);
  }

  return {
    quarter,
    baseMonth,
    quarterMonths,
    workTypeLabel: setup.workTypeLabel,
    workTypeProposed: setup.workTypeSource === 'from-description',
    result,
    notes,
  };
}

/** Load a bill and price it. Convenience for callers holding only an id. */
export async function pricePre2022BillById(billId: string): Promise<Pre2022BillPricing> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { contract: true },
  });
  if (!bill) throw new Pre2022PricingError('Bill not found');
  return pricePre2022Bill(bill as unknown as BillLike);
}
