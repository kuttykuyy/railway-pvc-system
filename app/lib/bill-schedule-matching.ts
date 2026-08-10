function normalizeSchedule(value: string): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The schedule's short identifier — "A4", "B1" — from either side of the match.
 *
 * The bill writes it out in full ("Schedule B4-Items which are not covered by Unified
 * Standard Schedule of rates 2021 and CPWD-DSR-2021..."), while a contract usually
 * holds the bare tag ("B4"). Requiring the word SCHEDULE found it on the bill and never
 * on the contract, so the two could not be matched by identifier at all.
 *
 * That left only the token scoring below, which cannot tell B1 from B4: every B
 * schedule on a bill repeats the same sentence about items not covered by USSOR and
 * CPWD-DSR, differing by the tag alone. It scored them equal and returned nothing, so
 * every B item lost its schedule — and with it the bid rate and escalation for that
 * schedule.
 */
function scheduleIdentifier(value: string): string {
  const normalized = normalizeSchedule(value);
  const labelled = normalized.match(/\bSCHEDULE\s+([A-Z]\s?\d{0,2}|\d{1,2}\s?[A-Z]?)\b/);
  if (labelled) return labelled[1].replace(/\s+/g, '');
  // A bare tag, as a contract records it: "B4", "B-4", "A 5".
  const bare = normalized.match(/^([A-Z]\s?\d{1,2}|\d{1,2}\s?[A-Z])\b/);
  return bare ? bare[1].replace(/\s+/g, '') : '';
}

/**
 * The short form of a schedule, for showing on a crowded row.
 *
 * A bill names a schedule in a whole sentence — "Schedule B4-Items which are not
 * covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for
 * Tiruchirappalli Division. DTTC hostel/Diesel shed/Ponmalai." — and when a contract
 * lists no schedules of its own that sentence is what gets stored and displayed. All
 * that distinguishes one from another is the tag, so that is what a summary row shows.
 * Falls back to the original text where no tag can be read, for the caller to clamp.
 */
export function scheduleTag(value: string): string {
  return scheduleIdentifier(value) || String(value || '').trim();
}

/**
 * A schedule named by its tag and the work it covers, with the boilerplate dropped.
 *
 * A tender writes a schedule as a paragraph: which rate book it draws on, for which
 * division, what it excludes, and on what terms the tenderer quotes — all of it repeated
 * almost word for word on every schedule of the contract. The part that differs is the
 * tag and the work named at the end. Stored whole, the schedule rows on a contract are
 * indistinguishable and each one overflows its box.
 *
 * "Schedule B2-Items which are not covered by Unified Standard Schedule of rates 2021
 * and CPWD-DSR-2021 for Tiruchirappalli Division. (The tenderer/contractor shall quote
 * unit rate)-Renewal of worn out EOT crane gantry rails in Wheel Shop, BRS and Diesel
 * POH shop" becomes "B2 - Renewal of worn out EOT crane gantry rails in Wheel Shop, BRS
 * and Diesel POH shop".
 *
 * Where nothing but boilerplate is left, the tag alone is returned; where no tag can be
 * read, the original text is returned untouched rather than mangled.
 */
export function shortScheduleName(value: string): string {
  const original = String(value || '').trim();
  const tag = scheduleIdentifier(original);
  if (!tag) return original;

  const rest = original
    // Conditions on how the rate is quoted, always parenthesised.
    .replace(/\([^)]*\)/g, ' ')
    // "Schedule B2-", and the tag wherever it opens the text.
    .replace(/^\s*schedule\s*/i, '')
    .replace(new RegExp(`^${tag.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*[-–—:]*\\s*`, 'i'), '')
    // Which book it draws on, and for which division.
    .replace(/\b(?:all\s+)?items?\s+which\s+(?:is|are)\s*(?:\/\s*are\s*)?(?:not\s+)?covered\s+by\b[^.]*/gi, ' ')
    .replace(/\bfor\s+[A-Za-z]+\s+division\b/gi, ' ')
    .replace(/\bexcept\s+supply\s+of\b[^.\-–—]*/gi, ' ')
    .replace(/\bthe\s+advertised\s+value\b[^.]*/gi, ' ')
    .replace(/\s*[-–—.]+\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, '')
    .trim();

  return rest ? `${tag} - ${rest}` : tag;
}

export function matchExtractedSchedule(
  contractSchedules: string[],
  extractedValues: Array<string | null | undefined>,
): string {
  const extracted = extractedValues.map(value => String(value || '').trim()).filter(Boolean);
  if (extracted.length === 0) return '';
  if (contractSchedules.length === 0) return extracted[0];

  const normalizedExtracted = extracted.map(normalizeSchedule);
  const exactMatch = contractSchedules.find(schedule => normalizedExtracted.includes(normalizeSchedule(schedule)));
  if (exactMatch) return exactMatch;

  const identifiers = new Set(extracted.map(scheduleIdentifier).filter(Boolean));
  if (identifiers.size > 0) {
    const identifierMatches = contractSchedules.filter(schedule => identifiers.has(scheduleIdentifier(schedule)));
    if (identifierMatches.length === 1) return identifierMatches[0];
  }

  const ignoredTokens = new Set(['SCHEDULE', 'ITEM', 'ITEMS', 'USSR', 'DSR', '2021', 'WORK']);
  const extractedTokens = new Set(
    normalizedExtracted.flatMap(value => value.split(' ')).filter(token => token.length > 2 && !ignoredTokens.has(token)),
  );
  const scored = contractSchedules
    .map(schedule => {
      const tokens = normalizeSchedule(schedule).split(' ');
      const score = tokens.filter(token => extractedTokens.has(token)).length;
      return { schedule, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score > 0 && scored[0].score > (scored[1]?.score || 0) ? scored[0].schedule : '';
}
