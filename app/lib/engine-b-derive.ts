import type { Cpwd10caLine, Cpwd10caMaterial } from './pvc-engine-b';

/**
 * Turning a bill's items into the material quantities CPWD 10CA prices — the pure half.
 *
 * 10CA pays on tonnes of material used, so a bill's work items become:
 *   - cement:   Σ (cement coefficient for the item's code × quantity executed this bill),
 *               reusing the same DsrCementCoefficient data the Railway cement path uses;
 *   - steel:    the measured steel item quantity, converted to MT (reinforcement/TMT is
 *               priced separately from structural steel).
 *
 * The item's UNIT is not stored on the entry, so it is looked up from the rate book by
 * code and passed in as `unitByCode`. A steel line whose unit cannot be resolved is FLAGGED
 * rather than guessed — the same "never invent a number" rule the rest of the app follows.
 *
 * All pure: the database lookups (coefficients, units, prices) happen in the caller, so the
 * quantity maths and unit handling are tested on their own.
 */

/** Normalise a rate-book unit to metric tonnes. Returns null for a unit it cannot place. */
export function toMetricTonnes(quantity: number, unit: string | null | undefined): number | null {
  if (!Number.isFinite(quantity)) return null;
  const u = String(unit ?? '').trim().toLowerCase().replace(/\./g, '');
  if (!u) return null;
  if (['mt', 'tonne', 'tonnes', 't', 'te', 'metric tonne', 'metric tonnes'].includes(u)) return quantity;
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'kilogramme'].includes(u)) return quantity / 1000;
  if (['quintal', 'quintals', 'qtl', 'qtls', 'q'].includes(u)) return quantity / 10;
  return null; // unknown unit — caller flags it
}

/** Which 10CA steel material a bill steel-type maps to. */
function steelMaterialFor(steelTypes: string[]): Cpwd10caMaterial {
  // Reinforcement (TMT) is priced separately from structural (angles/channels/plates/etc).
  return steelTypes.map(s => String(s).toUpperCase()).includes('TMT') ? 'steel-tmt' : 'steel-structural';
}

/** Normalise an item code so entry codes and lookup-map keys match. */
export const normalizeItemCode = (code: unknown): string =>
  String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');

const normCode = normalizeItemCode;

export interface EngineBEntry {
  itemNumber?: string | null;
  quantity?: number | null;
  steelTypes?: unknown;
  itemRows?: unknown;
}

export interface DerivedTonnages {
  cementMT: number;
  steelTmtMT: number;
  steelStructuralMT: number;
  /** Steel lines whose unit could not be resolved — reported, never silently priced. */
  flags: Array<{ code: string; reason: string }>;
}

/** One (code, quantity, steelTypes) row — an entry, or one of its itemRows. */
interface FlatRow { code: string; quantity: number; steelTypes: string[] }

function flatten(entries: EngineBEntry[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const e of entries) {
    const steelTypes = Array.isArray(e.steelTypes) ? (e.steelTypes as unknown[]).map(String) : [];
    const itemRows = Array.isArray(e.itemRows) ? (e.itemRows as any[]) : [];
    if (itemRows.length > 0) {
      // A merged entry keeps its per-item detail in itemRows; price those, not the roll-up.
      for (const r of itemRows) {
        const q = Number(r?.quantity);
        if (r?.itemNumber && Number.isFinite(q)) rows.push({ code: normCode(r.itemNumber), quantity: q, steelTypes });
      }
    } else {
      const q = Number(e.quantity);
      if (e.itemNumber && Number.isFinite(q)) rows.push({ code: normCode(e.itemNumber), quantity: q, steelTypes });
    }
  }
  return rows;
}

/**
 * Derive cement and steel tonnages from a bill's entries.
 *   cementCoeffByCode: normalised item code → cement MT per work unit (DsrCementCoefficient)
 *   unitByCode:        normalised item code → rate-book unit string (for steel → MT)
 */
export function deriveTonnagesFromEntries(
  entries: EngineBEntry[],
  cementCoeffByCode: Map<string, number>,
  unitByCode: Map<string, string>,
): DerivedTonnages {
  const out: DerivedTonnages = { cementMT: 0, steelTmtMT: 0, steelStructuralMT: 0, flags: [] };
  for (const row of flatten(entries)) {
    if (row.quantity <= 0) continue;

    const coeff = cementCoeffByCode.get(row.code);
    if (typeof coeff === 'number' && coeff > 0) {
      out.cementMT += coeff * row.quantity;
    }

    if (row.steelTypes.length > 0) {
      const mt = toMetricTonnes(row.quantity, unitByCode.get(row.code));
      if (mt == null) {
        out.flags.push({ code: row.code, reason: `steel item unit could not be resolved (${unitByCode.get(row.code) || 'no unit'})` });
      } else if (steelMaterialFor(row.steelTypes) === 'steel-tmt') {
        out.steelTmtMT += mt;
      } else {
        out.steelStructuralMT += mt;
      }
    }
  }
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  out.cementMT = round3(out.cementMT);
  out.steelTmtMT = round3(out.steelTmtMT);
  out.steelStructuralMT = round3(out.steelStructuralMT);
  return out;
}

export interface MaterialPricePair { basePrice: number | null; currentPrice: number | null }

/**
 * Build the priced lines for the Engine B calculator from derived tonnages and the CPWD
 * price pairs. Cement uses the OPC price (the v1 default; a per-contract grade override can
 * come later). A material with no tonnage or no price pair is skipped.
 */
export function buildEngineBLines(
  tonnages: Pick<DerivedTonnages, 'cementMT' | 'steelTmtMT' | 'steelStructuralMT'>,
  prices: { 'cement-opc'?: MaterialPricePair; 'steel-tmt'?: MaterialPricePair; 'steel-structural'?: MaterialPricePair },
): Cpwd10caLine[] {
  const lines: Cpwd10caLine[] = [];
  const add = (material: Cpwd10caMaterial, qty: number, pair?: MaterialPricePair) => {
    if (!(qty > 0) || !pair || pair.basePrice == null || pair.currentPrice == null) return;
    lines.push({ material, quantity: qty, unit: 'MT', basePrice: pair.basePrice, currentPrice: pair.currentPrice });
  };
  add('cement', tonnages.cementMT, prices['cement-opc']);
  add('steel-tmt', tonnages.steelTmtMT, prices['steel-tmt']);
  add('steel-structural', tonnages.steelStructuralMT, prices['steel-structural']);
  return lines;
}
