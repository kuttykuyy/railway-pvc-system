import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildManualBillWorkbook, parseManualBillWorkbook, ITEMS_SHEET } from './manual-bill-sheet';

/** Fill the template the way a person would, and hand it back. */
function filled(rows: Array<Array<string | number>>, header = ['Schedule', 'Item No', 'Quantity', 'Rate']) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...rows]), ITEMS_SHEET);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('buildManualBillWorkbook', () => {
  it('ships the sheet to fill in, the contract, and the instructions', () => {
    const book = XLSX.read(buildManualBillWorkbook({
      agreementNo: 'NR/NRC/Civil/2023/0074',
      workDescription: 'Major upgradation, Kashi',
      scheduleNames: ['Schedule A', 'Schedule B'],
    }), { type: 'buffer' });
    expect(book.SheetNames).toContain(ITEMS_SHEET);
    expect(book.SheetNames).toHaveLength(3);
  });

  it('lists the contract schedules, because they have to be copied exactly', () => {
    const book = XLSX.read(buildManualBillWorkbook({
      agreementNo: 'X', workDescription: 'Y', scheduleNames: ['Schedule A', 'Schedule B'],
    }), { type: 'buffer' });
    const text = XLSX.utils.sheet_to_csv(book.Sheets['Your contract']);
    expect(text).toContain('Schedule A');
    expect(text).toContain('Schedule B');
  });

  it('says so plainly when the contract has no schedules', () => {
    const book = XLSX.read(buildManualBillWorkbook({ agreementNo: 'X', scheduleNames: [] }), { type: 'buffer' });
    expect(XLSX.utils.sheet_to_csv(book.Sheets['Your contract'])).toMatch(/none recorded/i);
  });

  it('round-trips: what it builds, it can read back', () => {
    const template = buildManualBillWorkbook({ agreementNo: 'X', scheduleNames: ['Schedule A'] });
    const parsed = parseManualBillWorkbook(template);
    // Blank template: no rows, and no complaints beyond "it is empty".
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.problems).toEqual(['Every row was blank — nothing to read.']);
  });
});

describe('parseManualBillWorkbook', () => {
  it('reads the four columns', () => {
    const { rows, problems } = parseManualBillWorkbook(filled([
      ['Schedule A', '5.22.6', 12.5, 8400],
      ['Schedule A', '025082', 3, 1250.75],
    ]));
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 2, schedule: 'Schedule A', itemNo: '5.22.6', quantity: 12.5, rate: 8400 },
      { rowNumber: 3, schedule: 'Schedule A', itemNo: '025082', quantity: 3, rate: 1250.75 },
    ]);
  });

  it('takes numbers as people type them', () => {
    const { rows } = parseManualBillWorkbook(filled([['', '5.22', '1,234.50', '₹ 8,400']]));
    expect(rows[0].quantity).toBe(1234.5);
    expect(rows[0].rate).toBe(8400);
  });

  it('finds the columns by name, not by position', () => {
    const { rows, problems } = parseManualBillWorkbook(filled(
      [[8400, '5.22.6', 'Schedule A', 12.5]],
      ['Rate', 'DSR Code', 'Schedule', 'Qty'],
    ));
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ itemNo: '5.22.6', quantity: 12.5, rate: 8400 });
  });

  it('ignores blank rows without complaining about them', () => {
    const { rows, skippedBlankRows, problems } = parseManualBillWorkbook(filled([
      ['Schedule A', '5.22.6', 1, 100],
      ['', '', '', ''],
      ['', '', '', ''],
    ]));
    expect(rows).toHaveLength(1);
    expect(skippedBlankRows).toBe(2);
    expect(problems).toEqual([]);
  });

  it('names the row a person can see when something is wrong', () => {
    const { rows, problems } = parseManualBillWorkbook(filled([
      ['Schedule A', '5.22.6', 1, 100],
      ['Schedule A', '5.23', 'twelve', 100],
      ['Schedule A', '', 5, 100],
      ['Schedule A', '5.24', 0, 100],
    ]));
    expect(rows).toHaveLength(1);
    expect(problems[0]).toMatch(/Row 3 \(item 5\.23\).*not a number/);
    expect(problems[1]).toMatch(/Row 4: an item number is needed/);
    expect(problems[2]).toMatch(/Row 5 \(item 5\.24\).*more than zero/);
  });

  it('refuses a sheet whose columns it cannot find, and says what it saw', () => {
    const { rows, problems } = parseManualBillWorkbook(filled(
      [['a', 'b', 'c']],
      ['Particulars', 'Amount', 'Remarks'],
    ));
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/needs columns for Item No, Quantity, Rate/);
    expect(problems[0]).toMatch(/Particulars, Amount, Remarks/);
  });

  it('does not fall over on something that is not a spreadsheet', () => {
    const { rows, problems } = parseManualBillWorkbook(Buffer.from('this is a PDF, honestly'));
    expect(rows).toEqual([]);
    expect(problems).toHaveLength(1);
  });
});

describe("the railway's own quantity sheet", () => {
  /** As a section office keeps it: title rows, then the header, schedule totals, zero rows. */
  function railwaySheet() {
    const aoa: Array<Array<string | number>> = [
      ['Construction of Limited Height Subway in lieu of LC No. RB-37'],
      ['CC-10 & FINAL BILL-31.07.2026'],
      ['Sdl Type', 'Item No.', 'Item Desc.', 'Unit', 'Base Rate(Rs.)', 'Agreement Rate', 'FINAL VARIATION', 'Amount (Rs.)\nas per Orig. Agmt.', 'cc-9 bill qtys', 'bal qtys cc-10,final', 'Amount (Rs.)\nas per Orig. Agmt.'],
      [1, '4.1.3', '1:2:4 concrete', 'cum', 7365.15, 7449.849225, 393.16, 2928982.72, 50, 343.16, 2556490.26],
      [2, 15.3, 'Demolishing R.C.C. work', 'cum', 2928.1, 2961.77315, 44.39, 131473.11, 10, 34.39, 101855.38],
      [3, '5.9.5', 'Lintels, beams', 'Sqm', 608.35, 615.346025, 13.1, 8061.03, 13.1, 0, 0],
      ['', 'SHEDULE  A TOTAL', '', '', '', '', '', 3068516.86, '', '', 2658345.64],
      [18, 25072, 'OPC 53 grade', 'MT', 8964.18, 10010.389448, 177.483, 1776673.95, 177.4831, -0.0001, -1],
      [19, 25073, 'PPC', 'MT', 8429.01, 9412.759757, 3318.686, 31237994.03, 3115.7409, 202.9451, 1910273.47],
      ['', 'SHEDULE  B TOTAL', '', '', '', '', '', 33014667.98, '', '', 1910272.47],
      ['', 'SHEDULE  CTOTAL', '', '', '', '', '', 0, '', '', 0],
      ['GRAND TOTAL', '', '', '', '', 127409609.57, '', 36083184.84, '', '', 4568618.11],
      ['DEDUCT TENDER DECRESE ', '', '', '', -2, '', '', -721663.7, '', '', -91372.36],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), 'final bill qtys');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  it('finds the header under the title rows and reads this bill\'s quantity column', () => {
    const { rows, problems, notes } = parseManualBillWorkbook(railwaySheet());
    expect(problems).toEqual([]);
    expect(rows.map(r => [r.itemNo, r.quantity, r.rate])).toEqual([
      ['4.1.3', 343.16, 7449.849225],
      ['15.3', 34.39, 2961.77315],
      ['25073', 202.9451, 9412.759757],
    ]);
    expect(notes.join(' ')).toMatch(/read from the column "bal qtys cc-10,final"/);
  });

  it('takes the schedule from the "SCHEDULE A TOTAL" rows, not the serial-number column', () => {
    const { rows } = parseManualBillWorkbook(railwaySheet());
    expect(rows.map(r => r.schedule)).toEqual(['Schedule A', 'Schedule A', 'Schedule B']);
  });

  it('leaves out total rows and items with no quantity this bill, and says how many', () => {
    const { rows, notes, problems } = parseManualBillWorkbook(railwaySheet());
    expect(rows).toHaveLength(3);
    expect(problems).toEqual([]);
    expect(notes.join(' ')).toMatch(/2 item\(s\) with no quantity this bill were left out/);
  });

  it('keeps the sheet\'s description as a fallback', () => {
    const { rows } = parseManualBillWorkbook(railwaySheet());
    expect(rows[0].description).toBe('1:2:4 concrete');
  });
});

describe('when no contract has been chosen yet', () => {
  /**
   * The case that actually broke: on the New Bill page the PDF is uploaded BEFORE a
   * contract is picked, so at the moment a read fails there is usually no contract —
   * and the whole way out was hidden behind one.
   */
  it('still builds, listing every contract with its schedules', () => {
    const book = XLSX.read(buildManualBillWorkbook({}, [
      { agreementNo: 'SR/MDU/GS/2024/0008', scheduleNames: ['Schedule A', 'Schedule B'] },
      { agreementNo: 'NR/NRC/Civil/2023/0074', scheduleNames: ['Schedule G'] },
    ]), { type: 'buffer' });
    const text = XLSX.utils.sheet_to_csv(book.Sheets['Your contract']);
    expect(text).toMatch(/not picked a contract yet/i);
    expect(text).toContain('SR/MDU/GS/2024/0008');
    expect(text).toContain('Schedule B');
    expect(text).toContain('NR/NRC/Civil/2023/0074');
    expect(text).toContain('Schedule G');
  });

  it('says so when the account has no contracts at all', () => {
    const book = XLSX.read(buildManualBillWorkbook({}, []), { type: 'buffer' });
    expect(XLSX.utils.sheet_to_csv(book.Sheets['Your contract'])).toMatch(/no contracts on your account/i);
  });

  it('names a contract whose schedules were never recorded', () => {
    const book = XLSX.read(buildManualBillWorkbook({}, [{ agreementNo: 'X/1', scheduleNames: [] }]), { type: 'buffer' });
    const text = XLSX.utils.sheet_to_csv(book.Sheets['Your contract']);
    expect(text).toContain('X/1');
    expect(text).toMatch(/no schedules recorded/i);
  });

  it('is still a sheet the parser can read back', () => {
    expect(parseManualBillWorkbook(buildManualBillWorkbook({}, [])).rows).toEqual([]);
  });
});
