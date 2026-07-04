/**
 * JPC Steel Items Definition
 * All 34 items from JPC (Joint Plant Committee) bulletin
 * With specific items mapped to IR-PVC steel indices for PVC calculations
 * 
 * Steel Index Mapping (as per GCC 2022 Clause 46A.9):
 * 
 * | SL | Classification                                      | Rates from JPC                                                    |
 * |----|-----------------------------------------------------|-------------------------------------------------------------------|
 * | 1  | Reinforcement bars (TMT)                            | Avg of 10mm TMT & 25mm TMT                                        |
 * | 2  | All types of Angles, Channels, Joists               | Avg of Angle 75x75x6mm, MS Plate 10mm, Channel 150x75mm           |
 * | 3  | All types of Plates                                 | Avg of MS Plate-10mm & MS Plate-25mm                              |
 * | 4  | Any other section not covered above (Other Sections)| Average of SL 1, 2 & 3 (i.e., (TMT + Angle/Channel + Plates) ÷ 3) |
 * 
 * Source: GCC April 2022 - Clause 46A.9
 */

export interface JpcItem {
  id: string;           // Unique code for database
  sno: number;          // Serial number from JPC
  name: string;         // Display name matching JPC bulletin
  category: string;     // Category group
  indexMapping: string | null; // Maps to steel index: TMT, ANGLE_CHANNEL, PLATES, OTHER_SECTIONS
  usedInCalculation: boolean; // Whether this item is used in PVC index calculation
  usedInOtherSections: boolean; // Whether this item is used in OTHER_SECTIONS calculation
}

// Items used in TMT, Angle/Channel, Plates calculations (excluded from Other Sections)
const AFFECTED_ITEMS = ['tmt_10mm', 'tmt_25mm', 'angle_75x75x6mm', 'plate_10mm', 'channel_150x75mm', 'plate_25mm'];

// All 34 JPC items exactly as per JPC bulletin
export const JPC_ITEMS: JpcItem[] = [
  // Category: PIG_IRON -> OTHER_SECTIONS
  { id: "pig_iron", sno: 1, name: "PIG IRON", category: "PIG_IRON", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: SEMIS -> OTHER_SECTIONS
  { id: "billets_100mm", sno: 2, name: "BILLETS 100 MM", category: "SEMIS", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "blooms_150x150mm", sno: 3, name: "BLOOMS 150X150 MM", category: "SEMIS", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "pencil_ingots", sno: 4, name: "PENCIL INGOTS", category: "SEMIS", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: WIRE_ROD -> OTHER_SECTIONS
  { id: "wire_rod_6mm", sno: 5, name: "WIRE RODS 6 MM", category: "WIRE_ROD", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "wire_rod_8mm", sno: 6, name: "WIRE RODS 8 MM", category: "WIRE_ROD", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: ROUND -> OTHER_SECTIONS
  { id: "round_12mm", sno: 7, name: "ROUNDS 12 MM", category: "ROUND", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "round_16mm", sno: 8, name: "ROUNDS 16 MM", category: "ROUND", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "round_25mm", sno: 9, name: "ROUNDS 25 MM", category: "ROUND", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: TMT -> TMT Index (USED: 10mm, 25mm) | TMT 12mm goes to OTHER_SECTIONS
  { id: "tmt_10mm", sno: 10, name: "TMT 10 MM", category: "TMT", indexMapping: "TMT", usedInCalculation: true, usedInOtherSections: false },
  { id: "tmt_12mm", sno: 11, name: "TMT 12 MM", category: "TMT", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "tmt_25mm", sno: 12, name: "TMT 25 MM", category: "TMT", indexMapping: "TMT", usedInCalculation: true, usedInOtherSections: false },
  
  // Category: ANGLE -> ANGLE_CHANNEL Index (USED: 75x75x6 only) | 50x50x6 goes to OTHER_SECTIONS
  { id: "angle_50x50x6mm", sno: 13, name: "ANGLES 50X50X6 MM", category: "ANGLE", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "angle_75x75x6mm", sno: 14, name: "ANGLES 75X75X6 MM (ISA 75x6)", category: "ANGLE", indexMapping: "ANGLE_CHANNEL", usedInCalculation: true, usedInOtherSections: false },
  
  // Category: JOIST -> OTHER_SECTIONS
  { id: "joist_125x70mm", sno: 15, name: "JOISTS 125X70 MM", category: "JOIST", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "joist_200x100mm", sno: 16, name: "JOISTS 200X100 MM", category: "JOIST", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: CHANNEL -> ANGLE_CHANNEL Index (USED: 150x75 only) | 75x40 goes to OTHER_SECTIONS
  { id: "channel_75x40mm", sno: 17, name: "CHANNELS 75X40 MM", category: "CHANNEL", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "channel_150x75mm", sno: 18, name: "CHANNELS 150X75 MM (ISMC 150x75)", category: "CHANNEL", indexMapping: "ANGLE_CHANNEL", usedInCalculation: true, usedInOtherSections: false },
  
  // Category: PLATE -> PLATES Index (USED: 10mm, 25mm) | 6mm, 12mm go to OTHER_SECTIONS
  { id: "plate_6mm", sno: 19, name: "PLATES 6 MM", category: "PLATE", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "plate_10mm", sno: 20, name: "PLATES 10 MM (MS Plate-10mm)", category: "PLATE", indexMapping: "PLATES", usedInCalculation: true, usedInOtherSections: false },
  { id: "plate_12mm", sno: 21, name: "PLATES 12 MM", category: "PLATE", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "plate_25mm", sno: 22, name: "PLATES 25 MM (MS Plate-25mm)", category: "PLATE", indexMapping: "PLATES", usedInCalculation: true, usedInOtherSections: false },
  
  // Category: HR_COIL -> OTHER_SECTIONS
  { id: "hr_coil_2mm", sno: 23, name: "H. R. COILS 2.00 MM", category: "HR_COIL", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "hr_coil_2_5mm", sno: 24, name: "H. R. COILS 2.50 MM", category: "HR_COIL", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "hr_coil_3_15mm", sno: 25, name: "H. R. COILS 3.15 MM", category: "HR_COIL", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: CR_COIL -> OTHER_SECTIONS
  { id: "cr_coil_0_63mm", sno: 26, name: "C.R. COILS 0.63 MM", category: "CR_COIL", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "cr_coil_1mm", sno: 27, name: "C. R. COILS 1.00 MM", category: "CR_COIL", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: GP_SHEET -> OTHER_SECTIONS
  { id: "gp_sheet_0_4mm", sno: 28, name: "G. P. SHEETS 0.40 MM", category: "GP_SHEET", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "gp_sheet_0_63mm", sno: 29, name: "G. P. SHEETS 0.63 MM", category: "GP_SHEET", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: GC_SHEET -> OTHER_SECTIONS
  { id: "gc_sheet_0_4mm", sno: 30, name: "G. C. SHEETS 0.40 MM", category: "GC_SHEET", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "gc_sheet_0_63mm", sno: 31, name: "G. C. SHEETS 0.63 MM", category: "GC_SHEET", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: SCRAP -> OTHER_SECTIONS
  { id: "scrap_hms_1", sno: 32, name: "MELTING SCRAP H M S - I", category: "SCRAP", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  { id: "scrap_hms_2", sno: 33, name: "MELTING SCRAP H M S - II", category: "SCRAP", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
  
  // Category: SPONGE -> OTHER_SECTIONS
  { id: "sponge_iron", sno: 34, name: "SPONGE IRON (COAL BASED)", category: "SPONGE", indexMapping: "OTHER_SECTIONS", usedInCalculation: false, usedInOtherSections: true },
];

/**
 * Items specifically used for PVC index calculations (as per GCC 2022 Clause 46A.9)
 * 
 * TMT Bars: TMT 10mm, TMT 25mm (2 items)
 * Angle/Channel: ISA 75x6, MS Plate-10mm, ISMC 150x75 (3 items)
 * Plates: MS Plate-10mm, MS Plate-25mm (2 items)
 * Other Sections: CALCULATED as (TMT + Angle/Channel + Plates) ÷ 3 - NOT from JPC items
 */
export const PVC_CALCULATION_ITEMS = {
  TMT: ['tmt_10mm', 'tmt_25mm'],
  ANGLE_CHANNEL: ['angle_75x75x6mm', 'plate_10mm', 'channel_150x75mm'],
  PLATES: ['plate_10mm', 'plate_25mm'],
  // OTHER_SECTIONS is derived from the average of the above 3 indices, NOT from JPC items
  OTHER_SECTIONS: [] as string[]
};

// Items used for Other Sections (non-affected items)
export const OTHER_SECTIONS_ITEMS = JPC_ITEMS.filter(item => item.usedInOtherSections);

// Items that are used in PVC calculation
export const JPC_PVC_ITEMS = JPC_ITEMS.filter(item => item.usedInCalculation);

// Get items by index mapping
export const getItemsByIndex = (indexMapping: string): JpcItem[] => {
  return JPC_ITEMS.filter(item => item.indexMapping === indexMapping);
};

// Get items specifically used for calculation of an index
export const getCalculationItemsForIndex = (indexKey: string): string[] => {
  return PVC_CALCULATION_ITEMS[indexKey as keyof typeof PVC_CALCULATION_ITEMS] || [];
};

// Index mapping to display names
export const INDEX_DISPLAY_NAMES: Record<string, string> = {
  TMT: "Steel TMT Bars",
  ANGLE_CHANNEL: "Steel Angle/Channel",
  PLATES: "Steel Plates",
  OTHER_SECTIONS: "Steel Other Sections"
};

// Category display names
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  PIG_IRON: "Pig Iron",
  SEMIS: "Semis (Billets/Blooms)",
  WIRE_ROD: "Wire Rods",
  ROUND: "Rounds",
  TMT: "TMT Bars",
  ANGLE: "Angles",
  JOIST: "Joists",
  CHANNEL: "Channels",
  PLATE: "Plates",
  HR_COIL: "HR Coils",
  CR_COIL: "CR Coils",
  GP_SHEET: "GP Sheets",
  GC_SHEET: "GC Sheets",
  SCRAP: "Melting Scrap",
  SPONGE: "Sponge Iron"
};

// ── Steel index breakdown (for the AVERAGE JPC STEEL INDICES report page) ────
// Each steel index is the mean of specific JPC readings, per GCC 2022 Cl.46A.9:
//   TMT Bars       = (10mm F1 + 10mm F2 + 25mm F1 + 25mm F2) / 4   (raw fortnights)
//   Angle/Channel  = (ISA 75x6 + MS Plate 10mm + ISMC 150x75) / 3  (item averages)
//   Plates         = (MS Plate 10mm + MS Plate 25mm) / 2           (item averages)
//   Other Sections = (TMT + Angle/Channel + Plates) / 3            (derived indices)
const STEEL_SECTION_ORDER = ['TMT', 'ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS'] as const;
export type SteelSectionKey = typeof STEEL_SECTION_ORDER[number];

const STEEL_SECTION_LABEL: Record<SteelSectionKey, string> = {
  TMT: 'TMT Bars', ANGLE_CHANNEL: 'Angle / Channel', PLATES: 'Plates', OTHER_SECTIONS: 'Other Sections',
};
const STEEL_SECTION_FORMULA: Record<SteelSectionKey, string> = {
  TMT: '(10mm F1 + 10mm F2 + 25mm F1 + 25mm F2) / 4',
  ANGLE_CHANNEL: '(ISA 75x6 + MS Plate 10mm + ISMC 150x75) / 3',
  PLATES: '(MS Plate 10mm + MS Plate 25mm) / 2',
  OTHER_SECTIONS: '(TMT Bars + Angle/Channel + Plates) / 3   [GCC 46A.9]',
};
const STEEL_SECTION_ITEM_COLUMNS: Record<'TMT' | 'ANGLE_CHANNEL' | 'PLATES',
  { label: string; itemCode: string; field: 'f1' | 'f2' | 'average' }[]> = {
  TMT: [
    { label: '10mm F1', itemCode: 'tmt_10mm', field: 'f1' },
    { label: '10mm F2', itemCode: 'tmt_10mm', field: 'f2' },
    { label: '25mm F1', itemCode: 'tmt_25mm', field: 'f1' },
    { label: '25mm F2', itemCode: 'tmt_25mm', field: 'f2' },
  ],
  ANGLE_CHANNEL: [
    { label: 'ISA 75x6', itemCode: 'angle_75x75x6mm', field: 'average' },
    { label: 'MS Plate 10mm', itemCode: 'plate_10mm', field: 'average' },
    { label: 'ISMC 150x75', itemCode: 'channel_150x75mm', field: 'average' },
  ],
  PLATES: [
    { label: 'MS Plate 10mm', itemCode: 'plate_10mm', field: 'average' },
    { label: 'MS Plate 25mm', itemCode: 'plate_25mm', field: 'average' },
  ],
};

export interface JpcMonthItem { f1: number | null; f2: number | null; average: number | null }

/** The four section index values for one month, using the exact GCC 46A.9 formula. */
export function computeSteelSectionsForMonth(
  getItem: (code: string) => JpcMonthItem | undefined,
): Record<SteelSectionKey, number | null> {
  const g = (code: string) => {
    const it = getItem(code);
    return { f1: Number(it?.f1) || 0, f2: Number(it?.f2) || 0, avg: Number(it?.average) || 0 };
  };
  const mean = (vals: number[]) =>
    vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  const t10 = g('tmt_10mm'); const t25 = g('tmt_25mm');
  const TMT = mean([t10.f1, t10.f2, t25.f1, t25.f2].filter(v => v > 0));
  const ANGLE_CHANNEL = mean([g('angle_75x75x6mm').avg, g('plate_10mm').avg, g('channel_150x75mm').avg].filter(v => v > 0));
  const PLATES = mean([g('plate_10mm').avg, g('plate_25mm').avg].filter(v => v > 0));
  const OTHER_SECTIONS = mean([TMT, ANGLE_CHANNEL, PLATES].filter((v): v is number => v != null && v > 0));
  return { TMT, ANGLE_CHANNEL, PLATES, OTHER_SECTIONS };
}

export interface SteelBreakdownMonth { month: string; values: (number | null)[]; average: number | null }
export interface SteelBreakdownSection {
  indexName: string;
  sectionKey: SteelSectionKey;
  sectionLabel: string;
  formula: string;
  columns: string[];
  months: SteelBreakdownMonth[];
}

/**
 * Builds the per-section JPC steel breakdown (constituent readings + derived
 * monthly index) for each of the four sections, aligned to `steelIndexNames`
 * (order: TMT, Angle/Channel, Plates, Other Sections).
 */
export function buildSteelBreakdown(
  steelIndexNames: string[],
  itemsByMonth: Map<string, Map<string, JpcMonthItem>>,
): SteelBreakdownSection[] {
  const months = Array.from(itemsByMonth.keys()).sort();
  const out: SteelBreakdownSection[] = [];
  STEEL_SECTION_ORDER.forEach((key, pos) => {
    const indexName = steelIndexNames[pos];
    if (!indexName) return;
    if (key === 'OTHER_SECTIONS') {
      out.push({
        indexName, sectionKey: key, sectionLabel: STEEL_SECTION_LABEL[key], formula: STEEL_SECTION_FORMULA[key],
        columns: ['TMT Bars', 'Angle/Channel', 'Plates'],
        months: months.map(mk => {
          const lookup = itemsByMonth.get(mk);
          const sec = computeSteelSectionsForMonth(code => lookup?.get(code));
          return { month: mk, values: [sec.TMT, sec.ANGLE_CHANNEL, sec.PLATES], average: sec.OTHER_SECTIONS };
        }),
      });
      return;
    }
    const specCols = STEEL_SECTION_ITEM_COLUMNS[key];
    out.push({
      indexName, sectionKey: key, sectionLabel: STEEL_SECTION_LABEL[key], formula: STEEL_SECTION_FORMULA[key],
      columns: specCols.map(c => c.label),
      months: months.map(mk => {
        const lookup = itemsByMonth.get(mk);
        const values = specCols.map(c => {
          const v = lookup?.get(c.itemCode)?.[c.field];
          return v == null ? null : Number(v);
        });
        const sec = computeSteelSectionsForMonth(code => lookup?.get(code));
        return { month: mk, values, average: sec[key] };
      }),
    });
  });
  return out;
}

// Summary of items used in calculation
export const CALCULATION_ITEM_COUNTS = {
  TMT: PVC_CALCULATION_ITEMS.TMT.length,           // 2 items: 10mm, 25mm
  ANGLE_CHANNEL: PVC_CALCULATION_ITEMS.ANGLE_CHANNEL.length, // 3 items: ISA 75x6, MS Plate-10mm, ISMC 150x75
  PLATES: PVC_CALCULATION_ITEMS.PLATES.length,     // 2 items: MS Plate-10mm, MS Plate-25mm
  OTHER_SECTIONS: 3,                               // Derived: (TMT + Angle/Channel + Plates) ÷ 3
  TOTAL_USED: JPC_PVC_ITEMS.length,                // 5 unique items used for TMT/Angle/Plates
  TOTAL_ALL: JPC_ITEMS.length                      // 34 total items
};
