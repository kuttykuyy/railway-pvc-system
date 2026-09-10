import * as XLSX from 'xlsx';

/**
 * The spreadsheet a contractor fills in when their bill cannot be read.
 *
 * Plenty of running bills arrive as scans — photographed, put through an office scanner,
 * no text layer at all — and the reader has nothing to work with. Until now that was the
 * end of the road: an error, and an invitation to type the whole bill into the form by
 * hand, item by item. This is the same information in the shape people already keep it.
 *
 * FOUR COLUMNS, and no more. The description is not asked for because the schedule of
 * rates already has it: an item number is a lookup, and asking someone to retype the
 * wording of an item the app can quote verbatim invites a paraphrase that then disagrees
 * with the bill. The amount is not asked for either — it is quantity times rate, and a
 * column people can type into is a column that can disagree with its own multiplication.
 *
 * The schedule comes from the contract, so the sheet lists that agreement's own
 * schedules rather than leaving a free-text box.
 */

/** Exactly what a person is asked to fill in. Order is the order they appear. */
export const SHEET_COLUMNS = ['Schedule', 'Item No', 'Quantity', 'Rate'] as const;

export const ITEMS_SHEET = 'Bill items';
const GUIDE_SHEET = 'How to fill this in';
const CONTRACT_SHEET = 'Your contract';

/** Blank rows offered. Long bills exist; a person can always add more rows themselves. */
const BLANK_ROWS = 300;

export interface ManualSheetRow {
  /** 1-based row in the spreadsheet, so a complaint can name the row a person sees. */
  rowNumber: number;
  schedule: string;
  itemNo: string;
  quantity: number;
  rate: number;
  /** Only when the sheet carries one (the railway's does); the rate book is preferred. */
  description?: string;
}

export interface ParsedManualSheet {
  rows: ManualSheetRow[];
  /** Row-by-row complaints, worded for the person who filled it in. */
  problems: string[];
  /** What was decided about the layout (which quantity column, inferred schedules), for checking. */
  notes: string[];
  /** Rows left entirely blank — expected, and not worth complaining about. */
  skippedBlankRows: number;
}

/** "Item No", "item no.", "ITEM_NUMBER" — all the same column. */
function headerKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<string, string[]> = {
  schedule: ['schedule', 'scheduleno', 'schedulename', 'sch', 'sdl', 'sdltype', 'scheduletype', 'sdlno'],
  itemNo: ['itemno', 'item', 'itemnumber', 'dsrno', 'dsrcode', 'code', 'ssorno'],
  quantity: ['quantity', 'qty', 'qtythisbill', 'quantitythisbill', 'qtysthisbill', 'balqty', 'balqtys', 'balanceqty'],
  rate: ['rate', 'agreementrate', 'rateinrs', 'unitrate'],
};

/** The railway's sheets come out of a web page: "1:1&frac12;:3", "contractor&apos;s". */
function decodeEntities(text: string): string {
  return text
    .replace(/&frac12;/g, '½').replace(/&frac14;/g, '¼').replace(/&frac34;/g, '¾')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/** A number as people actually type it: "1,234.50", "₹ 1234.5", " 12 ". */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? '').replace(/[₹,\s]/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The workbook handed to someone whose bill could not be read.
 *
 * Three sheets: the one they fill in, their contract's details for reference, and the
 * instructions. The instructions are a sheet rather than a note in the email, because
 * the file is what gets forwarded around an office and the covering email is what gets
 * lost.
 */
export interface SheetContract {
  agreementNo?: string | null;
  workDescription?: string | null;
  scheduleNames?: string[];
}

export function buildManualBillWorkbook(
  contract: SheetContract,
  /**
   * Every contract this person has, for the case where none has been chosen yet.
   *
   * The upload happens BEFORE the contract is picked — the contract is matched from the
   * bill's agreement number — so at the moment a read fails there is often nothing to
   * build a per-contract sheet from. Gating the whole way out on a contract being
   * chosen hid it exactly when it was needed, which is what happened.
   */
  allContracts: SheetContract[] = [],
): Buffer {
  const workbook = XLSX.utils.book_new();
  const schedules = (contract.scheduleNames || []).filter(Boolean);
  const named = Boolean(contract.agreementNo);

  // ── The sheet they fill in ──────────────────────────────────────────────────
  const header = [...SHEET_COLUMNS];
  const blank = Array.from({ length: BLANK_ROWS }, () => ['', '', '', '']);
  const items = XLSX.utils.aoa_to_sheet([header, ...blank]);
  items['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
  // Frozen header, so the columns stay named on row 300 of a long bill.
  items['!freeze'] = { xSplit: '0', ySplit: '1', topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(workbook, items, ITEMS_SHEET);

  // ── Their contract, so the schedule names can be copied exactly ─────────────
  // A dropdown would be better, and is not possible: the spreadsheet library here
  // cannot WRITE data validation. So the valid values are listed where they can be
  // copied from, and the upload checks them and says which row disagrees.
  const contractRows: Array<[string, string]> = named
    ? [
      ['Agreement number', String(contract.agreementNo || '')],
      ['Name of work', String(contract.workDescription || '')],
      ['', ''],
      ['Schedules on this agreement', ''],
      ...(schedules.length
        ? schedules.map((name): [string, string] => ['', name])
        : [['', '(none recorded on this contract — leave the Schedule column blank)'] as [string, string]]),
    ]
    : [
      // No contract chosen yet. List them all with their schedules, so the right
      // schedule can still be copied exactly — the person knows which agreement this
      // bill is, even though the app does not yet.
      ['You have not picked a contract yet', ''],
      ['', 'Pick it in the app when you upload this sheet. Copy the schedule for your'],
      ['', 'agreement from the list below.'],
      ['', ''],
      ...(allContracts.length
        ? allContracts.flatMap((c): Array<[string, string]> => [
          [String(c.agreementNo || '(no agreement number)'), ''],
          ...((c.scheduleNames || []).filter(Boolean).length
            ? (c.scheduleNames || []).filter(Boolean).map((name): [string, string] => ['', name])
            : [['', '(no schedules recorded — leave the Schedule column blank)'] as [string, string]]),
          ['', ''],
        ])
        : [['', '(no contracts on your account yet)'] as [string, string]]),
    ];
  const contractSheet = XLSX.utils.aoa_to_sheet(contractRows);
  contractSheet['!cols'] = [{ wch: 30 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, contractSheet, CONTRACT_SHEET);

  // ── How to fill it in ───────────────────────────────────────────────────────
  const guide = XLSX.utils.aoa_to_sheet([
    ['Filling in your bill'],
    [''],
    [`Put one row per bill item on the "${ITEMS_SHEET}" sheet.`],
    [''],
    ['Schedule', 'Copy it exactly from the "Your contract" sheet. Leave blank if the agreement has only one.'],
    ['Item No', 'The item or DSR/USSOR number as the bill prints it — "5.22.6", "025082".'],
    ['Quantity', 'The quantity executed SINCE THE LAST BILL, not the up-to-date figure.'],
    ['Rate', 'The agreement rate for that item, in rupees.'],
    [''],
    ['What you do NOT fill in'],
    ['Description', 'Taken from the schedule of rates using the item number.'],
    ['Amount', 'Worked out as Quantity x Rate.'],
    [''],
    ['Then upload this file where you would have uploaded the bill PDF.'],
    ['Every row is shown back to you for checking before anything is saved.'],
    [''],
    ['If a row will not match', ''],
    ['', 'An item number the schedule of rates does not carry is kept, with its'],
    ['', 'description left for you to type on the review screen. Nothing is dropped.'],
  ]);
  guide['!cols'] = [{ wch: 22 }, { wch: 86 }];
  XLSX.utils.book_append_sheet(workbook, guide, GUIDE_SHEET);

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Read a filled-in workbook back — ours, or the railway's own quantity sheet.
 *
 * Tolerant on the way in and specific on the way out: headers are matched loosely, so a
 * renamed or reordered column still works, but anything it cannot use is reported
 * against the row number the person can see on their own screen.
 *
 * The railway's bill-quantity sheet (as a section office keeps it: "Sdl Type, Item No.,
 * Item Desc., Unit, Base Rate, Agreement Rate, Final Variation, Amount, cc-9 bill qtys,
 * bal qtys cc-10, Amount") is read too, because people hold their bill in exactly that
 * shape and converting it to four columns by hand is where the confusion started. That
 * layout has its header a few rows down under the work title, several quantity columns
 * of which only one is this bill's, schedules marked by "SCHEDULE A TOTAL" rows rather
 * than a column, and zero rows for items not billed this time. Each of those is handled,
 * and what was decided is said back in `notes` so the person can check it.
 */
const HEADER_SCAN_ROWS = 25;

/** A header cell that names a quantity column — but never an amount. */
function isQuantityHeader(key: string): boolean {
  if (!key) return false;
  if (/amount|amt|value|rate/.test(key)) return false;
  return /qty|quantity/.test(key);
}

/**
 * Of several quantity columns, the one that is THIS bill's. "bal qtys cc-10, final" over
 * "cc-9 bill qtys" over "final variation": the balance / this-bill column wins, then the
 * one naming the highest bill number, then the rightmost — a running-bill sheet reads
 * left to right from the agreement to the current bill.
 */
function pickQuantityColumn(candidates: Array<{ index: number; key: string; label: string }>): { index: number; label: string } {
  const score = (c: { index: number; key: string }): number => {
    let n = 0;
    if (/thisbill|balance|\bbal|balqty|balqtys|balqtyscc|current|present|now/.test(c.key)) n += 1000;
    if (/final/.test(c.key)) n += 500;
    const bill = c.key.match(/(?:cc|ra|bill|rab)(\d{1,3})/);
    if (bill) n += Number(bill[1]);
    return n + c.index / 1000;
  };
  return candidates.slice().sort((a, b) => score(b) - score(a))[0];
}

export function parseManualBillWorkbook(data: Buffer | ArrayBuffer | Uint8Array): ParsedManualSheet {
  const problems: string[] = [];
  const notes: string[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: 'buffer' });
  } catch {
    return { rows: [], problems: ['That file could not be opened as a spreadsheet.'], notes, skippedBlankRows: 0 };
  }

  // The sheet we shipped, or the first one — someone will paste into a new tab.
  const sheetName = workbook.SheetNames.includes(ITEMS_SHEET) ? ITEMS_SHEET : workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    return { rows: [], problems: ['The spreadsheet has no sheets in it.'], notes, skippedBlankRows: 0 };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (grid.length < 2) {
    return { rows: [], problems: ['The sheet has a header but no rows filled in.'], notes, skippedBlankRows: 0 };
  }

  // Which row is the header: the first one (within reach) that names both an item
  // number and a rate. The railway sheet puts the work title and the bill name above it.
  let headerIndex = -1;
  for (let i = 0; i < Math.min(grid.length, HEADER_SCAN_ROWS); i += 1) {
    const keys = ((grid[i] || []) as unknown[]).map(headerKey);
    const hasItem = keys.some(k => HEADER_ALIASES.itemNo.includes(k));
    const hasRate = keys.some(k => HEADER_ALIASES.rate.includes(k));
    const hasQty = keys.some(k => HEADER_ALIASES.quantity.includes(k) || isQuantityHeader(k));
    if (hasItem && (hasRate || hasQty)) { headerIndex = i; break; }
  }
  if (headerIndex < 0) headerIndex = 0;

  // Which column is which, found by name rather than by position.
  const headerRow = (grid[headerIndex] || []) as unknown[];
  const columnOf: Record<string, number> = {};
  const quantityCandidates: Array<{ index: number; key: string; label: string }> = [];
  headerRow.forEach((cell, index) => {
    const key = headerKey(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && columnOf[field] === undefined) columnOf[field] = index;
    }
    if (isQuantityHeader(key)) quantityCandidates.push({ index, key, label: String(cell ?? '').replace(/\s+/g, ' ').trim() });
    if (/^(itemdesc|description|desc|particulars|descriptionofitem|itemdescription|nameofitem)$/.test(key) && columnOf.description === undefined) {
      columnOf.description = index;
    }
  });
  // Several quantity columns (a running-bill sheet): choose this bill's and say which.
  if (quantityCandidates.length > 1) {
    const picked = pickQuantityColumn(quantityCandidates);
    columnOf.quantity = picked.index;
    notes.push(`Quantities were read from the column "${picked.label}" (the sheet has ${quantityCandidates.length} quantity columns). If this bill's quantities are in a different column, rename it "Quantity this bill".`);
  } else if (columnOf.quantity === undefined && quantityCandidates.length === 1) {
    columnOf.quantity = quantityCandidates[0].index;
  }
  // The template's exact aliases first; a plain "Rate" column that is not the agreement
  // rate (e.g. "Base Rate") is never taken by mistake because it does not alias.
  const railwayLayout = headerIndex > 0 || quantityCandidates.length > 1;

  const missing = (['itemNo', 'quantity', 'rate'] as const).filter(f => columnOf[f] === undefined);
  if (missing.length) {
    return {
      rows: [],
      problems: [
        `The sheet needs columns for ${missing.map(f => (f === 'itemNo' ? 'Item No' : f === 'quantity' ? 'Quantity' : 'Rate')).join(', ')}. `
        + `Found: ${headerRow.filter(Boolean).join(', ') || '(nothing)'}.`,
      ],
      notes,
      skippedBlankRows: 0,
    };
  }

  // Schedules on a railway sheet are marked by "SCHEDULE A TOTAL" rows below their items
  // (sometimes a "Schedule A" heading above). Map every item row to its schedule first.
  const rowText = (raw: unknown[]) => raw.map(v => String(v ?? '')).join(' ').replace(/\s+/g, ' ').trim();
  const totalRe = /\bsc?hedule\s*[-:.]?\s*([a-z0-9]{1,3}?)\s*[-:.]?\s*total\b/i;
  const headingRe = /^\s*sc?hedule\s*[-:.]?\s*([a-z0-9]{1,3})\s*$/i;
  const scheduleFromTotals = new Map<number, string>();
  let pendingFrom = headerIndex + 1;
  let headingAbove: string | null = null;
  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const text = rowText((grid[index] || []) as unknown[]);
    const heading = text.match(headingRe);
    if (heading) { headingAbove = heading[1].toUpperCase(); pendingFrom = index + 1; continue; }
    const total = text.match(totalRe);
    if (total) {
      const name = (headingAbove || total[1]).toUpperCase();
      for (let r = pendingFrom; r < index; r += 1) scheduleFromTotals.set(r, name);
      pendingFrom = index + 1;
      headingAbove = null;
    }
  }
  if (headingAbove) for (let r = pendingFrom; r < grid.length; r += 1) scheduleFromTotals.set(r, headingAbove);
  const inferredSchedules = new Set(scheduleFromTotals.values());

  const rows: ManualSheetRow[] = [];
  let skippedBlankRows = 0;
  let skippedZeroRows = 0;

  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const raw = (grid[index] || []) as unknown[];
    const rowNumber = index + 1; // 1-based, as the person sees it
    const cell = (field: string) => (columnOf[field] === undefined ? '' : raw[columnOf[field]]);

    const itemNoCell = cell('itemNo');
    // Excel keeps "15.30" as the number 15.3 and "13070" as 13070; both are item codes.
    const itemNo = typeof itemNoCell === 'number' ? String(itemNoCell) : String(itemNoCell ?? '').trim();
    const quantityRaw = cell('quantity');
    const rateRaw = cell('rate');
    const description = decodeEntities(String(cell('description') ?? '')).replace(/\s+/g, ' ').trim();
    let schedule = String(cell('schedule') ?? '').trim();
    // A "Sdl Type" column holding serial numbers is not a schedule name; the total rows are.
    if ((!schedule || /^\d+(\.\d+)?$/.test(schedule)) && scheduleFromTotals.has(index)) {
      schedule = `Schedule ${scheduleFromTotals.get(index)}`;
    }

    // Total, grand-total and deduction rows are the sheet's arithmetic, not items. A
    // schedule total carries its label in the item column, so that one is matched on
    // the whole row; the rest only when the row has no item number, so an item whose
    // description says "deduct" is never dropped.
    const text = rowText(raw);
    if (totalRe.test(text)) continue;
    if (!itemNo && /\bgrand\s*total\b|\btotal\b|\bdeduct\b/i.test(text)) continue;

    const isBlank = !itemNo && !String(quantityRaw ?? '').trim() && !String(rateRaw ?? '').trim();
    if (isBlank) { skippedBlankRows += 1; continue; }

    if (!itemNo) {
      // On the railway's sheet an item-less row is a label or a spacer, not a mistake.
      if (railwayLayout) continue;
      problems.push(`Row ${rowNumber}: an item number is needed. Nothing on this row was used.`);
      continue;
    }
    const quantity = toNumber(quantityRaw);
    const rate = toNumber(rateRaw);
    if (quantity === null) {
      problems.push(`Row ${rowNumber} (item ${itemNo}): the quantity "${String(quantityRaw)}" is not a number.`);
      continue;
    }
    if (rate === null) {
      problems.push(`Row ${rowNumber} (item ${itemNo}): the rate "${String(rateRaw)}" is not a number.`);
      continue;
    }
    if (quantity <= 0 || rate <= 0) {
      // On the railway's sheet a zero is an item not billed this time — expected, and
      // counted once below. On our four-column template a zero is usually a row someone
      // meant to finish, so it is named.
      if (railwayLayout && rate > 0 && quantity <= 0.0005) { skippedZeroRows += 1; continue; }
      problems.push(`Row ${rowNumber} (item ${itemNo}): quantity and rate must both be more than zero.`);
      continue;
    }

    // Excel arithmetic leaves 317.20000000000005 behind; a bill quantity has no more
    // than six decimals, so that is float noise, not information.
    rows.push({ rowNumber, schedule, itemNo, quantity: Number(quantity.toFixed(6)), rate, ...(description ? { description } : {}) });
  }

  if (inferredSchedules.size) {
    notes.push(`Schedules were read from the "Schedule … total" rows: ${[...inferredSchedules].map(n => `Schedule ${n}`).join(', ')}.`);
  }
  if (skippedZeroRows) {
    notes.push(`${skippedZeroRows} item(s) with no quantity this bill were left out.`);
  }

  if (!rows.length && !problems.length) {
    problems.push('Every row was blank — nothing to read.');
  }

  return { rows, problems, notes, skippedBlankRows };
}
