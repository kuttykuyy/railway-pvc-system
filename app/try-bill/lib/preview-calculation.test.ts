import { describe, it, expect, vi } from 'vitest';
import { calculateGuestPreview } from './preview-calculation';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import type { GuestBillDraft } from '@/try-bill/types';

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
  getClassificationOrDefault: vi.fn(),
}));

const baseDraft: GuestBillDraft = {
  agreementNo: 'TEST/2024/001',
  contractorName: 'Test Contractor',
  dateOfOpening: '2024-01-01',
  dateOfMeasurement: '2024-06-15',
  grossBillAmount: 100000,
  workClassificationCode: '5A',
  zone: 'SR',
  fuelPriceType: 'four_city_avg',
};

const earthworkClassification = {
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
  isActive: true,
  isDefault: false,
};

describe('calculateGuestPreview', () => {
  it('computes PVC for a valid draft', async () => {
    vi.mocked(getClassificationOrDefault).mockResolvedValue(earthworkClassification);

    const result = await calculateGuestPreview(baseDraft);

    expect(result.quarter).toBe('Q2-2024');
    expect(result.labourPvc).toBeCloseTo(7692.31, 2);
    expect(result.plantMachineryPvc).toBeCloseTo(1071.43, 2);
    expect(result.fuelPowerPvc).toBeCloseTo(1129.03, 2);
    expect(result.otherMaterialsPvc).toBeCloseTo(194.81, 2);
    expect(result.cementPvc).toBeCloseTo(0, 2);
    expect(result.steelPvc).toBeCloseTo(0, 2);
    expect(result.explosivesPvc).toBeCloseTo(0, 2);
    expect(result.totalPvc).toBeCloseTo(10087.57, 2);
    expect(result.indices['Labour']).toBe(150);
  });

  it('throws for measurement date before base month', async () => {
    const draft: GuestBillDraft = {
      ...baseDraft,
      agreementNo: 'TEST/2024/002',
      dateOfOpening: '2024-06-01',
      dateOfMeasurement: '2024-01-15',
    };

    await expect(calculateGuestPreview(draft)).rejects.toThrow('after the contract base month');
  });

  it('throws for invalid date format', async () => {
    const draft: GuestBillDraft = {
      ...baseDraft,
      dateOfOpening: 'not-a-date',
    };

    await expect(calculateGuestPreview(draft)).rejects.toThrow('Invalid date format');
  });

  it('throws when gross bill amount is zero or negative', async () => {
    const draft: GuestBillDraft = {
      ...baseDraft,
      grossBillAmount: 0,
    };

    await expect(calculateGuestPreview(draft)).rejects.toThrow('Gross bill amount must be greater than zero');
  });

  it('throws when no work classification is found', async () => {
    vi.mocked(getClassificationOrDefault).mockResolvedValue(null);

    await expect(calculateGuestPreview(baseDraft)).rejects.toThrow('No work classification found');
  });
});
