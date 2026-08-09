/**
 * Write the justification an accounts office can pass without raising a query.
 *
 * What was being written read like a summary of the item and named the group wrongly:
 * "Group 5 - Steel Work", "Group 6 - Concrete Work". Group 5 is Building Works and
 * Group 6 is Bridges & Protection Work. An officer checks that against Clause 46A.6,
 * finds it does not say what the statement says, and from that moment queries every
 * figure on the proposal — the reasoning may have been sound, but nothing in it can be
 * relied on once a citation is wrong.
 *
 * A justification is checked, not read: the evidence for THIS item, then the
 * classification that follows from it, and nothing else. It said far more than that at
 * first — the component percentages, the PVC formula, what a GCC group is as a concept,
 * every sub-classification that did not apply — all of it identical on every line of
 * the statement and all of it printed elsewhere on the same document. Padding is not
 * neutral: it buries the one sentence the officer is actually checking.
 */
import { GCC_CLASSIFICATIONS } from './gcc-classifications-data';

const BY_CODE = new Map(GCC_CLASSIFICATIONS.map(entry => [entry.code.toUpperCase(), entry]));

/** The group's name exactly as Clause 46A.6 prints it. */
export function officialGroupName(mainCode: string): string | null {
  const found = GCC_CLASSIFICATIONS.find(entry => entry.code.charAt(0) === String(mainCode).charAt(0));
  return found ? found.mainClassification : null;
}

export interface JustificationParts {
  /** The full code, e.g. "6A" — or "2"/"7", which have no sub-divisions. */
  code: string;
  /** Why this group: the evidence, already written as a sentence. */
  groupReason: string;
  /** Why this sub-classification, and what it rules out. */
  subReason?: string;
  /** Where the item's wording came from, when not the bill itself. */
  sourceNote?: string;
}

/**
 * Assemble it. Kept as continuous prose rather than a list, because it is stored in one
 * field and printed into one cell of the statement.
 */
export function composeJustification(parts: JustificationParts): string {
  const code = String(parts.code || '').toUpperCase();
  const mainCode = code.charAt(0);
  const groupName = officialGroupName(mainCode);

  const evidence = (parts.groupReason || '').trim().replace(/\s+/g, ' ');
  const conclusion = groupName
    ? `Classified ${code} — ${groupName} (GCC-2022 Cl. 46A.6).`
    : `Classified ${code} (GCC-2022 Cl. 46A.6).`;

  return [evidence, parts.subReason?.trim(), parts.sourceNote?.trim(), conclusion]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Correct or reject a justification written by the AI.
 *
 * The model names groups from its own idea of what they are called — "Group 6 -
 * Concrete Work" — and the name is the first thing an officer checks. Where it names
 * the right group by the wrong name, the name is corrected. Where it names a different
 * group from the one the item was actually classified under, the text is discarded: it
 * is reasoning about something else, and no amount of repair makes it true.
 */
export function repairAiJustification(text: string, resolvedCode: string): string | null {
  const wanted = String(resolvedCode || '').charAt(0);
  if (!text) return null;
  const official = officialGroupName(wanted);
  let mismatched = false;

  // The name runs to the first comma or full stop and never swallows the words that
  // follow it — matching across a comma turned "Group 6 - Concrete Work,
  // Sub-classification 6A" into "Group 6 Bridges & Protection Work6A".
  const repaired = text.replace(
    /Group\s*([1-9])\s*(?:[-–—:]\s*)((?!Sub-)[A-Z][A-Za-z&'’\- ]{2,45}?)(?=\s*[,.;()]|\s+Sub-|$)/g,
    (whole, cited: string, name: string) => {
      if (cited !== wanted) { mismatched = true; return whole; }
      const correct = officialGroupName(cited);
      if (!correct || !name.trim()) return whole;
      return `Group ${cited} ${correct}`;
    },
  );

  // A group cited without any name at all still has to be the right group.
  for (const match of text.matchAll(/Group\s*([1-9])\b/g)) {
    if (match[1] !== wanted) mismatched = true;
  }

  return mismatched ? null : repaired;
}
