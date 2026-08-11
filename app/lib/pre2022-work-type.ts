/**
 * Choosing which of the six pre-2022 Clause 46A.6 work types a contract falls under.
 *
 * GCC-2022 sorts every bill ITEM into a group and sub-class. The pre-2022 clause does
 * not: it has six work types, no sub-divisions, and the tender fixes one for the work.
 * So this decides once per contract, from the work's own description, rather than item
 * by item — which is why there is no per-item classifier here and should not be one.
 *
 * The choice moves real money. For the contract this was traced against, Earthwork &
 * Bridges pays fuel at 25% and materials at 10%; Major & Important Bridges pays 15% and
 * 30%. On a bill where fuel has risen and materials have not, the two differ by lakhs.
 *
 * Every suggestion carries its reason and whether it is firm enough to act on unchecked.
 * Nothing here overrides a human: the intent is that a contract records a chosen work
 * type, and this only proposes the starting value.
 */

import type { Pre2022WorkType } from './pvc-pre2022';
import { PRE_2022_WORK_TYPES } from './pvc-pre2022';

export interface Pre2022WorkTypeSuggestion {
  workType: Pre2022WorkType;
  label: string;
  /**
   * `firm` when the wording names the work type plainly. `needs-checking` when the
   * choice rests on a default and someone should read the tender before relying on it.
   */
  confidence: 'firm' | 'needs-checking';
  /** Plain-words reason, fit to show on a screen next to the choice. */
  reason: string;
}

const squash = (text: string) => (text || '').toLowerCase().replace(/\s+/g, ' ');

/**
 * A "major bridge" and an "important bridge" are defined terms in the Indian Railways
 * Bridge Manual — broadly, a total waterway of 18 m or more, or any single span of 12 m
 * or more, or a waterway/discharge the Chief Engineer has classified as important. They
 * are not loose descriptions of "a big bridge".
 *
 * This matters because road-under-bridges and subways built in lieu of level crossings
 * are box structures with no waterway at all, and they carry the word "bridge" in every
 * other line of their schedules. Matching on "bridge" alone would push them into the
 * Major & Important Bridges column, tripling their materials percentage and cutting
 * their fuel percentage by ten points — on work that is mostly earthwork and machinery.
 *
 * So this type is only ever suggested when the wording says so in the Bridge Manual's
 * own terms, and never inferred.
 */
const NAMES_A_MAJOR_BRIDGE = /\b(major|important)\s+(rail|road|rly\.?|railway)?\s*bridges?\b/;

/** Wording that puts the work back in the ordinary bridge and earthwork column. */
const IS_A_BOX_STRUCTURE = /\b(rub|rubs|lhs|subway|subways|limited height|box cell|rcc box|under ?pass|underpass)\b/;

const MENTIONS_EXPLOSIVES = /\b(explosive|explosives|blasting|controlled blast)\b/;
const MENTIONS_TUNNELLING = /\btunnel(ling|ing|s)?\b/;
const IS_PWAY_LINKING = /\b(p-?way|permanent way)\b.*\b(linking|relaying|renewal)\b|\b(linking|relaying)\b.*\b(track|p-?way|permanent way)\b|\bthrough (rail|sleeper) renewal\b/;
const IS_BUILDING = /\b(building|buildings|quarters|station building|service building|office block|toilet block|platform shelter)\b/;
const IS_EARTHWORK_OR_BRIDGE = /\b(earthwork|earth work|formation|embankment|cutting|bridge|bridges|culvert|ballast)\b/;

/**
 * Propose a work type from the work's description.
 *
 * Order matters: the narrow, plainly-named types are tested before the broad default, so
 * that a description mentioning several things lands on the one that actually names it.
 */
export function suggestPre2022WorkType(workDescription: string): Pre2022WorkTypeSuggestion {
  const text = squash(workDescription);
  const decide = (
    workType: Pre2022WorkType,
    confidence: Pre2022WorkTypeSuggestion['confidence'],
    reason: string
  ): Pre2022WorkTypeSuggestion => ({ workType, label: PRE_2022_WORK_TYPES[workType].label, confidence, reason });

  if (!text) {
    return decide(
      'other-works-manual',
      'needs-checking',
      'No work description to judge by. Read the tender and set the work type before pricing anything.'
    );
  }

  if (MENTIONS_TUNNELLING.test(text) && MENTIONS_EXPLOSIVES.test(text)) {
    return decide(
      'minor-tunnelling-explosives',
      'firm',
      'The work is tunnelling and the description mentions explosives, which is the only work type carrying an explosives percentage.'
    );
  }

  if (IS_PWAY_LINKING.test(text)) {
    return decide(
      'permanent-way-linking',
      'firm',
      'The work is permanent way linking, which is paid mostly on labour (50%).'
    );
  }

  // Checked before buildings, because a subway's schedules are full of ordinary
  // building trades — concrete, shuttering, plaster — and would otherwise be misread.
  if (IS_A_BOX_STRUCTURE.test(text)) {
    return decide(
      'earthwork-bridges-ballast-tunnelling',
      'firm',
      'This is a subway or road-under-bridge built as a box structure. It is not a major or important bridge '
        + 'in the Bridge Manual sense — there is no waterway — so it sits with earthwork and ordinary bridges, '
        + 'which is also where its heavy plant and fuel content belongs.'
    );
  }

  if (NAMES_A_MAJOR_BRIDGE.test(text)) {
    return decide(
      'major-important-bridges',
      'firm',
      'The description names a major or important bridge, which is a defined term in the Bridge Manual and has its own column.'
    );
  }

  if (IS_BUILDING.test(text)) {
    return decide(
      'building',
      'firm',
      'The work is a building, which is paid mostly on labour (40%) and materials (35%).'
    );
  }

  if (IS_EARTHWORK_OR_BRIDGE.test(text)) {
    return decide(
      'earthwork-bridges-ballast-tunnelling',
      'firm',
      'The work is earthwork, an ordinary bridge, culvert or ballast supply.'
    );
  }

  return decide(
    'other-works-manual',
    'needs-checking',
    'The description does not match any of the named work types, so this falls to "other works". '
      + 'Check the tender, because the percentages differ a great deal between types.'
  );
}
