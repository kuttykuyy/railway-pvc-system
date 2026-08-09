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
 * A justification is checked, not read. It has to give the officer, in order: the
 * authority, the exact classification as the clause prints it, the evidence it rests
 * on, why the neighbouring sub-classifications do not apply, and the component
 * percentages the money follows from — so each can be ticked off against the contract
 * and the schedule without asking anyone anything.
 */
import { GCC_CLASSIFICATIONS } from './gcc-classifications-data';

const BY_CODE = new Map(GCC_CLASSIFICATIONS.map(entry => [entry.code.toUpperCase(), entry]));

/** The group's name exactly as Clause 46A.6 prints it. */
export function officialGroupName(mainCode: string): string | null {
  const found = GCC_CLASSIFICATIONS.find(entry => entry.code.charAt(0) === String(mainCode).charAt(0));
  return found ? found.mainClassification : null;
}

/** The sub-classification's own wording, e.g. "All Items (excluding 6B/6C/6D/6E)". */
export function officialSubName(code: string): string | null {
  return BY_CODE.get(String(code).toUpperCase())?.subClassification ?? null;
}

/**
 * The percentages this classification carries, listed as the statement applies them.
 * The whole PVC follows from these, so they belong in the justification rather than
 * only in a table further down.
 */
export function componentLine(code: string): string {
  const entry = BY_CODE.get(String(code).toUpperCase());
  if (!entry) return '';
  const parts: string[] = [];
  const push = (label: string, value: number) => { if (value) parts.push(`${label} ${value}%`); };
  push('Fixed', entry.components.fixed);
  push('Labour', entry.components.labour);
  push('Steel', entry.components.steel);
  push('Cement', entry.components.cement);
  push('Plant & Machinery', entry.components.plantMachinery);
  push('Fuel', entry.components.fuel);
  push('Other Materials', entry.components.otherMaterials);
  push('Explosives', entry.components.explosives);
  return parts.join(', ');
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
  /** The AI's own note from extraction, kept when it said something substantive. */
  aiNote?: string;
}

/**
 * Assemble the paragraph. Kept as continuous prose rather than a list, because it is
 * stored in one field and printed into one cell of the statement.
 */
export function composeJustification(parts: JustificationParts): string {
  const code = String(parts.code || '').toUpperCase();
  const mainCode = code.charAt(0);
  const groupName = officialGroupName(mainCode);
  const subName = officialSubName(code);
  const components = componentLine(code);

  const sentences: string[] = [];

  // 1. The authority and the exact classification, named as the clause names it.
  sentences.push(groupName
    ? (subName && code.length > 1
      ? `Classified under GCC-2022 Clause 46A.6 as ${code} — Group ${mainCode} ${groupName}, sub-classification ${code} (${subName}).`
      : `Classified under GCC-2022 Clause 46A.6 as Group ${mainCode} ${groupName}, which the clause carries as a single classification with no sub-divisions.`)
    : `Classified under GCC-2022 Clause 46A.6 as ${code}.`);

  // 2. The evidence for the group.
  if (parts.groupReason) sentences.push(parts.groupReason.trim());

  // 3. Where the wording came from, if the bill did not print it in full.
  if (parts.sourceNote) sentences.push(parts.sourceNote.trim());

  // 4. Why the neighbouring sub-classifications do not apply.
  if (parts.subReason) sentences.push(parts.subReason.trim());

  // 5. What the money follows from.
  if (components) {
    sentences.push(`Component percentages applied for ${code} per Clause 46A.6: ${components}. `
      + `The price variation for each component is its share of this item's value multiplied by the change in that component's published index between the base month and the bill quarter.`);
  }

  if (parts.aiNote) sentences.push(`AI extraction note: ${parts.aiNote.trim()}`);

  return sentences.join(' ').replace(/\s+/g, ' ').trim();
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
