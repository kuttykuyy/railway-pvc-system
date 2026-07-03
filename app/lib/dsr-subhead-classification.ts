/**
 * CPWD DSR sub-head → GCC classification group.
 *
 * In a CPWD DSR bill, the leading integer of an item number is the DSR sub-head
 * (e.g. "16.3.3" → sub-head 16 = Road Work). The sub-head is a far more reliable
 * classification signal than keyword-matching the item description, and it also
 * works when the printed "Chapter Name" line is missing from the PDF.
 *
 * `gccGroup` is the GCC 46A main group (1-9); the sub-classification suffix
 * (A general / B steel-supply / C cement-supply / D-E fabrication) is still
 * detected per item from steel/cement wording, so it is not encoded here.
 *
 * Some sub-heads are not a fixed group — their GCC group depends on the nature of
 * the overall work (e.g. earthwork/piling/plumbing sit under Building in a building
 * contract, but elsewhere in a formation or bridge contract). Those are marked
 * `CONTEXT`, and the caller resolves them from the contract's Name of Work.
 *
 * NOTE: This table is the single source of truth — edit a row to re-map a sub-head.
 */
export const CONTEXT = 'CONTEXT' as const;

export interface DsrSubHead {
  name: string;
  /** GCC main group '1'..'9', or CONTEXT to resolve from the contract Name of Work. */
  gccGroup: string;
}

export const CPWD_DSR_SUBHEADS: Record<number, DsrSubHead> = {
  1: { name: 'Carriage of Materials', gccGroup: CONTEXT },
  2: { name: 'Earth Work', gccGroup: CONTEXT },                // 1 (formation) vs 5 (building foundation) — from Name of Work
  3: { name: 'Mortar', gccGroup: '5' },
  4: { name: 'Concrete Work', gccGroup: '5' },
  5: { name: 'Reinforced Cement Concrete', gccGroup: '5' },
  6: { name: 'Masonry Work', gccGroup: '5' },
  7: { name: 'Stone Work', gccGroup: '5' },
  8: { name: 'Cladding Work', gccGroup: '5' },
  9: { name: 'Wood and PVC Work', gccGroup: '5' },
  10: { name: 'Steel Work', gccGroup: '5' },
  11: { name: 'Flooring', gccGroup: '5' },
  12: { name: 'Roofing', gccGroup: '5' },
  13: { name: 'Finishing', gccGroup: '5' },
  14: { name: 'Repairs to Building', gccGroup: '5' },
  15: { name: 'Dismantling and Demolishing', gccGroup: '9' },
  16: { name: 'Road Work', gccGroup: '9' },                    // confirmed by user (→ 9A)
  17: { name: 'Sanitary Installations', gccGroup: CONTEXT },   // building vs services — from Name of Work
  18: { name: 'Water Supply', gccGroup: CONTEXT },             // from Name of Work
  19: { name: 'Drainage', gccGroup: CONTEXT },                 // from Name of Work
  20: { name: 'Pile work', gccGroup: CONTEXT },                // 5 (building) vs 6 (bridge) — from Name of Work
  21: { name: 'Aluminium Work', gccGroup: '5' },
  22: { name: 'Water Proofing', gccGroup: '5' },
  23: { name: 'Rain Water Harvesting & Tubewells', gccGroup: CONTEXT },
  24: { name: 'Conservation of Heritage Buildings', gccGroup: '5' },
  25: { name: 'Structural Glazing Aluminium Composite Panel', gccGroup: '5' },
  26: { name: 'New Technologies and Materials', gccGroup: CONTEXT },
};

function normalizeName(value: string | undefined | null): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The sub-head number from a DSR item number's leading integer (e.g. "16.3.3" → 16). */
export function subHeadNumberFromItemNo(itemNo: string | undefined | null): number | null {
  const match = String(itemNo || '').trim().match(/^(\d{1,2})(?:[.\s]|$)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
}

/**
 * Resolves the GCC group for a CPWD DSR item from its sub-head. Only trusted when
 * the item is CPWD DSR — either the schedule is detected as DSR (`sourceBook`
 * 'DSR_2021'), or the printed Chapter Name matches the sub-head's name. Returns
 * null otherwise (caller then falls back to keyword/contract classification).
 */
export function inferCpwdDsrSubHead(input: {
  itemNo?: string | null;
  chapter?: string | null;
  sourceBook?: string | null;
}): { number: number; name: string; gccGroup: string } | null {
  const number = subHeadNumberFromItemNo(input.itemNo);
  if (number == null) return null;
  const entry = CPWD_DSR_SUBHEADS[number];
  if (!entry) return null;

  const isDsr = input.sourceBook === 'DSR_2021';
  const chapterNorm = normalizeName(input.chapter);
  const nameNorm = normalizeName(entry.name);
  const chapterMatches = chapterNorm.length > 0 && (chapterNorm === nameNorm || chapterNorm.includes(nameNorm) || nameNorm.includes(chapterNorm));
  if (!isDsr && !chapterMatches) return null;

  return { number, name: entry.name, gccGroup: entry.gccGroup };
}
