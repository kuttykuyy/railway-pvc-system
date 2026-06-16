import { GccVersion } from '@prisma/client';

/**
 * Determines the applicable GCC version based on the tender date of opening.
 *
 * Rules (Clause 46A, Indian Railway GCC):
 *  < Nov 2018  → July 2014 GCC
 *  Nov 2018 – Jun 2020  → November 2018 GCC
 *  Jul 2020 – Mar 2022  → July 2020 GCC
 *  Apr 2022 onwards     → April 2022 GCC
 */
export function deriveGccVersion(dateOfOpening: Date): GccVersion {
  const d = new Date(dateOfOpening);
  // Strip to year-month for boundary comparison
  const ym = d.getFullYear() * 100 + (d.getMonth() + 1); // e.g. 201811

  if (ym < 201811) return GccVersion.GCC_JULY_2014;
  if (ym < 202007) return GccVersion.GCC_NOV_2018;
  if (ym < 202204) return GccVersion.GCC_JULY_2020;
  return GccVersion.GCC_APR_2022;
}

export const GCC_VERSION_LABELS: Record<GccVersion, string> = {
  GCC_JULY_2014: 'July 2014 GCC',
  GCC_NOV_2018:  'November 2018 GCC',
  GCC_JULY_2020: 'July 2020 GCC',
  GCC_APR_2022:  'April 2022 GCC',
};

export const GCC_VERSION_NOTES: Record<GccVersion, string> = {
  GCC_JULY_2014: 'Single composite steel index (WPI Iron & Steel). CPI-IW base year 2001.',
  GCC_NOV_2018:  'Single composite steel index (WPI Iron & Steel). CPI-IW base year 2001.',
  GCC_JULY_2020: 'Single composite steel index (WPI Iron & Steel). CPI-IW base year changed to 2016 (Sept 2020).',
  GCC_APR_2022:  'Four separate steel indices: M (TMT), N (Angle/Channel), O (Plates), P (Other Sections). CPI-IW base year 2016.',
};
