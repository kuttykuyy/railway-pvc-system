import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The review dialog compares THREE ways to price a bill: item by item, and the two
 * nearest-matching single classes. These tests pin what makes an alternative "near"
 * and that offering one never changes the class the comparison already showed.
 */

const subClassification = { findMany: vi.fn() };
vi.mock('./db', () => ({ prisma: { subClassification } }));

const calculateDynamicClassificationPvc = vi.fn();
vi.mock('./pvc-calculations', () => ({ calculateDynamicClassificationPvc }));

const { compareSingleClassification } = await import('./single-classification');

const CLASSES = ['1', '2', '3', '5', '6', '7', '8'].map(d => ({
  id: `sub-${d}A`, code: `${d}A`, name: `Group ${d} — all items`, groupId: `grp-${d}`,
  fixed: 15, labour: 30, steel: 10, cement: 10, plantMachinery: 15, fuel: 10,
  otherMaterials: 10, explosives: 0,
}));

// Each class is given its own payout so a test can tell which one an option came from.
const PVC_BY_CODE: Record<string, number> = {
  '1A': 1000, '2A': 2000, '3A': 3000, '5A': 5000, '6A': 6000, '7A': 7000, '8A': 8000,
};

const run = (o: { workDescription: string; entries: any[]; totalPvc?: number }) =>
  compareSingleClassification({
    workDescription: o.workDescription,
    entries: o.entries,
    quarterlyAverages: [],
    extractedSteelTypes: [],
    totalPvc: o.totalPvc ?? 0,
  });

describe('compareSingleClassification — near-matching options', () => {
  beforeEach(() => {
    subClassification.findMany.mockReset().mockResolvedValue(CLASSES);
    calculateDynamicClassificationPvc.mockReset().mockImplementation(
      async (_amount: number, _avgs: any, code: string) => ({ totalPvc: PVC_BY_CODE[code] ?? 0, isProcessingFee: false }),
    );
  });

  it('offers the groups the bill\'s own items sit in, ranked by match', async () => {
    // Name of Work points at group 5 (Building Works); the items are mostly group 5,
    // some group 1. Both are arguable single classes — 5A shown, 1A the near one.
    const result = await run({
      workDescription: 'Construction of Station Building at Podanur',
      entries: [
        { code: '5A', amount: 800000, totalPvc: 4000 },
        { code: '1A', amount: 200000, totalPvc: 900 },
      ],
    });

    expect(result.best.code).toBe('5A');
    expect(result.options.map((option: any) => option.code)).toEqual(['5A', '1A']);
    expect(result.options[0].matchPct).toBe(80);
    expect(result.options[1].matchPct).toBe(20);
  });

  it('carries the full class on every option, so a bill can be regrouped under any of them', async () => {
    const result = await run({
      workDescription: 'Construction of Station Building at Podanur',
      entries: [
        { code: '5A', amount: 700000, totalPvc: 3500 },
        { code: '1A', amount: 300000, totalPvc: 1200 },
      ],
    });

    expect(result.options.length).toBe(2);
    for (const option of result.options) {
      expect(option.id).toBeTruthy();
      expect(option.groupId).toBeTruthy();
      expect(option.name).toBeTruthy();
      expect(typeof option.labour).toBe('number');
      expect(typeof option.total).toBe('number');
    }
  });

  it('adds a group the Name of Work names even when no item sits in it', async () => {
    // Multi-scope Name of Work: building works and earthwork both named as scope, but
    // every item was classified as earthwork. Group 5 is still an arguable grouping.
    const result = await run({
      workDescription: 'Construction of station building, station building extension, station '
        + 'building roof and station building flooring, together with earthwork in formation '
        + 'and earthwork in cutting',
      entries: [{ code: '1A', amount: 1000000, totalPvc: 5000 }],
    });

    expect(result.options[0].code).toBe('1A');
    expect(result.options[0].matchPct).toBe(100);
    expect(result.options.map((option: any) => option.code)).toContain('5A');
    expect(result.options.find((option: any) => option.code === '5A').matchPct).toBe(0);
  });

  it('keeps the shown class the one the main group points to on a single-scope work', async () => {
    // 1A pays less than 5A and fits fewer items, but the work is single-scope group 1:
    // a near alternative must never displace the class the comparison already showed.
    const result = await run({
      workDescription: 'Earthwork in formation for new line between A and B',
      entries: [
        { code: '1A', amount: 400000, totalPvc: 2000 },
        { code: '5A', amount: 600000, totalPvc: 3000 },
      ],
    });

    expect(result.best.code).toBe('1A');
    expect(result.options[0].code).toBe('1A');
    expect(result.options.map((option: any) => option.code)).toContain('5A');
  });

  it('leaves steel and cement supply out of the match, and identical on every option', async () => {
    const result = await run({
      workDescription: 'Construction of Station Building at Podanur',
      entries: [
        { code: '5A', amount: 600000, totalPvc: 3000 },
        { code: '1A', amount: 400000, totalPvc: 1600 },
        { code: '5B', amount: 500000, totalPvc: 2500 },
        { code: '5C', amount: 100000, totalPvc: 400 },
      ],
    });

    const supply = 2500 + 400;
    expect(result.steel.pvc).toBe(2500);
    expect(result.cement.pvc).toBe(400);
    expect(result.generalAmount).toBe(1000000);
    for (const option of result.options) {
      expect(option.total).toBeCloseTo(option.generalPvc + supply, 6);
    }
  });

  it('drops a class that prices as a processing fee', async () => {
    calculateDynamicClassificationPvc.mockImplementation(
      async (_amount: number, _avgs: any, code: string) => ({
        totalPvc: PVC_BY_CODE[code] ?? 0,
        isProcessingFee: code === '1A',
      }),
    );

    const result = await run({
      workDescription: 'Construction of Station Building at Podanur',
      entries: [
        { code: '5A', amount: 700000, totalPvc: 3500 },
        { code: '1A', amount: 300000, totalPvc: 1200 },
      ],
    });

    expect(result.options.map((option: any) => option.code)).not.toContain('1A');
  });
});
