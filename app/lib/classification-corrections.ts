/**
 * What the app got wrong, taken from the corrections people actually made.
 *
 * Every classification entry now records both the code the app proposed and the code
 * that was accepted. Where they differ, a person looked at the item and decided the app
 * was wrong — which is the only evidence of the rules failing that does not depend on
 * someone thinking to report it. Grouped by the move (what it suggested, what it should
 * have been) and by the schedule item, so the fix with the most items behind it is at
 * the top of the list.
 */
import { prisma } from '@/lib/db';

export interface CorrectionMove {
  /** The code the app proposed, e.g. "5A". */
  suggested: string;
  /** The code a person put in its place, e.g. "6D". */
  accepted: string;
  /** How many entries were corrected this way. */
  count: number;
  /** The amount those entries carry, in rupees — how much money the move is worth. */
  amount: number;
  /** The schedule items it happened on, most frequent first, up to ten. */
  items: Array<{ itemNumber: string; count: number; description: string }>;
}

export interface CorrectionsReport {
  /** Entries where the app proposed something and a person changed it. */
  corrected: number;
  /** Entries the app proposed and a person accepted as they were. */
  accepted: number;
  /** corrected / (corrected + accepted), or null when nothing has been classified yet. */
  correctionRate: number | null;
  /** The moves, worst first. */
  moves: CorrectionMove[];
}

export interface CorrectionEntry {
  suggestedSubClassificationId: string | null;
  subClassificationId: string | null;
  amount: number;
  itemNumber: string | null;
  description: string | null;
}

/**
 * The counting, with no database in it, so it can be read and tested on its own.
 *
 * `codeById` turns a sub-classification id into the code a person recognises ("6D").
 */
export function summariseCorrections(
  entries: CorrectionEntry[],
  codeById: Map<string, string>,
  limit = 25,
): CorrectionsReport {
  const byMove = new Map<string, CorrectionMove & { itemCounts: Map<string, { count: number; description: string }> }>();
  let corrected = 0;
  let accepted = 0;

  for (const entry of entries) {
    const suggested = codeById.get(entry.suggestedSubClassificationId || '') || '';
    const finalCode = codeById.get(entry.subClassificationId || '') || '';
    // A sub-classification that has since been deleted leaves no code to compare, and a
    // guess about which move it was would be worse than leaving it out.
    if (!suggested || !finalCode) continue;
    if (suggested === finalCode) {
      accepted += 1;
      continue;
    }
    corrected += 1;

    const key = `${suggested}->${finalCode}`;
    let move = byMove.get(key);
    if (!move) {
      move = { suggested, accepted: finalCode, count: 0, amount: 0, items: [], itemCounts: new Map() };
      byMove.set(key, move);
    }
    move.count += 1;
    move.amount += Number(entry.amount) || 0;

    const itemNumber = String(entry.itemNumber || '').trim();
    if (itemNumber) {
      const seen = move.itemCounts.get(itemNumber);
      if (seen) seen.count += 1;
      else move.itemCounts.set(itemNumber, { count: 1, description: String(entry.description || '').slice(0, 160) });
    }
  }

  const moves = [...byMove.values()]
    .map(move => ({
      suggested: move.suggested,
      accepted: move.accepted,
      count: move.count,
      amount: Math.round(move.amount),
      items: [...move.itemCounts.entries()]
        .map(([itemNumber, seen]) => ({ itemNumber, count: seen.count, description: seen.description }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10),
    }))
    // By how often, then by money — a move made on many small items is a rule to fix,
    // and one made on a single large item is a number to check.
    .sort((left, right) => right.count - left.count || right.amount - left.amount)
    .slice(0, limit);

  const classified = corrected + accepted;
  return {
    corrected,
    accepted,
    correctionRate: classified > 0 ? corrected / classified : null,
    moves,
  };
}

export async function reportClassificationCorrections(limit = 25): Promise<CorrectionsReport> {
  const entries = await prisma.billClassificationEntry.findMany({
    where: { suggestedSubClassificationId: { not: null } },
    select: {
      suggestedSubClassificationId: true,
      subClassificationId: true,
      amount: true,
      itemNumber: true,
      description: true,
    },
  });

  const codeById = new Map<string, string>();
  for (const sub of await prisma.subClassification.findMany({ select: { id: true, code: true } })) {
    codeById.set(sub.id, sub.code);
  }

  return summariseCorrections(entries as CorrectionEntry[], codeById, limit);
}
