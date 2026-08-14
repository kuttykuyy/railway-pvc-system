import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The index values the stubbed database returns, keyed by index name. */
const INDEX_VALUES: Record<string, { baseValue: number; average: number }> = {
  'Labour': { baseValue: 100, average: 110 },
  'RBI Other Materials': { baseValue: 100, average: 105 },
  'RBI Plant Machinery': { baseValue: 100, average: 102 },
  'WPI Fuel & Power': { baseValue: 100, average: 120 },
  'RBI Explosives': { baseValue: 100, average: 130 },
  'RBI Cement': { baseValue: 100, average: 108 },
  'WPI Steel Bright Bars': { baseValue: 100, average: 90 },
  'WPI Steel Angles & Channels': { baseValue: 100, average: 120 },
  'WPI Steel Flat Products': { baseValue: 200, average: 240 },
};

/** Captures what the pricer asked the database for. */
const asked: { quarter?: string; names?: string[]; baseMonth?: Date; months?: Date[] } = {};
const missing = new Set<string>();

vi.mock('./db', () => ({ prisma: { bill: { findUnique: vi.fn() } } }));
vi.mock('./db-utils', () => ({
  getQuarterlyAverages: vi.fn(async (quarter: string, names: string[], baseMonth: Date, _m: string, months?: Date[]) => {
    asked.quarter = quarter;
    asked.names = names;
    asked.baseMonth = baseMonth;
    asked.months = months;
    return names
      .filter(n => !missing.has(n))
      .map(n => ({ indexName: n, quarter, ...INDEX_VALUES[n] }));
  }),
}));

const { Pre2022PricingError, pricePre2022Bill } = await import('./pre2022-bill-pvc');

const CONTRACT = {
  dateOfOpening: new Date(Date.UTC(2021, 7, 20)), // 20 August 2021
  workDescription: 'Provision of Subways (RUBs) by Open Cut Method in lieu of Manned Level Crossings',
};

const billOn = (measured: Date, extra: Record<string, unknown> = {}) => ({
  dateOfMeasurement: measured,
  billAmount: 1_000_000,
  contract: CONTRACT,
  ...extra,
}) as any;

beforeEach(() => {
  missing.clear();
});

describe('using the old quarter rule, not the new one', () => {
  it('asks for the months the old clause says, a month later than GCC-2022 would', async () => {
    // Measured November 2021. Old clause: quarters start September, so this is Q1 and
    // the months are Sep-Oct-Nov. GCC-2022 would call it Q2 and average Nov-Dec-Jan.
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2021, 10, 15))));
    expect(priced.quarter).toBe('Q1-2021');
    expect(asked.months?.map(m => m.toISOString().slice(0, 7))).toEqual(['2021-09', '2021-10', '2021-11']);
  });

  it('takes the base month from 28 days before opening', async () => {
    await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15))));
    expect(asked.baseMonth?.toISOString().slice(0, 7)).toBe('2021-07');
  });

  it('refuses a measurement date before the first quarter', async () => {
    await expect(pricePre2022Bill(billOn(new Date(Date.UTC(2021, 7, 25)))))
      .rejects.toThrow(/before this contract's first quarter/i);
  });
});

describe('what goes into the varying amount', () => {
  it('takes cement and steel out, and pays them separately', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), {
      cementAmount: 100_000,
      steelTmtBarsAmount: 50_000,
    }));
    expect(priced.result.varyingAmount).toBe(850_000);
    const names = priced.result.components.map(c => c.name);
    expect(names).toContain('Cement supplied');
    expect(names.some(n => n.startsWith('Steel supplied'))).toBe(true);
  });

  it('leaves railway-supplied material and extra items out altogether', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), {
      railwaySuppliedMaterialValue: 100_000,
      extraItemsOutsidePvc: 50_000,
    }));
    expect(priced.result.grossValueOfWork).toBe(850_000);
    expect(priced.notes.some(n => /left out of the varying amount/i.test(n))).toBe(true);
  });

  it('prefers the gross bill amount when there is one', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), { grossBillAmount: 2_000_000 }));
    expect(priced.result.grossValueOfWork).toBe(2_000_000);
  });
});

describe('cement and steel carried in classification entries', () => {
  // An uploaded bill leaves the dedicated fields empty and carries the same money in
  // entries whose codes end in C (cement) and B (steel) — the GCC-2022 convention.
  const entries = [
    { amount: 2330888.69, subClassification: { code: '5C' } },
    { amount: 2316702.05, steelTypes: ['TMT'], subClassification: { code: '5B' } },
    { amount: 500000, subClassification: { code: '5A' } },
  ];

  it('separates them even when the dedicated fields are empty', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), {
      billAmount: 7493336.22,
      classificationEntries: entries,
    }));
    expect(priced.result.cementValue).toBeCloseTo(2330888.69, 2);
    expect(priced.result.steelValue).toBeCloseTo(2316702.05, 2);
    expect(priced.result.varyingAmount).toBeCloseTo(7493336.22 - 2330888.69 - 2316702.05, 2);
    const names = priced.result.components.map(c => c.name);
    expect(names).toContain('Cement supplied');
    expect(names.some(n => n.startsWith('Steel supplied'))).toBe(true);
  });

  it('lets a hand-typed dedicated field win over the entries', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), {
      billAmount: 7493336.22,
      cementAmount: 100000,
      classificationEntries: entries,
    }));
    expect(priced.result.cementValue).toBe(100000);
    // Steel still comes from its entry — the override is per component, not all-or-nothing.
    expect(priced.result.steelValue).toBeCloseTo(2316702.05, 2);
  });

  it('splits a multi-type steel entry across the 46A.9 categories', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), {
      classificationEntries: [
        { amount: 90000, steelTypes: ['TMT', 'ANGLE_CHANNEL', 'PLATES'], subClassification: { code: '5B' } },
      ],
    }));
    const steelRows = priced.result.components.filter(c => c.name.startsWith('Steel supplied'));
    expect(steelRows).toHaveLength(3);
    steelRows.forEach(row => expect(row.appliedTo).toBeCloseTo(30000, 6));
  });
});

describe('the four steel categories', () => {
  it('averages the three named ones for other sections, as Cl.46A.9(4) says', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), { steelOtherSectionsAmount: 30_000 }));
    const other = priced.result.components.find(c => c.name.includes('Other sections'));
    // Bases 100, 100, 200 -> 133.33. Quarters 90, 120, 240 -> 150.
    expect(other?.baseIndex).toBeCloseTo(133.3333, 3);
    expect(other?.quarterIndex).toBeCloseTo(150, 6);
  });

  it('averages the levels, not the movements', async () => {
    // Averaging the three percentage movements would give (-10 + 20 + 20)/3 = +10%.
    // Averaging the levels gives 150/133.33 = +12.5%. The clause says the categories are
    // averaged, so the second is right and the difference is real money.
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), { steelOtherSectionsAmount: 100_000 }));
    const other = priced.result.components.find(c => c.name.includes('Other sections'))!;
    expect(other.amount).toBeCloseTo(100_000 * (150 - 133.33) / 133.33, 0);
  });

  it('only asks for the steel indices the bill actually uses', async () => {
    await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)), { steelTmtBarsAmount: 10_000 }));
    expect(asked.names).toContain('WPI Steel Bright Bars');
    expect(asked.names).not.toContain('WPI Steel Flat Products');
    expect(asked.names).not.toContain('RBI Cement');
  });
});

describe('when something is missing', () => {
  it('says which index is missing and what to do about it', async () => {
    missing.add('WPI Fuel & Power');
    await expect(pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15)))))
      .rejects.toThrow(/WPI Fuel & Power.*2011-12 WPI workbook/is);
  });

  it('will not price a contract that is not on the old clause', async () => {
    const modern = billOn(new Date(Date.UTC(2025, 4, 15)));
    modern.contract = { ...CONTRACT, dateOfOpening: new Date(Date.UTC(2025, 0, 10)) };
    await expect(pricePre2022Bill(modern)).rejects.toThrow(Pre2022PricingError);
  });
});

describe('what it tells the person signing', () => {
  it('says the work type was only proposed, when it was', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15))));
    expect(priced.workTypeProposed).toBe(true);
    expect(priced.notes.some(n => /not been confirmed/i.test(n))).toBe(true);
  });

  it('stops saying so once the work type is recorded', async () => {
    const recorded = billOn(new Date(Date.UTC(2023, 4, 15)));
    recorded.contract = { ...CONTRACT, pre2022WorkType: 'earthwork-bridges-ballast-tunnelling' };
    const priced = await pricePre2022Bill(recorded);
    expect(priced.workTypeProposed).toBe(false);
    expect(priced.notes.some(n => /not been confirmed/i.test(n))).toBe(false);
  });

  it('always says which clause it priced under', async () => {
    const priced = await pricePre2022Bill(billOn(new Date(Date.UTC(2023, 4, 15))));
    expect(priced.notes[0]).toMatch(/pre-2022 price variation clause/i);
  });
});
