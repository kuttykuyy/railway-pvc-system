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
