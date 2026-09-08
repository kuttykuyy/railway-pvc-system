/**
 * Direct-text reader for an Indian Railway LOA / agreement PDF.
 *
 * The bill reader parses the IREPS PDF text in-process and only falls back to the
 * AI; the LOA reader was AI-first, so an out-of-credit AI failed the whole read.
 * This closes that gap: it pulls the essentials straight from the PDF text with
 * patterns, so a sign-up still gets a pre-filled form when the AI is unavailable.
 *
 * LOA layouts vary by railway and division, so this is best-effort — it reads the
 * regular fields (numbers, dates, contractor, work) and leaves the rest null for the
 * AI to fill when credit is available. It never guesses money values.
 */

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface DirectAgreementFields {
  documentType: 'agreement' | 'bill' | 'other';
  agreementNo: string | null;
  loaNo: string | null;
  loaDate: string | null;
  closingDate: string | null;
  contractorName: string | null;
  workDescription: string | null;
  completionPeriodMonths: number | null;
  acceptedPercentage: number | null;
  railwayName: string | null;
  /** How many of the key fields were found — the caller decides if it's enough to use. */
  filledCount: number;
}

/** Day-first, as Indian tender documents write dates: 05-06-2025 is 5 June 2025. */
function isoDate(day: number, month: number, year: number): string | null {
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "17-11-2025" / "17.11.2025" / "05-June-2025" -> ISO, day first. */
function parseLooseDate(raw: string): string | null {
  const numeric = raw.match(/(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4})/);
  if (numeric) return isoDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const named = raw.match(/(\d{1,2})\s*[-\/. ]\s*([A-Za-z]{3,9})\s*[-\/. ,]+\s*(\d{4})/);
  if (named) {
    const month = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return isoDate(Number(named[1]), month, Number(named[3]));
  }
  return null;
}

/**
 * The tender closing date as printed. Kept as an exported helper because it decides
 * the base month for the whole contract, and reading it off the page is exact where
 * the AI can transpose or miss it. Only returns a value when the document prints
 * exactly one — a corrigendum-extended tender prints two, and picking one by position
 * would be a coin toss, so that is left to the AI (or the user).
 */
export function findClosingDateInText(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ');
  const label = String.raw`clos(?:ing|ed)\s*(?:date|on)(?:\s*\/?\s*time)?\s*[:\-–]?\s*`;
  const found = new Set<string>();
  for (const m of flat.matchAll(new RegExp(label + String.raw`(\d{1,2}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{4})`, 'gi'))) {
    const iso = parseLooseDate(m[1]);
    if (iso) found.add(iso);
  }
  for (const m of flat.matchAll(new RegExp(label + String.raw`(\d{1,2}\s*[-\/. ]\s*[A-Za-z]{3,9}\s*[-\/. ,]+\s*\d{4})`, 'gi'))) {
    const iso = parseLooseDate(m[1]);
    if (iso) found.add(iso);
  }
  return found.size === 1 ? [...found][0] : null;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Classify the document from its own words, so a bill is never treated as an agreement. */
function classify(flat: string): DirectAgreementFields['documentType'] {
  const t = flat.toLowerCase();
  // Bill markers are checked first: a running bill often prints an agreement number too.
  if (/running account bill|\bra bill\b|\br\.a\.\s*bill\b|deviation statement|since last bill|measurement book|bill\s*no\.?\s*\d/.test(t)) {
    return 'bill';
  }
  if (/letter of acceptance|contract agreement|acceptance of tender|memorandum of agreement|\bl\.?o\.?a\.?\b|\btender\b/.test(t)) {
    return 'agreement';
  }
  return 'other';
}

/**
 * Reads the LOA / agreement essentials from already-extracted PDF text.
 * Returns nulls for anything it can't find; `filledCount` says how much it got.
 */
export function parseAgreementText(text: string): DirectAgreementFields {
  const flat = text.replace(/[ \t]+/g, ' ');
  const single = flat.replace(/\s+/g, ' ');

  const documentType = classify(single);

  // Agreement No — a code like SR/TPJ/Civil/2026/0068. LOAs usually omit it.
  const agreementNo = firstMatch(single, /(?:contract\s*)?agreement\s*(?:no\.?|number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-]{4,40})/i);

  // LOA / Letter number — a long digit string such as 10699560129108.
  const loaNo =
    firstMatch(single, /(?:l\.?o\.?a\.?|letter)\s*(?:no\.?|number)\s*[:\-]?\s*(\d{8,20})/i) ||
    firstMatch(single, /letter\s*no\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-]{6,30})/i);

  // LOA / letter date, and the tender closing date.
  const loaDateRaw = firstMatch(single, /(?:loa\s*date|letter\s*date|dated)\s*[:\-]?\s*(\d{1,2}\s*[-\/.]\s*(?:\d{1,2}|[A-Za-z]{3,9})\s*[-\/. ,]+\s*\d{4})/i);
  const loaDate = loaDateRaw ? parseLooseDate(loaDateRaw) : null;
  const closingDate = findClosingDateInText(text);

  // Contractor — "Name of Contractor : M/s XYZ" or the first "M/s XYZ". Matched on the
  // line-preserving text and cut at the line end, so the sentence after it (e.g.
  // "Your offer ... is accepted") is never swept into the name.
  const contractorRaw =
    firstMatch(flat, /name\s*of\s*(?:the\s*)?contractor\s*[:\-]?\s*(?:m\/s\.?\s*)?([A-Za-z][^\n]{2,60})/i) ||
    firstMatch(flat, /\bm\/s\.?\s+([A-Za-z][^\n]{2,60})/i);
  // Trim anything that reads as the start of the next clause rather than the name.
  const contractorName = contractorRaw
    ? contractorRaw.replace(/\s+(?:your offer|is accepted|having|for the work|at\s+[-(]?\d).*$/i, '').replace(/[\s,;:.]+$/, '').trim() || null
    : null;

  // Name of Work — the description the GCC work group is inferred from.
  const workDescription = firstMatch(flat, /name\s*of\s*(?:the\s*)?work\s*[:\-]?\s*([^\n]{5,300})/i);

  // Period of completion in whole months.
  const monthsRaw =
    firstMatch(single, /(?:period\s*of\s*completion|completion\s*period)[^0-9]{0,40}(\d{1,3})\s*(?:months?|\(months?\))/i) ||
    firstMatch(single, /(\d{1,3})\s*months?\b[^.]{0,30}completion/i);
  const completionPeriodMonths = monthsRaw ? Number(monthsRaw) : null;

  // The one accepted tender percentage — above = +, below = -, at par = 0.
  let acceptedPercentage: number | null = null;
  const parEd = /\bat\s*par\b/i.test(single);
  const pctMatch = single.match(/([-+]?\(?-?\)?\s*\d{1,2}(?:\.\d+)?)\s*%\s*(below|above|excess|less|minus|plus|over|discount|rebate)/i);
  if (pctMatch) {
    const value = parseFloat(pctMatch[1].replace(/[()\s]/g, ''));
    if (isFinite(value)) {
      const below = /below|less|minus|discount|rebate/i.test(pctMatch[2]) || /\(\s*-\s*\)/.test(pctMatch[1]) || pctMatch[1].includes('-');
      acceptedPercentage = below ? -Math.abs(value) : Math.abs(value);
    }
  } else if (parEd) {
    acceptedPercentage = 0;
  }

  const railwayName = firstMatch(single, /\b((?:south|north|east|west|central|southern|northern|eastern|western|south\s*east|south\s*central|east\s*coast|north\s*east|north\s*central|west\s*central|south\s*western|north\s*western|east\s*central|metro)[a-z ]*?railway)\b/i);

  const filledCount = [agreementNo, loaNo, loaDate, closingDate, contractorName, workDescription, completionPeriodMonths, acceptedPercentage]
    .filter((v) => v !== null && v !== undefined).length;

  return {
    documentType,
    agreementNo,
    loaNo,
    loaDate,
    closingDate,
    contractorName,
    workDescription,
    completionPeriodMonths,
    acceptedPercentage,
    railwayName: railwayName ? railwayName.replace(/\s+/g, ' ').trim() : null,
    filledCount,
  };
}
