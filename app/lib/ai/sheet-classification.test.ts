import { describe, expect, it } from 'vitest';
import { applySheetClassification, buildSheetClassificationPrompt, type SheetClassificationItem } from './sheet-classification';

describe('sheet classification', () => {
  const items = (): SheetClassificationItem[] => [
    { itemNo: '025082', description: 'Thermo-Mechanically Treated bars of grade Fe-500D', isSteelItem: true, steelType: 'TMT', amountSinceLastBill: 3370273 },
    { itemNo: '022032', description: '1:2:4 (1 cement : 2 coarse sand : 4 graded stone aggregate)', isCementAffected: true, amountSinceLastBill: 542893 },
    { itemNo: '10.2', description: 'Structural steel work riveted, bolted or welded in built up sections', isSteelItem: true, steelType: 'ANGLE_CHANNEL' },
  ];

  it('asks about every item, with the main group fixed from the Name of Work', () => {
    const prompt = buildSheetClassificationPrompt({ workDescription: 'Construction of LHS in lieu of LC', mainCode: '6', items: items() });
    expect(prompt).toContain('Main classification group already decided from the Name of Work: 6');
    expect(prompt).toContain('"itemNo":"025082"');
    expect(prompt).toContain('"n":3');
  });

  it('applies well-formed codes and their reasons, by item number n', () => {
    const list = items();
    const applied = applySheetClassification(list, {
      items: [
        { n: 1, code: '6b', reason: 'Separate supply of TMT bars.' },
        { n: 2, code: '6A', reason: 'Concrete work.' },
        { n: 3, code: '6D', reason: 'Structural steel work priced with its steel.' },
      ],
    });
    expect(applied).toBe(3);
    expect(list.map(i => i.suggestedClassificationCode)).toEqual(['6B', '6A', '6D']);
    expect(list[0].suggestedClassificationReason).toBe('Separate supply of TMT bars.');
  });

  it('ignores anything malformed and leaves those items to the deterministic classifier', () => {
    const list = items();
    const applied = applySheetClassification(list, {
      items: [
        { n: 1, code: '6BB' },
        { n: 2, code: 'A' },
        { n: 9, code: '6A' },
        { n: 3, code: '6E' },
      ],
    });
    expect(applied).toBe(1);
    expect(list[0].suggestedClassificationCode).toBeUndefined();
    expect(list[1].suggestedClassificationCode).toBeUndefined();
    expect(list[2].suggestedClassificationCode).toBe('6E');
  });

  it('does not fall over on a reply that is not the shape asked for', () => {
    const list = items();
    expect(applySheetClassification(list, null)).toBe(0);
    expect(applySheetClassification(list, { items: 'nope' })).toBe(0);
    expect(applySheetClassification(list, 'garbage')).toBe(0);
  });
});
