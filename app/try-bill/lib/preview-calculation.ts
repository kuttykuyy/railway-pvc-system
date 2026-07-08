import {
  calculateClassificationBasedPvcWithComponents,
  getQuarterFromDate,
  getBaseMonth,
} from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getFuelIndexNameForBill, getSteelIndexNamesForZone } from '@/lib/zone-steel-city-mapping';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import type { GuestBillDraft, GuestPreviewResult } from '@/try-bill/types';
import { ValidationError } from './validation-error';

export async function calculateGuestPreview(
  draft: GuestBillDraft
): Promise<GuestPreviewResult> {
  const dateOfOpening = new Date(draft.dateOfOpening);
  const measurementDate = new Date(draft.dateOfMeasurement);

  if (isNaN(dateOfOpening.getTime()) || isNaN(measurementDate.getTime())) {
    throw new ValidationError('Invalid date format');
  }

  const baseMonth = getBaseMonth(dateOfOpening);

  if (measurementDate <= baseMonth) {
    throw new ValidationError('Measurement date must be after the contract base month');
  }

  const grossAmount = Number(draft.grossBillAmount);
  if (!grossAmount || grossAmount <= 0) {
    throw new ValidationError('Gross bill amount must be greater than zero');
  }

  const classification = await getClassificationOrDefault(draft.workClassificationCode);
  if (!classification) {
    throw new ValidationError('No work classification found');
  }

  const components = {
    fixed: classification.fixed ?? 0,
    labour: classification.labour ?? 0,
    steel: classification.steel ?? 0,
    cement: classification.cement ?? 0,
    plantMachinery: classification.plantMachinery ?? 0,
    fuel: classification.fuel ?? 0,
    otherMaterials: classification.otherMaterials ?? 0,
    explosives: classification.explosives ?? 0,
  };

  const quarter = getQuarterFromDate(measurementDate, baseMonth);

  const steelIndexNames = getSteelIndexNamesForZone(draft.zone);
  const fuelIndexName = getFuelIndexNameForBill(draft.zone, draft.fuelPriceType);

  const priceIndexNames = [
    'Labour',
    'RBI Plant Machinery',
    fuelIndexName,
    'RBI Other Materials',
    'RBI Cement',
    'RBI Explosives',
    ...steelIndexNames,
  ];

  const quarterlyAverages = await getQuarterlyAverages(
    quarter,
    priceIndexNames,
    baseMonth,
    'auto'
  );

  const pvc = calculateClassificationBasedPvcWithComponents(
    grossAmount,
    quarterlyAverages,
    components
  );

  const indices: Record<string, number> = {};
  for (const avg of quarterlyAverages) {
    indices[avg.indexName] = avg.average;
  }

  return {
    quarter,
    ...pvc,
    indices,
  };
}
