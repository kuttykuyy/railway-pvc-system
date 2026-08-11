/**
 * What a contract needs settled before it can be priced under the pre-2022 clause.
 *
 * Two questions: which GCC governs, and — if it is the old one — which of Clause 46A.6's
 * six work types applies. Each can be recorded on the contract by a human, and each can
 * be worked out from what the contract already says when nobody has.
 *
 * A stored answer always wins. The worked-out ones are proposals: the tender date cannot
 * settle the GCC question around April 2022, and a work description cannot always settle
 * the work type. This says plainly which answers are firm and which want a human, so a
 * screen can ask rather than a statement going out on a guess.
 */

import { gccVersionForTenderDate, type GccVersion } from './gcc-version';
import { suggestPre2022WorkType } from './pre2022-work-type';
import { PRE_2022_WORK_TYPES, type Pre2022WorkType } from './pvc-pre2022';

export interface ContractForPre2022 {
  dateOfOpening: Date | string | null | undefined;
  workDescription?: string | null;
  /** Recorded by a human: 'pre-2022' or 'gcc-2022'. Null when nobody has decided. */
  gccVersion?: string | null;
  /** Recorded by a human. Null when nobody has decided. */
  pre2022WorkType?: string | null;
}

export interface Pre2022Setup {
  version: GccVersion;
  /** Where the version came from — a recorded decision, or the tender date. */
  versionSource: 'recorded' | 'tender-date';
  /** True only when the contract is definitely on the old clause. */
  isPre2022: boolean;
  /** Empty when there is nothing to say. Shown on screens and on the statement. */
  warning: string;

  /** Null unless the contract is on the old clause. */
  workType: Pre2022WorkType | null;
  workTypeLabel: string;
  workTypeSource: 'recorded' | 'from-description' | null;
  workTypeReason: string;

  /**
   * True when a person should decide something before this contract is priced. A screen
   * should ask; a statement should not be issued on the app's own guess.
   */
  needsDecision: boolean;
  /** What to ask, in plain words. Empty when nothing needs asking. */
  decisionNeeded: string;
}

function isKnownVersion(value: unknown): value is GccVersion {
  return value === 'pre-2022' || value === 'gcc-2022' || value === 'uncertain';
}

function isKnownWorkType(value: unknown): value is Pre2022WorkType {
  return typeof value === 'string' && value in PRE_2022_WORK_TYPES;
}

/** Settle both questions for one contract. */
export function resolvePre2022Setup(contract: ContractForPre2022): Pre2022Setup {
  const derived = gccVersionForTenderDate(contract.dateOfOpening ?? null);

  // A recorded decision wins outright. Someone read the agreement; the date did not.
  const recordedVersion = isKnownVersion(contract.gccVersion) ? contract.gccVersion : null;
  const version = recordedVersion ?? derived.version;
  const versionSource: Pre2022Setup['versionSource'] = recordedVersion ? 'recorded' : 'tender-date';
  const warning = recordedVersion === 'gcc-2022' ? '' : derived.warning;

  const isPre2022 = version === 'pre-2022';

  if (!isPre2022) {
    // The GCC-2022 path. The only thing worth saying is when the date could not settle
    // it and nobody has — that contract is being priced on the new clause by default.
    const undecided = version === 'uncertain';
    return {
      version,
      versionSource,
      isPre2022: false,
      warning,
      workType: null,
      workTypeLabel: '',
      workTypeSource: null,
      workTypeReason: '',
      needsDecision: undecided,
      decisionNeeded: undecided
        ? 'This tender closed around the time GCC April 2022 came in, so its date cannot tell us '
          + 'which price variation clause governs. Read Clause 46A in the agreement and record which '
          + 'one it is. Until then the contract is priced on the 2022 rules.'
        : '',
    };
  }

  const recordedWorkType = isKnownWorkType(contract.pre2022WorkType) ? contract.pre2022WorkType : null;

  if (recordedWorkType) {
    return {
      version,
      versionSource,
      isPre2022: true,
      warning,
      workType: recordedWorkType,
      workTypeLabel: PRE_2022_WORK_TYPES[recordedWorkType].label,
      workTypeSource: 'recorded',
      workTypeReason: 'Chosen for this contract.',
      needsDecision: false,
      decisionNeeded: '',
    };
  }

  const suggestion = suggestPre2022WorkType(contract.workDescription || '');
  const unsure = suggestion.confidence === 'needs-checking';

  return {
    version,
    versionSource,
    isPre2022: true,
    warning,
    workType: suggestion.workType,
    workTypeLabel: suggestion.label,
    workTypeSource: 'from-description',
    workTypeReason: suggestion.reason,
    needsDecision: unsure,
    decisionNeeded: unsure
      ? `The work description does not clearly match any of the six work types, so "${suggestion.label}" `
        + 'is only a fallback. Check the tender and record the right one — the percentages differ a great '
        + 'deal between types.'
      : '',
  };
}
