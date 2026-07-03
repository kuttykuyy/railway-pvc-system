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

/**
 * IR Unified Standard Schedule of Rates (USSOR) 2021 chapter → GCC group.
 * Source: the printed USSOR 2021 INDEX (chapters 1-21). Same semantics as the
 * CPWD table above: fixed groups where the chapter is unambiguous, CONTEXT where
 * the GCC group depends on the contract's Name of Work.
 */
export const USSOR_2021_CHAPTERS: Record<number, DsrSubHead> = {
  1: { name: 'Earth Work', gccGroup: CONTEXT },                       // 1 (formation) vs 5 (building) — from Name of Work
  2: { name: 'Bridge Works - Substructure', gccGroup: '6' },
  3: { name: 'Bridge Works - Super Structure (RCC)', gccGroup: '6' },
  4: { name: 'Bridge Works - Super Structure (Steel)', gccGroup: '6' },
  5: { name: 'Bridge Works - Misc.', gccGroup: '6' },
  6: { name: 'Rails, Sleepers and Fittings Renewal', gccGroup: '7' },
  7: { name: 'Turnouts and Renewals', gccGroup: '7' },
  8: { name: 'Deep Screening and Ballast Related Activities', gccGroup: CONTEXT }, // 2 (ballast supply) vs 7 (deep screening)
  9: { name: 'Welding Activities', gccGroup: '7' },
  10: { name: 'Reconditioning of Points and Crossings', gccGroup: '7' },
  11: { name: 'Formation Rehabilitation', gccGroup: '1' },
  12: { name: 'Activities at Construction Sites', gccGroup: CONTEXT },
  13: { name: 'Maintenance Activities', gccGroup: CONTEXT },
  14: { name: 'Testing of Rails and other Components', gccGroup: '9' },
  15: { name: 'Heavy Track Machines', gccGroup: '7' },
  16: { name: 'Small Track Machines', gccGroup: '7' },
  17: { name: 'Handling of Materials', gccGroup: '9' },
  18: { name: 'Level Crossings', gccGroup: CONTEXT },                 // road vs track nature — from Name of Work
  19: { name: 'Bridge Related Activities', gccGroup: '6' },
  20: { name: 'Supply of P.Way Materials', gccGroup: '7' },
  21: { name: 'Miscellaneous Items', gccGroup: '9' },
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

/**
 * Resolves the GCC group for a USSOR 2021 item from its chapter. The printed
 * "Chapter Name" is the primary signal (matched against the USSOR index names);
 * the item number's leading integer is a fallback when the chapter line was not
 * captured. Only applies to USSOR items (`sourceBook` 'USSR_2021').
 */
export function inferUssorChapter(input: {
  itemNo?: string | null;
  chapter?: string | null;
  sourceBook?: string | null;
}): { number: number; name: string; gccGroup: string } | null {
  if (input.sourceBook !== 'USSR_2021') return null;

  const chapterNorm = normalizeName(input.chapter);
  if (chapterNorm.length > 0) {
    for (const [num, entry] of Object.entries(USSOR_2021_CHAPTERS)) {
      const nameNorm = normalizeName(entry.name);
      if (chapterNorm === nameNorm || chapterNorm.includes(nameNorm) || nameNorm.includes(chapterNorm)) {
        return { number: Number(num), name: entry.name, gccGroup: entry.gccGroup };
      }
    }
  }

  const number = subHeadNumberFromItemNo(input.itemNo);
  if (number != null && USSOR_2021_CHAPTERS[number]) {
    const entry = USSOR_2021_CHAPTERS[number];
    return { number, name: entry.name, gccGroup: entry.gccGroup };
  }
  return null;
}

/**
 * Schedule-aware dispatcher: USSOR items resolve via the USSOR chapter index,
 * everything else via the CPWD DSR sub-head table.
 */
export function inferScheduleSubHead(input: {
  itemNo?: string | null;
  chapter?: string | null;
  sourceBook?: string | null;
}): { number: number; name: string; gccGroup: string } | null {
  if (input.sourceBook === 'USSR_2021') return inferUssorChapter(input);
  return inferCpwdDsrSubHead(input);
}
