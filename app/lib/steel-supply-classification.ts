/**
 * Which GCC 46A sub-class an item's MATERIAL nature puts it in — A, B, C, D or E.
 *
 * The suffix says what the contractor is being paid for:
 *  - A = general work,
 *  - B = a separate supply of steel, C = a separate supply of cement,
 *  - D = fabrication / erection INCLUDING the steel the contractor supplies,
 *  - E = fabrication / erection EXCLUDING steel (free issue / railway-supplied).
 *
 * Kept out of the bill-reading route so the wording rules can be read and tested on
 * their own, against the item descriptions the schedules of rates actually print.
 */

/** Units a bill uses when it is paying for the steel itself, by weight. */
const WEIGHT_UNITS = new Set([
  'KG', 'KGS', 'MT', 'TON', 'TONS', 'TONNE', 'TONNES', 'METRICTONNE', 'METRICTON',
  'QUINTAL', 'QUINTALS', 'QTL', 'QTLS',
]);

export function isWeightBilledUnit(unit: string | null | undefined): boolean {
  return WEIGHT_UNITS.has(String(unit || '').trim().toUpperCase().replace(/[\s.]+/g, ''));
}

/** Fabrication, assembly, erection or launching — the work …D and …E are about. */
const FABRICATION = /fabricat|assembl|erect|launch/;

/** Taking steel OUT is not supplying it. */
const REMOVAL = /dismantl|demolish|removing|removal of|taking out|dispos(?:al|ing)|scrap/;

/** The item says the steel is NOT the contractor's to buy. */
const EXCLUDES_STEEL =
  /excluding steel|without steel|steel supplied by (?:the )?railways?|free issue steel|steel (?:will|shall) be (?:supplied|issued)(?: free)? by (?:the )?railways?/;

/**
 * The item says the CONTRACTOR brings the steel.
 *
 * The test used to be the literal words "including steel" or "with steel". Neither
 * phrase appears anywhere in DSR 2021/2023 or USSOR 2021 — the schedules say it in
 * their own words instead:
 *   USSOR 041011 "Supplying, fabrication, assembling of all types of steel girders
 *                 of specified spans with structural steel conforming to IS:2062..."
 *   USSOR 041291 "...supply, fabrication and erection of new bed plate..."
 *   USSOR 195010 "Fabrication & supply of Galvanized Steel Channel Sleepers made
 *                 from ISMC 150mm x 75mm ... standard rolled section..."
 * So every one of them fell through both the …D and the …E branch and was filed as
 * general work (…A), which is what put structural steel on a building bill under 5A
 * while plain TMT reinforcement — which names no fabrication at all — went to 5B
 * correctly.
 */
const SUPPLIES_OWN_STEEL = new RegExp([
  // Said outright.
  'including steel',
  'including supply of steel',
  'with (?:structural |mild |m\\.?s\\.? |galvani[sz]ed )?steel',
  'contractor.{0,30}suppl',
  // "Supplying, fabrication, assembling ...", "supply, fabrication and erection ..."
  'suppl\\w*\\b[^.]{0,60}?\\b(?:fabricat|erect|assembl)',
  // "Fabrication & supply of ...", "Manufacture and supply of ..."
  '(?:fabricat|manufactur)\\w*\\b[^.]{0,40}?\\bsuppl',
].join('|'));

export function itemExcludesSteelSupply(text: string): boolean {
  return EXCLUDES_STEEL.test(String(text || '').toLowerCase());
}

export function itemSuppliesItsOwnSteel(text: string): boolean {
  return SUPPLIES_OWN_STEEL.test(String(text || '').toLowerCase());
}

export interface MaterialSuffixInput {
  /** The item's full text — schedule heading, chapter, rate-book wording, description. */
  description: string;
  /** The unit the bill prints for the item. */
  unit: string;
  /** Whether the bill reading marked this item as carrying steel of its own. */
  isSteelItem?: boolean;
  /** False for group 1 (Earthwork), which has no …D / …E sub-class. */
  supportsFabricationClasses: boolean;
  /** Decided by the caller's cement rules, which this module does not touch. */
  isDirectCementSupply: boolean;
}

export interface MaterialSuffixResult {
  suffix: 'A' | 'B' | 'C' | 'D' | 'E';
  reason: string;
  /** A separate steel-supply item — …B. */
  isSteelSupplyItem: boolean;
  /** Fabrication/erection of steelwork the contractor supplies the steel for — …D. */
  isSteelFabricationItem: boolean;
}

export function resolveMaterialSuffix(input: MaterialSuffixInput): MaterialSuffixResult {
  const text = String(input.description || '').toLowerCase();
  const isFabrication = FABRICATION.test(text);
  const isRemoval = REMOVAL.test(text);
  const excludesSteel = itemExcludesSteelSupply(text);
  const suppliesOwnSteel = itemSuppliesItsOwnSteel(text);
  // Steel this item brings to the work: the flag the bill reading set, or the word in
  // the item's own text when nothing set a flag.
  const isSteelNatured = Boolean(input.isSteelItem) || /\bsteel\b/.test(text);

  // A separate steel-supply item, billed by weight with no fabrication/erection
  // wording (which would make it D or E).
  const isSteelSupplyItem = isWeightBilledUnit(input.unit)
    && !isFabrication
    && !isRemoval
    && (Boolean(input.isSteelItem) || /item\s*-?\s*steel|steel supply/.test(text));

  // …D is priced with a steel share, so it belongs to items where the steel IS the
  // thing being paid for — which a bill says by measuring the item in kg or tonnes.
  // Without that, "Manufacturing, fabricating and supplying retro-reflective Level
  // Crossing Indicator boards" (per Set) and a modular steel formwork system (per sqm)
  // read as steel supply on the word "steel" alone, when the steel there is a mount or
  // a piece of shuttering, not the priced material.
  const isSteelFabricationItem = input.supportsFabricationClasses
    && isFabrication
    && isSteelNatured
    && isWeightBilledUnit(input.unit)
    && !excludesSteel
    && suppliesOwnSteel;

  const fabricationKeyword = text.match(/fabricat\w*|assembl\w*|erect\w*|launch\w*/)?.[0];

  if (input.supportsFabricationClasses && isFabrication && excludesSteel) {
    return {
      suffix: 'E',
      reason: `Item says "${fabricationKeyword}" and that steel is excluded or railway-supplied.`,
      isSteelSupplyItem,
      isSteelFabricationItem,
    };
  }
  if (isSteelFabricationItem) {
    return {
      suffix: 'D',
      reason: `Item says "${fabricationKeyword}" and supplies its own steel, so the contractor buys the steel.`,
      isSteelSupplyItem,
      isSteelFabricationItem,
    };
  }
  if (input.isDirectCementSupply) {
    return {
      suffix: 'C',
      reason: `Cement supplied as its own item, billed in ${input.unit}.`,
      isSteelSupplyItem,
      isSteelFabricationItem,
    };
  }
  if (isSteelSupplyItem) {
    // The unit and the absence of fabrication/removal wording are what make this a
    // supply item. The looser tests that used to sit here — the steel flag on its
    // own, or the words "steel supply" appearing anywhere — put every item that
    // merely mentioned steel into B whatever its unit, track dismantling measured
    // in TRM included.
    return {
      suffix: 'B',
      reason: `Steel supplied as its own item, billed by weight in ${input.unit}.`,
      isSteelSupplyItem,
      isSteelFabricationItem,
    };
  }
  return {
    suffix: 'A',
    reason: 'Composite work item — no separate steel or cement supply, no fabrication or erection.',
    isSteelSupplyItem,
    isSteelFabricationItem,
  };
}
