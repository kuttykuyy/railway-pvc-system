import { describe, it, expect, vi } from 'vitest';
import { calculateGuestPreview } from './preview-calculation';

vi.mock('@/lib/db-utils', () => ({
  getQuarterlyAverages: vi.fn(async () => [
    { indexName: 'Labour', average: 150, baseValue: 130 },
    { indexName: 'RBI Plant Machinery', average: 90, baseValue: 84 },
    { indexName: 'MPNG Fuel', average: 100, baseValue: 93 },
    { indexName: 'RBI Other Materials', average: 160, baseValue: 154 },
    { indexName: 'RBI Cement', average: 140, baseValue: 137 },
    { indexName: 'RBI Explosives', average: 200, baseValue: 190 },
    { indexName: 'Steel TMT Bars', average: 75000, baseValue: 70150 },
    { indexName: 'Steel Angle/Channel', average: 74000, baseValue: 69740 },
    { indexName: 'Steel Plates', average: 76000, baseValue: 75540 },
    { indexName: 'Steel Other Sections', average: 73000, baseValue: 71810 },
  ]),
}));

vi.mock('@/lib/classification-helper', () => ({
  getClassificationOrDefault: vi.fn(async () => ({
    id: 'cls-1',
    code: '5A',
    name: 'Earthwork',
    fixed: 0,
    labour: 50,
    steel: 0,
    cement: 0,
    plantMachinery: 15,
    fuel: 15,
    otherMaterials: 5,
    explosives: 0,
  })),
}));

describe('calculateGuestPreview', () => {
  it('computes PVC for a valid draft', async () => {
    const draft = {
      agreementNo: 'TEST/2024/001',
      contractorName: 'Test Contractor',
      dateOfOpening: '2024-01-01',
      dateOfMeasurement: '2024-06-15',
      grossBillAmount: 100000,
      workClassificationCode: '5A',
      zone: 'SR',
      fuelPriceType: 'four_city_avg' as const,
    };

    const result = await calculateGuestPreview(draft);

    expect(result.quarter).toBe('Q2-2024');
    expect(result.totalPvc).toBeGreaterThan(0);
    expect(result.labourPvc).toBeGreaterThan(0);
    expect(result.indices['Labour']).toBe(150);
  });

  it('throws for measurement date before base month', async () => {
    const draft = {
      agreementNo: 'TEST/2024/002',
      contractorName: 'Test Contractor',
      dateOfOpening: '2024-06-01',
      dateOfMeasurement: '2024-01-15',
      grossBillAmount: 100000,
      zone: 'SR',
      fuelPriceType: 'four_city_avg' as const,
    };

    await expect(calculateGuestPreview(draft)).rejects.toThrow('after the contract base month');
  });
});
