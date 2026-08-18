import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The invariant this fixes: of all months a WPI-mapped index holds any value for, the
 * two most recent are provisional and every earlier one is final. It used to be applied
 * only by the WPI cron's own import, computed from that import's file rather than the
 * database — so a manual entry, a bulk paste, or a spreadsheet import writing a newer
 * month directly as final left an older month stuck showing provisional forever, and
 * the display read backwards: the newest data looked settled, older data looked unsettled.
 */

const priceIndex = { findMany: vi.fn() };
const monthlyIndexValue = { findMany: vi.fn(), updateMany: vi.fn() };
vi.mock('./db', () => ({ prisma: { priceIndex, monthlyIndexValue } }));

const { reapplyWpiProvisionalRule } = await import('./wpi-fetcher');

const m = (y: number, mo: number) => new Date(Date.UTC(y, mo - 1, 1));

describe('reapplyWpiProvisionalRule', () => {
  beforeEach(() => {
    priceIndex.findMany.mockReset();
    monthlyIndexValue.findMany.mockReset();
    monthlyIndexValue.updateMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it('marks the two most recent months in the database provisional and everything earlier final', async () => {
    priceIndex.findMany.mockResolvedValue([{ id: 'cement' }, { id: 'explosives' }]);
    // Descending, as the real distinct+orderBy query returns.
    monthlyIndexValue.findMany.mockResolvedValue([
      { month: m(2026, 6) },
      { month: m(2026, 5) },
      { month: m(2026, 4) },
      { month: m(2026, 3) },
    ]);
    monthlyIndexValue.updateMany
      .mockResolvedValueOnce({ count: 8 })  // -> provisional
      .mockResolvedValueOnce({ count: 8 }); // -> final

    const result = await reapplyWpiProvisionalRule();

    expect(result.latestMonths).toEqual(['2026-06', '2026-05']);
    // The exact bug: April and March, previously marked provisional by an older run,
    // must flip to final now that May and June exist.
    expect(monthlyIndexValue.updateMany).toHaveBeenNthCalledWith(1, {
      where: { priceIndexId: { in: ['cement', 'explosives'] }, month: { in: [m(2026, 6), m(2026, 5)] }, isProvisional: false },
      data: { isProvisional: true, updatedAt: expect.any(Date) },
    });
    expect(monthlyIndexValue.updateMany).toHaveBeenNthCalledWith(2, {
      where: { priceIndexId: { in: ['cement', 'explosives'] }, month: { notIn: [m(2026, 6), m(2026, 5)] }, isProvisional: true },
      data: { isProvisional: false, updatedAt: expect.any(Date) },
    });
    expect(result.markedProvisional).toBe(8);
    expect(result.markedFinal).toBe(8);
  });

  it('does nothing when no WPI index exists yet', async () => {
    priceIndex.findMany.mockResolvedValue([]);
    const result = await reapplyWpiProvisionalRule();
    expect(result).toEqual({ latestMonths: [], markedProvisional: 0, markedFinal: 0 });
    expect(monthlyIndexValue.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when no month has any value yet', async () => {
    priceIndex.findMany.mockResolvedValue([{ id: 'cement' }]);
    monthlyIndexValue.findMany.mockResolvedValue([]);
    const result = await reapplyWpiProvisionalRule();
    expect(result).toEqual({ latestMonths: [], markedProvisional: 0, markedFinal: 0 });
    expect(monthlyIndexValue.updateMany).not.toHaveBeenCalled();
  });

  it('handles a single month of data as the whole "latest two"', async () => {
    priceIndex.findMany.mockResolvedValue([{ id: 'cement' }]);
    monthlyIndexValue.findMany.mockResolvedValue([{ month: m(2026, 1) }]);

    const result = await reapplyWpiProvisionalRule();

    expect(result.latestMonths).toEqual(['2026-01']);
    expect(monthlyIndexValue.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ month: { in: [m(2026, 1)] } }),
    }));
  });
});
