import { describe, expect, it } from 'vitest';
import { findExtraItems } from './extra-items';

const B2 = 'Schedule B2-Items which are not covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for Tiruchirappalli Division.';
const A4 = 'Schedule A4-All items which are covered by Unified Standard Schedule of rates 2021 for Tiruchirappalli Division.';

const contract = [
  { name: 'A4', escalation: '', bidRate: '', items: [] },
  { name: 'B2', escalation: '', bidRate: '', items: ['1', '2', '3'] },
];

const item = (over: Record<string, unknown>) => ({
  itemNo: '1', schedule: B2, amountSinceLastBill: 1000, description: 'x', ...over,
});

describe('findExtraItems', () => {
  it('reports a B item the LOA never listed', () => {
    const report = findExtraItems([item({ itemNo: '4', amountSinceLastBill: 5000 })], contract);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].itemNo).toBe('4');
    expect(report.total).toBe(5000);
  });

  it('leaves items the LOA accepted alone', () => {
    expect(findExtraItems([item({ itemNo: '2' })], contract).candidates).toHaveLength(0);
  });

  it('never judges an A schedule — an LOA does not list a published book item by item', () => {
    const report = findExtraItems([item({ itemNo: '082011', schedule: A4 })], contract);
    expect(report.candidates).toHaveLength(0);
  });

  it('judges nothing where the LOA listed no items for that schedule', () => {
    const noItems = [{ name: 'B2', escalation: '', bidRate: '', items: [] }];
    const report = findExtraItems([item({ itemNo: '9' })], noItems);
    expect(report.candidates).toHaveLength(0);
    expect(report.schedulesWithoutLoaItems).toEqual(['B2']);
  });

  it('treats the same number written differently as the same item', () => {
    const spaced = [{ name: 'B2', escalation: '', bidRate: '', items: ['1710 14'] }];
    expect(findExtraItems([item({ itemNo: '171014' })], spaced).candidates).toHaveLength(0);
  });

  it('keeps a sub-item apart from its parent', () => {
    expect(findExtraItems([item({ itemNo: '1.1' })], contract).candidates).toHaveLength(1);
  });

  it('adds up several extras', () => {
    const report = findExtraItems([
      item({ itemNo: '4', amountSinceLastBill: 5000 }),
      item({ itemNo: '5', amountSinceLastBill: 2500.5 }),
      item({ itemNo: '1', amountSinceLastBill: 9999 }),
    ], contract);
    expect(report.candidates).toHaveLength(2);
    expect(report.total).toBe(7500.5);
  });
});
