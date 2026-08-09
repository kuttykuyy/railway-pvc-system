import { getAdminSettings } from './admin-settings';

/**
 * The WPI base-year change of June 2026, and the bridge across it.
 *
 * On 15.06.2026 DPIIT replaced the WPI series: indices from June 2026 are published on
 * base 2022-23 = 100, and the old 2011-12 series is discontinued. The PVC formula
 * compares a bill month's index against the contract's base month's — a ratio that only
 * means anything when both sit on the same series. A contract based March 2024 (old
 * series, ~150) measured against August 2026 (new series, ~108) would show a price fall
 * that never happened and underpay the bill.
 *
 * DPIIT published linking factors (the ratio of the two series' geometric means over
 * FY 2024-25) but deliberately prescribes no methodology, leaving the choice to users.
 * The Railways' own precedent is exactly this bridge: when CPI-IW rebased in 2020,
 * Railway Board adopted a linking factor (2.88) by circular. Until a Board circular
 * lands for WPI, the DPIIT major-group factors are the defensible interim — and they
 * are read from AdminSettings first, so the eventual circular's figures are a settings
 * change, not a code change.
 *
 * Applied ONE way only: new-series months are converted up to the old base (× factor)
 * when the contract's base month predates the switch. Contracts based June 2026 onward
 * live entirely in the new series and are never converted. Stored values are never
 * altered — conversion happens at calculation time and is flagged on the result so the
 * statement can disclose it.
 */

/** First month published on the 2022-23 base — the 15.06.2026 release carried MAY 2026
 * data, so May is the new series' first month; the old series ended with April. */
export const WPI_NEW_SERIES_FROM = new Date(Date.UTC(2026, 4, 1));

/**
 * Linking factors per COMMODITY, not per major group.
 *
 * DPIIT publishes factors only for All Commodities and the three major groups, and says
 * plainly why: at finer levels the item basket changed so much that a published factor
 * "may not yield reliable results". It prescribes no method and leaves the choice to
 * the user. Taking the Manufactured Products factor (1.44) for every manufactured index
 * was that warning coming true — machinery's own bridge is 0.85, so a bill's plant and
 * machinery component came out 75% up when the truth was a few per cent, and explosives
 * would have been understated by a third.
 *
 * These are derived by DPIIT's OWN definition — the ratio of the geometric means of the
 * twelve monthly indices of the old and new series for FY 2024-25 — applied to each
 * commodity rather than its group, computed from the two published workbooks:
 *
 *   index                old GM    new GM    factor
 *   RBI Cement           130.41     93.41    1.3962   (group factor said 1.44)
 *   RBI Plant Machinery   89.82    105.62    0.8504   (group factor said 1.44)
 *   RBI Explosives       176.30     88.45    1.9932   (group factor said 1.44)
 *   RBI Other Materials  154.85    101.03    1.5327   (All Commodities, 1.53 — agrees)
 *
 * Sources: eaindustry.nic.in indx_download_1112/monthly_index_202606.xls (old series)
 * and indx_download_2223/wpi_monthly_index_202607.xlsx (new series, which carries the
 * back series recomputed on the new base). Overridable per index from AdminSettings, so
 * a Railway Board circular prescribing different figures is a settings change.
 */
export const DEFAULT_WPI_LINKING_FACTORS: Record<string, number> = {
  'RBI Cement': 1.3962,
  'RBI Plant Machinery': 0.8504,
  'RBI Explosives': 1.9932,
  'RBI Other Materials': 1.5327,
};

export function isWpiIndexName(name: string): boolean {
  return name in DEFAULT_WPI_LINKING_FACTORS;
}

export function isNewSeriesMonth(month: Date): boolean {
  return month.getTime() >= WPI_NEW_SERIES_FROM.getTime();
}

/** AdminSettings key for overriding one index's factor, e.g. wpi_linking_factor_rbi_cement. */
export function wpiFactorSettingKey(indexName: string): string {
  return `wpi_linking_factor_${indexName.toLowerCase().replace(/\s+/g, '_')}`;
}

/**
 * The factors in force: DPIIT defaults, overridden per index from AdminSettings when a
 * Railway Board circular (or a considered admin decision) supplies different ones.
 */
export async function getWpiLinkingFactors(): Promise<Record<string, number>> {
  const factors = { ...DEFAULT_WPI_LINKING_FACTORS };
  try {
    const settings = await getAdminSettings();
    for (const indexName of Object.keys(factors)) {
      const key = wpiFactorSettingKey(indexName);
      const setting = settings.find(s => s.key === key);
      const parsed = setting ? parseFloat(setting.value) : NaN;
      if (!isNaN(parsed) && parsed > 0) factors[indexName] = parsed;
    }
  } catch {
    // Settings unreachable — the published defaults still stand.
  }
  return factors;
}

/**
 * Bridge one published value for comparison against a contract's base month — the same
 * rule getQuarterlyAverages applies, packaged for the display endpoints that fetch raw
 * monthly values themselves (contract quarterly view, detailed report, forecasts).
 * Without it they showed a phantom ~30% price crash for old-base contracts the moment
 * the new series started.
 */
export function bridgeWpiValue(
  indexName: string,
  baseMonth: Date,
  publishedMonth: Date,
  value: number,
  factors: Record<string, number>,
): number {
  if (!isWpiIndexName(indexName)) return value;
  const baseIsOld = !isNewSeriesMonth(new Date(Date.UTC(baseMonth.getUTCFullYear(), baseMonth.getUTCMonth(), 1)));
  if (!baseIsOld) return value;
  if (!isNewSeriesMonth(publishedMonth)) return value;
  const factor = factors[indexName];
  return factor ? value * factor : value;
}
