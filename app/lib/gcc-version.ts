/**
 * Which General Conditions of Contract a contract is priced under.
 *
 * The app implements GCC April 2022 throughout — its 46A.6 table, its A-E
 * sub-classifications, its quarter rule, its 85% factor on dedicated cement and steel,
 * PPAC diesel for fuel and JPC rates for steel. A tender that closed before that GCC
 * carries the older price variation clause, and it differs in ways that change the
 * money, not merely the wording. Verified against the agreement for tender
 * 367-DRM-W-GNT-TId-2433, closing 20/08/2021:
 *
 *   base month     28 days before OPENING, not one month before closing
 *   quarter starts the month after the OPENING month, not after the base month
 *   classes        six work types, no A-E sub-divisions
 *   percentages    Building is labour 40 / material 35 / P&M 5 / fuel 5, against
 *                  GCC-2022's 5A of labour 25 / steel 20 / cement 15 / fuel 10
 *   cement, steel  excluded from W and paid on the value actually supplied, with no
 *                  85% factor — where GCC-2022 carries them as percentages of the group
 *   fuel index     WPI Fuel & Power group, not the PPAC diesel price
 *   steel index    WPI mild steel, not JPC ex-works rates
 *
 * So a pre-2022 contract priced on the 2022 rules is wrong on every quarter boundary
 * and on the component split. This says which clause governs; it does not price it.
 */

/**
 * GCC April 2022 was issued in April 2022 and its first correction slip followed in
 * July. A tender closing well before then is plainly on the older clause and one
 * closing well after is plainly on the new; between the two, the tender document itself
 * decides and nobody should be guessing on a contract's behalf.
 */
const CLEARLY_OLD_BEFORE = new Date(Date.UTC(2022, 3, 1)); // 1 April 2022
const CLEARLY_NEW_FROM = new Date(Date.UTC(2023, 0, 1)); // 1 January 2023

export type GccVersion = 'pre-2022' | 'gcc-2022' | 'uncertain';

export interface GccVersionVerdict {
  version: GccVersion;
  /** Said plainly, for a screen — empty when the contract is on GCC-2022. */
  warning: string;
}

/**
 * Which clause governs, from the tender's own date.
 *
 * Contract.dateOfOpening holds the tender closing date — the two are the same day for
 * an e-tender, and it is what the base month is taken from.
 */
export function gccVersionForTenderDate(tenderDate: Date | string | null | undefined): GccVersionVerdict {
  const date = tenderDate ? new Date(tenderDate) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { version: 'gcc-2022', warning: '' };
  }

  if (date >= CLEARLY_NEW_FROM) {
    return { version: 'gcc-2022', warning: '' };
  }

  const closed = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  if (date < CLEARLY_OLD_BEFORE) {
    return {
      version: 'pre-2022',
      warning:
        `This tender closed on ${closed}, before GCC April 2022, so it is priced under the older `
        + 'price variation clause — six work types instead of nine groups, no A-E sub-classes, '
        + 'cement and steel taken out of W and paid on the value supplied, quarters starting the '
        + 'month after the tender opened, fuel on the WPI Fuel & Power group rather than the diesel '
        + 'price, and steel on WPI rather than JPC rates. This app applies GCC April 2022. '
        + 'Check every figure against the agreement before submitting it.',
    };
  }

  return {
    version: 'uncertain',
    warning:
      `This tender closed on ${closed}, around when GCC April 2022 came in, so which price `
      + 'variation clause governs cannot be told from the date alone — read Clause 46A in the '
      + 'agreement. If its 46A.6 table lists six work types rather than nine groups with A-E '
      + 'sub-classes, it is the older clause and this app prices it on the wrong rules.',
  };
}
