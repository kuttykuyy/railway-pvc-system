/**
 * Monthly diesel-price averages from PPAC daily prices, robust to missing days.
 *
 * PPAC daily imports were often sporadic, so many months hold only a few days.
 * A plain mean of the recorded days is then wrong. A diesel price stays in force
 * until the next revision, so we forward-fill: for every calendar day in the
 * data range we carry the most recent known price, then average those daily
 * values per month. A month with all days present is unchanged; a sparse month
 * is reconstructed from the price that was actually in effect.
 */

export type FuelCityKey = 'delhi' | 'mumbai' | 'chennai' | 'kolkata' | 'fourCity';

export interface DailyFuelRow {
  date: Date;
  delhi: number;
  mumbai: number;
  chennai: number;
  kolkata: number;
}

export function fuelPriceFor(dp: DailyFuelRow, city: FuelCityKey): number {
  if (city === 'fourCity') return (dp.delhi + dp.mumbai + dp.chennai + dp.kolkata) / 4;
  return dp[city];
}

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const monthKeyOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Forward-filled monthly averages for one city (or the 4-city average).
 * Returns Map<'yyyy-MM', average>. Covers every month from the first to the last
 * recorded day (gaps between are filled from the last known price).
 */
export function computeMonthlyFuelAverages(daily: DailyFuelRow[], city: FuelCityKey): Map<string, number> {
  const out = new Map<string, number>();
  if (daily.length === 0) return out;

  const points = daily
    .map(dp => ({ t: utcDay(dp.date), price: fuelPriceFor(dp, city) }))
    .sort((a, b) => a.t - b.t);

  const firstT = points[0].t;
  const lastT = points[points.length - 1].t;

  const sums = new Map<string, { sum: number; days: number }>();
  let ptr = 0;
  const oneDay = 24 * 60 * 60 * 1000;
  for (let day = firstT; day <= lastT; day += oneDay) {
    while (ptr + 1 < points.length && points[ptr + 1].t <= day) ptr++;
    const price = points[ptr].price; // last known price on/before this day
    const mk = monthKeyOf(day);
    const e = sums.get(mk) || { sum: 0, days: 0 };
    e.sum += price;
    e.days += 1;
    sums.set(mk, e);
  }

  for (const [mk, { sum, days }] of sums) out.set(mk, round2(sum / days));
  return out;
}
