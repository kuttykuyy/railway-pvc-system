import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The exact regression: the admin "Import as Final" button (app/api/indices/wpi-import
 * POST with isProvisional=false) is precisely the moment a newer month lands as
 * settled, and it is exactly when older months most need re-checking against the
 * database's new "latest two" — but the reclassification used to run only inside
 * `if (isProvisional)`, so importing as FINAL was the one case that skipped it. That
 * is how March and April were reported stuck showing provisional after May and June
 * arrived as final through this button.
 */

const priceIndex = {
  upsert: vi.fn().mockResolvedValue({}),
  findMany: vi.fn(),
};
const monthlyIndexValue = {
  upsert: vi.fn().mockResolvedValue({}),
  findMany: vi.fn(),
  updateMany: vi.fn().mockResolvedValue({ count: 0 }),
};
vi.mock('./db', () => ({ prisma: { priceIndex, monthlyIndexValue } }));

const { updateIndicesFromWPI } = await import('./wpi-fetcher');

describe('updateIndicesFromWPI — "Import as Final" (isProvisional=false)', () => {
  beforeEach(() => {
    priceIndex.upsert.mockClear();
    monthlyIndexValue.upsert.mockClear();
    monthlyIndexValue.updateMany.mockClear().mockResolvedValue({ count: 0 });

    // findMany is called two shapes: no args (the main import loop, wants every
    // index) and a WPI-scoped `where` (reapplyWpiProvisionalRule).
    priceIndex.findMany.mockImplementation((args?: any) => {
      const all = [{ id: 'cement', name: 'RBI Cement' }];
      if (!args) return Promise.resolve(all);
      return Promise.resolve(all); // both are WPI here, so same result either way
    });
    monthlyIndexValue.findMany.mockResolvedValue([
      { month: new Date(Date.UTC(2026, 5, 1)) }, // June
      { month: new Date(Date.UTC(2026, 4, 1)) }, // May
      { month: new Date(Date.UTC(2026, 3, 1)) }, // April — should become final
      { month: new Date(Date.UTC(2026, 2, 1)) }, // March — should become final
    ]);
  });

  it('still reclassifies older months even though this call itself is not provisional', async () => {
    const wpiData = [{
      commName: 'e. Manufacture of cement, lime and plaster',
      commCode: '1313050000',
      commWeight: 1,
      series: 'old' as const,
      monthlyValues: [{ month: new Date(Date.UTC(2026, 5, 1)), value: 95.6 }],
    }];

    await updateIndicesFromWPI(wpiData, false);

    // The regression check: reclassification must run regardless of the isProvisional
    // argument, because reapplyWpiProvisionalRule always queries the database's own
    // latest-two, not this call's data.
    expect(monthlyIndexValue.updateMany).toHaveBeenCalled();
    const finalizeCall = monthlyIndexValue.updateMany.mock.calls.find(
      (c: any[]) => c[0]?.data?.isProvisional === false,
    );
    expect(finalizeCall).toBeTruthy();
    expect(finalizeCall[0].where.month.notIn).toEqual([
      new Date(Date.UTC(2026, 5, 1)),
      new Date(Date.UTC(2026, 4, 1)),
    ]);
  });
});
