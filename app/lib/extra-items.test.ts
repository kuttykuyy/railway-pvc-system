import { describe, expect, it } from 'vitest';
import { findAdditionalNsItems, isAdditionalNsSchedule } from './extra-items';

const D = 'Schedule D-Additional NS item';
const B2 = 'Schedule B2-Items which are not covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for Tiruchirappalli Division.';
const A4 = 'Schedule A4-All items which are covered by Unified Standard Schedule of rates 2021 for Tiruchirappalli Division.';

describe('isAdditionalNsSchedule', () => {
  it('recognises the headings IREPS prints for items added after the agreement', () => {
    expect(isAdditionalNsSchedule(D)).toBe(true);
    expect(isAdditionalNsSchedule('Schedule E - Extra NS Items')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule C: New Non-Schedule items')).toBe(true);
    expect(isAdditionalNsSchedule('Schedule F - Extra items')).toBe(true);
  });

  it("leaves the tender's own schedules alone", () => {
    expect(isAdditionalNsSchedule(B2)).toBe(false);
    expect(isAdditionalNsSchedule(A4)).toBe(false);
    expect(isAdditionalNsSchedule('Schedule B - NS items')).toBe(false);
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
