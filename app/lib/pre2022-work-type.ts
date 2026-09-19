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
/**
 * A foot over bridge is a station structure, not a bridge in the clause's sense.
 *
 * It carries passengers over the tracks: there is no waterway, no span classified under
 * the Bridge Manual, and its schedules are RCC foundations, steel fabrication, roofing,
 * flooring and railings — the trades of a station building, not of earthwork and heavy
 * plant. But the word "bridge" sits inside its own name, so the earthwork-and-bridges
 * pattern below swallowed "Construction of foot over bridge at X station" and priced it
 * at fuel 25% and materials 10% against a building's 5% and 35%. That is the same trap
 * the box-structure rule above exists for, reached from the other side.
 *
 * Written "FOB" as often as spelled out, on IR tenders to the point of being the normal
 * form, so both are matched.
 */
const IS_FOOT_OVER_BRIDGE = /\bf\.?o\.?b\.?s?\b|\bfoot[- ]?over[- ]?bridges?\b|\bfoot[- ]?bridges?\b/;

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

  // Before the buildings test only because it must be before the bridges test; both land
  // on the same column, and this one carries its own reason.
  if (IS_FOOT_OVER_BRIDGE.test(text)) {
    return decide(
      'building',
      'needs-checking',
      'This is a foot over bridge at a station. It is not a major or important bridge and not earthwork — '
        + 'there is no waterway, and the work is RCC foundations, steel fabrication, roofing and flooring — '
        + 'so it sits with buildings, on labour (40%) and materials (35%). Confirm it against the price '
        + 'variation chapter of the tender, which names the type this work was tendered under.'
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
