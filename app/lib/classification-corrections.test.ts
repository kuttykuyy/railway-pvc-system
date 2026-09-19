import { describe, expect, it } from 'vitest';
import { summariseCorrections, type CorrectionEntry } from './classification-corrections';
import { composeJustification } from './classification-justification';

const codes = new Map([['a', '5A'], ['d', '6D'], ['b', '5B']]);
const entry = (suggested: string, accepted: string, over: Partial<CorrectionEntry> = {}): CorrectionEntry => ({
  suggestedSubClassificationId: suggested,
  subClassificationId: accepted,
  amount: 1000,
  itemNumber: '041370',
  description: 'Steel work in built up sections',
  ...over,
});

describe('summariseCorrections', () => {
  it('counts a correction only where the accepted code differs from the suggested one', () => {
    const report = summariseCorrections([entry('a', 'd'), entry('a', 'a'), entry('a', 'a')], codes);
    expect(report.corrected).toBe(1);
    expect(report.accepted).toBe(2);
    expect(report.correctionRate).toBeCloseTo(1 / 3);
    expect(report.moves).toHaveLength(1);
    expect(report.moves[0]).toMatchObject({ suggested: '5A', accepted: '6D', count: 1, amount: 1000 });
  });

  it('puts the move with the most entries behind it first', () => {
    const report = summariseCorrections([
      entry('a', 'b', { amount: 900000, itemNumber: '999' }),
      entry('a', 'd'), entry('a', 'd'), entry('a', 'd'),
    ], codes);
    expect(report.moves.map(move => `${move.suggested}->${move.accepted}`)).toEqual(['5A->6D', '5A->5B']);
    expect(report.moves[0].count).toBe(3);
    expect(report.moves[0].amount).toBe(3000);
  });

  it('lists the schedule items a move happened on, most frequent first', () => {
    const report = summariseCorrections([
      entry('a', 'd', { itemNumber: '041370' }),
      entry('a', 'd', { itemNumber: '041370' }),
      entry('a', 'd', { itemNumber: '195010' }),
    ], codes);
    expect(report.moves[0].items).toEqual([
      { itemNumber: '041370', count: 2, description: 'Steel work in built up sections' },
      { itemNumber: '195010', count: 1, description: 'Steel work in built up sections' },
    ]);
  });

  it('skips an entry whose classification has since been deleted rather than guessing', () => {
    const report = summariseCorrections([entry('a', 'gone'), entry('vanished', 'd')], codes);
    expect(report.corrected).toBe(0);
    expect(report.accepted).toBe(0);
    expect(report.correctionRate).toBeNull();
  });

  it('reports no rate at all before anything has been classified', () => {
    expect(summariseCorrections([], codes)).toMatchObject({ corrected: 0, accepted: 0, correctionRate: null, moves: [] });
  });
});

describe('composeJustification — what the officer must check', () => {
  it('puts an open question last, after the conclusion', () => {
    const text = composeJustification({
      code: '6D',
      groupReason: 'Item 041370 is USSOR 2021 chapter 04 — Bridge Works.',
      checkNote: 'the USSOR 2021 row for item 041370 describes different work from what the bill prints',
    });
    expect(text).toMatch(/Classified 6D .*\. PLEASE CHECK: the USSOR 2021 row/);
  });

  it('says nothing extra when there is nothing to check', () => {
    const text = composeJustification({ code: '6A', groupReason: 'Name of Work names "bridge".' });
    expect(text).not.toMatch(/PLEASE CHECK/);
  });
});
