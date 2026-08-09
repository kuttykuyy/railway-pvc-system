/**
 * Fill in what a bill leaves out, from the published schedule of rates.
 *
 * A bill cites a code and prints only what distinguishes a sub-item. Item 171014 of a
 * railway bill reads "In Wagon where mechanical handling is possible and traffic block
 * is not required" — its heading in USSOR reads "Loading of rails of any section and
 * length up to 13 metres", and the fact that the work is loading RAILS appears nowhere
 * on the bill. A GCC group is decided by the nature of the work, so classifying from
 * the printed fragment was guessing at the one thing that decides the answer.
 *
 * The bill's own wording is kept and the book's is put in front of it: the bill is the
 * document of record, and its sub-item wording is what makes one row differ from the
 * next. Nothing is replaced, only preceded.
 */
import { prisma } from '@/lib/db';

export type RateBookEdition = 'DSR 2021' | 'DSR 2023' | 'USSOR 2021';

export interface RateBookEntry {
  edition: string;
  code: string;
  subHead: string;
  subHeadName: string;
  description: string;
  unit: string;
}

/**
 * Which book an item was quoted from.
 *
 * The schedule heading names it — "covered by Unified Standard Schedule of rates 2021",
 * "not covered by ... CPWD-DSR-2021" — and the year in that heading is what separates
 * the DSR editions, since their item numbering is largely shared. A non-schedule item
 * quotes no book at all and is left alone.
 */
export function editionFor(sourceBook: string | undefined, scheduleText: string): RateBookEdition | null {
  const text = scheduleText || '';
  if (sourceBook === 'USSR_2021' || /USSR|UNIFIED\s+STANDARD/i.test(text)) return 'USSOR 2021';
  if (sourceBook === 'NON_SCHEDULE') return null;
  if (/DSR[\s-]*2023|2023[\s-]*DSR/i.test(text)) return 'DSR 2023';
  if (/DSR[\s-]*2021|2021[\s-]*DSR/i.test(text)) return 'DSR 2021';
  if (sourceBook === 'DSR_2021') return 'DSR 2021';
  return null;
}

/** USSOR prints six digits; a bill may break them up as "1710 14" or "17-10-14". */
function normalizeCode(code: string): string {
  const raw = String(code || '').trim();
  if (!raw) return '';
  const digitsOnly = raw.replace(/[\s.\-/]/g, '');
  if (/^\d{6}$/.test(digitsOnly)) return digitsOnly;
  // DSR keeps its dots; strip spaces and any trailing letters the bill added (5.22 A.6).
  const dotted = raw.replace(/\s+/g, '').match(/^\d{1,2}(?:\.\d{1,3})*/);
  return dotted ? dotted[0] : raw;
}

/**
 * Look up many items at once. Codes are read from whichever editions the bill cites,
 * and a code missing from its edition simply yields nothing — a bill may quote a
 * corrigendum item, or a schedule the app has not loaded.
 */
export async function lookupRateBookEntries(
  wanted: Array<{ code: string; edition: RateBookEdition }>,
): Promise<Map<string, RateBookEntry>> {
  const byEdition = new Map<string, Set<string>>();
  for (const { code, edition } of wanted) {
    const normalized = normalizeCode(code);
    if (!normalized) continue;
    if (!byEdition.has(edition)) byEdition.set(edition, new Set());
    byEdition.get(edition)!.add(normalized);
  }
  if (byEdition.size === 0) return new Map();

  const rows = await prisma.dsrItem.findMany({
    where: {
      OR: [...byEdition].map(([edition, codes]) => ({ edition, code: { in: [...codes] } })),
    },
    select: { edition: true, code: true, subHead: true, subHeadName: true, description: true, unit: true },
  });
  return new Map(rows.map(row => [`${row.edition}|${row.code}`, row]));
}

export function rateBookKey(code: string, edition: RateBookEdition): string {
  return `${edition}|${normalizeCode(code)}`;
}

/**
 * The item's description with the book's wording in front of it.
 *
 * Returns null when the book adds nothing — when its wording is already contained in
 * what the bill printed, which happens for items the bill quotes in full.
 */
/**
 * Put the book's wording in front of every item that cites a code it can find, and
 * record the chapter the book files it under.
 *
 * Mutates in place and returns how many items gained something, so the caller can say
 * so. Everything here is best-effort: an empty table, an unloaded edition or a code the
 * book does not carry all leave the item exactly as the bill printed it.
 */
export async function enrichItemsFromRateBook<T extends {
  itemNo?: string; dsrCode?: string; description: string;
  schedule?: string; chapter?: string; sourceBook?: string;
  rateBookEdition?: string; rateBookCode?: string; rateBookDescription?: string;
}>(items: T[]): Promise<{ enriched: number; edition?: string }> {
  const wanted: Array<{ code: string; edition: RateBookEdition }> = [];
  const editionByItem = new Map<T, RateBookEdition>();
  for (const item of items) {
    const edition = editionFor(item.sourceBook, `${item.schedule || ''} ${item.chapter || ''}`);
    const code = String(item.itemNo || item.dsrCode || '').trim();
    if (!edition || !code) continue;
    editionByItem.set(item, edition);
    wanted.push({ code, edition });
  }
  if (!wanted.length) return { enriched: 0 };

  let entries: Map<string, RateBookEntry>;
  try {
    entries = await lookupRateBookEntries(wanted);
  } catch (error) {
    // The book is an improvement, never a dependency: if the table is missing or the
    // query fails, the bill classifies exactly as it did before it existed.
    console.error('rate book lookup failed:', error);
    return { enriched: 0 };
  }

  let enriched = 0;
  const editionsUsed = new Set<string>();
  for (const item of items) {
    const edition = editionByItem.get(item);
    if (!edition) continue;
    const entry = entries.get(rateBookKey(String(item.itemNo || item.dsrCode || ''), edition));
    if (!entry) continue;
    const better = enrichDescription(item.description, entry);
    if (better && better !== item.description) {
      item.description = better;
      // Where the wording came from, kept on the item so the classification can say so.
      // A statement that reasons from words the bill does not print has to name its
      // source, or the officer checking it against the bill finds nothing and stops
      // believing the rest of it.
      item.rateBookEdition = entry.edition;
      item.rateBookCode = entry.code;
      item.rateBookDescription = entry.description;
      enriched += 1;
      editionsUsed.add(edition);
    }
    // The chapter decides the GCC group for USSOR items, and a bill that prints no
    // chapter heading left it blank. The book always knows.
    if (!item.chapter && entry.subHeadName) {
      item.chapter = `${entry.subHead} ${entry.subHeadName}`.trim();
    }
  }
  return { enriched, edition: [...editionsUsed].join(', ') || undefined };
}

export function enrichDescription(billDescription: string, entry: RateBookEntry): string | null {
  const bill = (billDescription || '').replace(/\s+/g, ' ').trim();
  const book = (entry.description || '').replace(/\s+/g, ' ').trim();
  if (!book) return null;
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (bill && squash(book).includes(squash(bill))) return book;
  if (bill && squash(bill).includes(squash(book))) return null;
  return bill ? `${book} — ${bill}` : book;
}
