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
