function normalizeSchedule(value: string): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scheduleIdentifier(value: string): string {
  const match = normalizeSchedule(value).match(/\bSCHEDULE\s+([A-Z0-9]+)\b/);
  return match?.[1] || '';
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
