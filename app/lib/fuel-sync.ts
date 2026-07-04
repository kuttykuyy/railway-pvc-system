/**
 * Sync PPAC daily diesel prices into the monthly MPNG Fuel indices (4-city
 * average + per-city). Uses gap-filled monthly averages so months with missing
 * daily records still get a correct value. Shared by the admin sync route and
 * the scheduled PPAC cron.
 */
import { prisma } from '@/lib/db';
import { startOfMonth } from 'date-fns';
import { computeMonthlyFuelAverages } from '@/lib/fuel-monthly-average';

export const FUEL_CITY_INDICES = [
  { name: 'MPNG Fuel - Delhi', cityKey: 'delhi' as const, description: 'MPNG Fuel - Delhi diesel prices' },
  { name: 'MPNG Fuel - Mumbai', cityKey: 'mumbai' as const, description: 'MPNG Fuel - Mumbai diesel prices' },
  { name: 'MPNG Fuel - Chennai', cityKey: 'chennai' as const, description: 'MPNG Fuel - Chennai diesel prices' },
  { name: 'MPNG Fuel - Kolkata', cityKey: 'kolkata' as const, description: 'MPNG Fuel - Kolkata diesel prices' },
];

async function ensureCityFuelIndicesExist() {
  const baseIndex = await prisma.priceIndex.findFirst({ where: { name: 'MPNG Fuel' } });
  const baseValue = baseIndex?.baseValue ?? 93.06;
  for (const cityIdx of FUEL_CITY_INDICES) {
    await prisma.priceIndex.upsert({
      where: { name: cityIdx.name },
      update: {},
      create: { name: cityIdx.name, baseValue, description: cityIdx.description },
    });
  }
}

async function upsertMonthlyValue(
  priceIndexId: string,
  monthDate: Date,
  value: number,
  source: string,
): Promise<{ action: 'created' | 'updated' | 'unchanged' }> {
  const existing = await prisma.monthlyIndexValue.findFirst({ where: { priceIndexId, month: monthDate } });
  if (existing) {
    if (Math.abs(existing.value - value) > 0.001) {
      await prisma.monthlyIndexValue.update({ where: { id: existing.id }, data: { value, source, updatedAt: new Date() } });
      return { action: 'updated' };
    }
    return { action: 'unchanged' };
  }
  await prisma.monthlyIndexValue.create({
    data: { priceIndexId, month: monthDate, value, isProvisional: false, source },
  });
  return { action: 'created' };
}

export async function syncFuelPricesToMPNGIndex(): Promise<{ created: number; updated: number; months: string[] }> {
  await ensureCityFuelIndicesExist();

  const mpngIndex = await prisma.priceIndex.findFirst({ where: { name: 'MPNG Fuel' } });
  if (!mpngIndex) throw new Error('MPNG Fuel price index not found');

  const cityIndices: Record<string, string> = {};
  for (const cityIdx of FUEL_CITY_INDICES) {
    const idx = await prisma.priceIndex.findFirst({ where: { name: cityIdx.name } });
    if (idx) cityIndices[cityIdx.cityKey] = idx.id;
  }

  const allFuelPrices = await prisma.dailyFuelPrice.findMany({ orderBy: { date: 'asc' } });
  if (allFuelPrices.length === 0) return { created: 0, updated: 0, months: [] };

  // Gap-filled monthly averages (a diesel price holds until the next revision).
  const fourCity = computeMonthlyFuelAverages(allFuelPrices, 'fourCity');
  const perCity: Record<string, Map<string, number>> = {
    delhi: computeMonthlyFuelAverages(allFuelPrices, 'delhi'),
    mumbai: computeMonthlyFuelAverages(allFuelPrices, 'mumbai'),
    chennai: computeMonthlyFuelAverages(allFuelPrices, 'chennai'),
    kolkata: computeMonthlyFuelAverages(allFuelPrices, 'kolkata'),
  };

  let created = 0;
  let updated = 0;
  const processedMonths: string[] = [];

  for (const [monthKey, value] of fourCity) {
    const [y, mo] = monthKey.split('-').map(Number);
    const monthDate = startOfMonth(new Date(y, mo - 1, 1));

    const r1 = await upsertMonthlyValue(mpngIndex.id, monthDate, value, 'PPAC Daily Average (4-city, gap-filled)');
    if (r1.action === 'created') created++;
    if (r1.action === 'updated') updated++;

    for (const [cityKey, indexId] of Object.entries(cityIndices)) {
      const cityValue = perCity[cityKey]?.get(monthKey);
      if (cityValue === undefined) continue;
      const r = await upsertMonthlyValue(indexId, monthDate, cityValue, `PPAC Daily Average (${cityKey}, gap-filled)`);
      if (r.action === 'created') created++;
      if (r.action === 'updated') updated++;
    }
    processedMonths.push(monthKey);
  }

  return { created, updated, months: processedMonths };
}
