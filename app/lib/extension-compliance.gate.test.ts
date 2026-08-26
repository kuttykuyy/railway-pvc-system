import { describe, expect, it } from 'vitest';
import { contractCoveredUntil, billRequiresExtension } from './extension-compliance';

const d = (s: string) => new Date(s + 'T00:00:00Z');

describe('contractCoveredUntil', () => {
  it('takes the extended date when the contract has been extended', () => {
    const until = contractCoveredUntil({
      originalCompletionDate: d('2025-03-31'),
      currentCompletionDate: d('2025-09-30'),
    });
    expect(until?.toISOString().slice(0, 10)).toBe('2025-09-30');
  });

  it('falls back to opening plus the agreed period when no dates are stored', () => {
    const until = contractCoveredUntil({ dateOfOpening: d('2024-01-15'), completionPeriodMonths: 9 });
    expect(until?.toISOString().slice(0, 10)).toBe('2024-10-15');
  });

  it('is null when the contract knows no completion at all', () => {
    expect(contractCoveredUntil({})).toBeNull();
  });
});

describe('billRequiresExtension', () => {
  const contract = { originalCompletionDate: d('2025-03-31'), currentCompletionDate: d('2025-03-31') };

  it('blocks a bill measured after the covered date', () => {
    expect(billRequiresExtension(contract, d('2025-04-15')).blocked).toBe(true);
  });

  it('allows a bill measured on or before the covered date', () => {
    expect(billRequiresExtension(contract, d('2025-03-31')).blocked).toBe(false);
    expect(billRequiresExtension(contract, d('2025-02-01')).blocked).toBe(false);
  });

  it('stops blocking once an extension pushes the covered date out', () => {
    const extended = { originalCompletionDate: d('2025-03-31'), currentCompletionDate: d('2025-09-30') };
    expect(billRequiresExtension(extended, d('2025-04-15')).blocked).toBe(false);
  });

  it('never blocks when there is no completion date to judge against', () => {
    expect(billRequiresExtension({}, d('2025-04-15')).blocked).toBe(false);
  });

  it('compares by day, not by the time of day', () => {
    const c = { originalCompletionDate: new Date('2025-03-31T18:00:00Z') };
    expect(billRequiresExtension(c, new Date('2025-03-31T02:00:00Z')).blocked).toBe(false);
  });
});
