import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The bottleneck this closes: component percentages were re-read from the database once
 * per bill entry, and twice — the route read `steel` to pick steel types, then
 * calculateClassificationEntryPvc re-read the whole row. A bulk import of 20 bills at 12
 * entries each made 480 sequential round-trips for a few dozen distinct rows.
 */

const subClassification = { findUnique: vi.fn() };
const classification = { findUnique: vi.fn() };
vi.mock('./db', () => ({ prisma: { subClassification, classification } }));

const { getClassificationComponents } = await import('./pvc-calculations');

const ROW = { id: 'sub-1', code: '1A', steel: 12, cement: 8, labour: 30 };

describe('getClassificationComponents', () => {
  beforeEach(() => {
    subClassification.findUnique.mockReset().mockResolvedValue(ROW);
    classification.findUnique.mockReset().mockResolvedValue(null);
  });

  it('reads a sub-classification once however many entries ask for it', async () => {
    // Twelve entries on one bill, all the same classification — the shape that produced
    // the round-trip storm.
    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push(await getClassificationComponents('sub-repeat'));
    }

    expect(subClassification.findUnique).toHaveBeenCalledTimes(1);
    expect(results.every(r => r === ROW)).toBe(true);
  });

  it('still fetches a different classification separately', async () => {
    await getClassificationComponents('sub-a');
    await getClassificationComponents('sub-b');
    expect(subClassification.findUnique).toHaveBeenCalledTimes(2);
  });

  it('falls back to the classification table when there is no sub-classification', async () => {
    classification.findUnique.mockResolvedValue({ id: 'cls-1', steel: 0 });
    const row = await getClassificationComponents(undefined, 'cls-only');
    expect(row).toEqual({ id: 'cls-1', steel: 0 });
    expect(subClassification.findUnique).not.toHaveBeenCalled();
  });

  it('returns null without querying when given neither id', async () => {
    expect(await getClassificationComponents(undefined, undefined)).toBeNull();
    expect(subClassification.findUnique).not.toHaveBeenCalled();
    expect(classification.findUnique).not.toHaveBeenCalled();
  });

  it('remembers a miss, so a bad id in a bulk import is not re-queried per entry', async () => {
    subClassification.findUnique.mockResolvedValue(null);
    classification.findUnique.mockResolvedValue(null);

    for (let i = 0; i < 5; i++) {
      expect(await getClassificationComponents('sub-missing')).toBeNull();
    }
    expect(subClassification.findUnique).toHaveBeenCalledTimes(1);
  });
});
