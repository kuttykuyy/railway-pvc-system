import type { CpwdPriceRow, CpwdMaterial } from './cpwd-prices';

/**
 * Auto-fetch CPWD Clause 10CA base prices for Delhi-NCR from the NSRCivil page.
 *
 * CPWD has no official machine-readable feed (unlike the WPI xlsx) — only monthly PDFs.
 * NSRCivil aggregates them, and crucially embeds the whole monthly history as a structured
 * JavaScript array (`{month:'Dec 2025',opc:4915.25,...,opc_i:123.56,...}`), not just an
 * HTML table. Parsing that array gives every published month — including the historical
 * base months a contract's tender date needs — as clean data.
 *
 * This is a THIRD-PARTY aggregator, not the official CPWD circular, so the imported values
 * are a convenience to be checked against the official circular before a real claim — the
 * admin screen says so.
 */

const NSR_URL = 'https://nsrcivil.in/base-price-of-cement-steel-for-clause-10ca/';

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Dec 2025" → "2025-12", or null if it cannot be parsed. */
export function monthLabelToYYYYMM(label: string): string | null {
  const m = String(label).trim().match(/^([A-Za-z]{3,9})[\s'\-.]*(\d{4})$/);
  if (!m) return null;
  const mi = MONTH_ABBR.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  return `${m[2]}-${String(mi + 1).padStart(2, '0')}`;
}

const num = (block: string, key: string): number | null => {
  const m = block.match(new RegExp(`${key}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`));
  return m ? Number(m[1]) : null;
};

/**
 * Parse the NSRCivil page HTML into CPWD price rows (region delhi-ncr). Pulls each
 * `{month:'...',opc:...}` object out of the embedded data array and expands it to one row
 * per material. Rows with an unparseable month or no OPC price are skipped.
 */
export function parseNsrCivil10ca(html: string): CpwdPriceRow[] {
  const rows: CpwdPriceRow[] = [];
  const blocks = html.match(/\{month:'[^']*'[^}]*\}/g) || [];
  for (const block of blocks) {
    const labelMatch = block.match(/month:'([^']*)'/);
    const month = labelMatch ? monthLabelToYYYYMM(labelMatch[1]) : null;
    if (!month) continue;

    const map: Array<[CpwdMaterial, string, string]> = [
      ['cement-opc', 'opc', 'opc_i'],
      ['cement-ppc', 'ppc', 'ppc_i'],
      ['steel-tmt', 'tmt', 'tmt_i'],
      ['steel-structural', 'struct', 'struct_i'],
      ['diesel', 'diesel', 'diesel_i'],
    ];
    // A block with no OPC price is a stray/near-miss, not a data row.
    if (num(block, 'opc') == null) continue;

    for (const [material, priceKey, aipiKey] of map) {
      const price = num(block, priceKey);
      if (price == null || price <= 0) continue;
      rows.push({ region: 'delhi-ncr', material, month, price, aipi: num(block, aipiKey) });
    }
  }
  return rows;
}

/** Fetch and parse the latest NSRCivil 10CA data (Delhi-NCR). Throws on network error. */
export async function fetchCpwd10caFromNsr(): Promise<CpwdPriceRow[]> {
  const res = await fetch(NSR_URL, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'irpvc-cpwd-import' } });
  if (!res.ok) throw new Error(`NSRCivil returned HTTP ${res.status}`);
  const html = await res.text();
  const rows = parseNsrCivil10ca(html);
  if (rows.length === 0) throw new Error('No CPWD price rows could be read from the page — its format may have changed.');
  return rows;
}
