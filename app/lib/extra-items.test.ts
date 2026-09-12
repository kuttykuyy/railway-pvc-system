import { describe, expect, it } from 'vitest';
import { findAdditionalNsItems, isAddedItem, isAddedItemNumber, isAddedSchedule, isAdditionalNsSchedule, scheduleTag } from './extra-items';

const D = 'Schedule D-Additional NS item';
const B2 = 'Schedule B2-Items which are not covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for Tiruchirappalli Division.';
const A4 = 'Schedule A4-All items which are covered by Unified Standard Schedule of rates 2021 for Tiruchirappalli Division.';

describe('isAdditionalNsSchedule', () => {
  it('recognises the headings IREPS prints for items added after the agreement', () => {
    expect(isAdditionalNsSchedule(D)).toBe(true);
    expect(isAdditionalNsSchedule('Schedule E - Extra NS Items')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule C: New Non-Schedule items')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule F - Extra items')).toBe(true);
    // Wordings without the letters "NS" that still mean "added after the agreement".
    expect(isAdditionalNsSchedule('Schedule E - Newly added items')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule G: Additional Items')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule-E (New N.S. Items)')).toBe(true);
    expect(isAdditionalNsSchedule('Items added during execution')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule H - Items under Cl. 39')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule D - Addl. NS Items')).toBe(true);
  });

  it("leaves the tender's own schedules alone", () => {
    expect(isAdditionalNsSchedule(B2)).toBe(false);
    expect(isAdditionalNsSchedule(A4)).toBe(false);
    expect(isAdditionalNsSchedule('Schedule B - NS items')).toBe(false);
    // A work title that happens to say "new" is not an addition to the contract.
    expect(isAdditionalNsSchedule('Schedule A - New BG line works items')).toBe(false);
    expect(isAdditionalNsSchedule('Schedule A - Construction of new station building')).toBe(false);
    expect(isAdditionalNsSchedule('')).toBe(false);
  });
});

describe('findAdditionalNsItems', () => {
  it('reports the items under an additional-NS schedule with their paid total', () => {
    const report = findAdditionalNsItems([
      { itemNo: 'NS01(I)', scheduleHeading: D, schedule: 'Schedule D', amountSinceLastBill: 445069.5, description: 'Groove cutting' },
      { itemNo: '1', scheduleHeading: B2, schedule: 'Schedule B2', amountSinceLastBill: 1000 },
      { itemNo: '082011', scheduleHeading: A4, schedule: 'Schedule A4', amountSinceLastBill: 2000 },
    ]);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].itemNo).toBe('NS01(I)');
    expect(report.total).toBe(445069.5);
    expect(report.schedules).toEqual([D]);
  });

  it('skips idle rows, so a schedule with nothing billed this period offers nothing', () => {
    const report = findAdditionalNsItems([{ itemNo: 'NS02', scheduleHeading: D, amountSinceLastBill: 0 }]);
    expect(report.candidates).toHaveLength(0);
    expect(report.total).toBe(0);
  });

  it('falls back to the schedule name when no heading was kept', () => {
    const report = findAdditionalNsItems([{ itemNo: 'NS03', schedule: D, amountSinceLastBill: 10 }]);
    expect(report.candidates).toHaveLength(1);
  });
});


describe('isAddedSchedule — the LOA decides when the heading does not', () => {
  // Bill SR/MAS/GS/2023/0010/B23 (CC23): the tender awarded A–D; E, F, G were added.
  const tender = ['Schedule A-DSR GENERAL ITEMS', 'Schedule B-NS SCHEDULE', 'Schedule C-Elecrical utilities', 'Schedule D-S&T utilities'];

  it('reads the schedule letter off a heading', () => {
    expect(scheduleTag('Schedule F-CIVIL NS ITEM')).toBe('F');
    expect(scheduleTag('Sch. B2 - Items not covered by USSOR')).toBe('B2');
    expect(scheduleTag('CIVIL NS ITEM')).toBe('');
  });

  it("treats an NS schedule the tender did not carry as added, whatever its wording", () => {
    expect(isAddedSchedule('Schedule F-CIVIL NS ITEM', tender)).toBe(true);
    expect(isAddedSchedule('Schedule E-NS New Items', tender)).toBe(true);
    expect(isAddedSchedule('Schedule G-New NS Electrical', tender)).toBe(true);
  });

  it("leaves the tender's own NS schedule, and its non-NS schedules, alone", () => {
    expect(isAddedSchedule('Schedule B-NS SCHEDULE', tender)).toBe(false);
    expect(isAddedSchedule('Schedule A-DSR GENERAL ITEMS', tender)).toBe(false);
    expect(isAddedSchedule('Schedule C-Elecrical utilities', tender)).toBe(false);
  });

  it('falls back to the heading wording when the contract has no schedules recorded', () => {
    expect(isAddedSchedule('Schedule F-CIVIL NS ITEM', [])).toBe(false);
    expect(isAddedSchedule('Schedule E-NS New Items', [])).toBe(true);
  });

  it('matches a tender schedule by name when the bill heading carries no letter', () => {
    expect(isAddedSchedule('NS SCHEDULE', ['Schedule B-NS SCHEDULE'])).toBe(false);
    expect(isAddedSchedule('CIVIL NS ITEM', ['Schedule B-NS SCHEDULE'])).toBe(true);
  });

  it('findAdditionalNsItems reports the added schedules with the LOA in hand', () => {
    const report = findAdditionalNsItems([
      { itemNo: 'NS23', scheduleHeading: 'Schedule F-CIVIL NS ITEM', amountSinceLastBill: 111850 },
      { itemNo: '5.1', scheduleHeading: 'Schedule A-DSR GENERAL ITEMS', amountSinceLastBill: 916976 },
      { itemNo: 'NS-B1', scheduleHeading: 'Schedule B-NS SCHEDULE', amountSinceLastBill: 5000 },
    ], tender);
    expect(report.candidates.map(c => c.itemNo)).toEqual(['NS23']);
    expect(report.total).toBe(111850);
  });
});


describe('isAddedItemNumber — the NS serial IREPS gives an item ordered during execution', () => {
  it('recognises the NS numbering in its printed forms', () => {
    expect(isAddedItemNumber('NS01')).toBe(true);
    expect(isAddedItemNumber('NS-02(I)')).toBe(true);
    expect(isAddedItemNumber('NS23')).toBe(true);
    expect(isAddedItemNumber(' ns 7 ')).toBe(true);
  });

  it("leaves the tender's own items alone, NS schedule or not", () => {
    expect(isAddedItemNumber('1 (I)')).toBe(false);
    expect(isAddedItemNumber('5.22.6')).toBe(false);
    expect(isAddedItemNumber('025082')).toBe(false);
    expect(isAddedItemNumber('NSI-4')).toBe(false); // not the NS-serial form
    expect(isAddedItemNumber('')).toBe(false);
  });

  it('flags NS23 under "Schedule F-CIVIL NS ITEM" even with no LOA schedules recorded', () => {
    expect(isAddedItem({ itemNo: 'NS23', scheduleHeading: 'Schedule F-CIVIL NS ITEM' }, [])).toBe(true);
    // The tender's NS item under the same kind of heading is not.
    expect(isAddedItem({ itemNo: '3 (I)', scheduleHeading: 'Schedule B-NS SCHEDULE' }, [])).toBe(false);
  });

  it('findAdditionalNsItems reports NS-numbered items with the heading they sat under', () => {
    const report = findAdditionalNsItems([
      { itemNo: 'NS23', scheduleHeading: 'Schedule F-CIVIL NS ITEM', amountSinceLastBill: 111850 },
      { itemNo: '3 (I)', scheduleHeading: 'Schedule B-NS SCHEDULE', amountSinceLastBill: 5000 },
    ]);
    expect(report.candidates.map(c => c.itemNo)).toEqual(['NS23']);
    expect(report.schedules).toEqual(['Schedule F-CIVIL NS ITEM']);
  });
});
