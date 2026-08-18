import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DSR_BASE_RATE,
  contractCementRateSettings,
  deriveCementRate,
  isBlankCementRateSettings,
} from './dsr-cement-rate';

describe('deriveCementRate', () => {
  it('returns the base rate when nothing is agreed', () => {
    const { perQuintal, perMt } = deriveCementRate(DEFAULT_DSR_BASE_RATE, null);
    expect(perQuintal).toBeCloseTo(688.45, 4);
    expect(perMt).toBeCloseTo(6884.5, 4);
  });

  it('applies escalation, then bid rate, then rebate — in that order', () => {
    const { perQuintal } = deriveCementRate(1000, { escalation: '10', bidRate: '5', rebate: '2' });
    // 1000 -> 1100 -> 1155 -> 1131.9
    expect(perQuintal).toBeCloseTo(1131.9, 6);
  });

  it('is not commutative — a rebate applied to the base is a different figure', () => {
    const ordered = deriveCementRate(1000, { escalation: '10', bidRate: '5', rebate: '2' }).perQuintal;
    const rebateFirst = 1000 * (1 - 2 / 100) * (1 + 10 / 100) * (1 + 5 / 100);
    expect(ordered).toBeCloseTo(rebateFirst, 6);
  });

  it('takes a negative escalation as a reduction', () => {
    const { perQuintal } = deriveCementRate(1000, { escalation: '-25', bidRate: '', rebate: '' });
    expect(perQuintal).toBeCloseTo(750, 6);
  });

  it('reads a per-MT rate as ten times the per-quintal rate', () => {
    const { perQuintal, perMt } = deriveCementRate(688.45, { escalation: '3.8', bidRate: '-1.5', rebate: '0.5' });
    expect(perMt).toBeCloseTo(perQuintal * 10, 8);
  });

  it('treats unparseable and empty settings as zero rather than NaN', () => {
    const { perQuintal } = deriveCementRate(500, { escalation: '', bidRate: 'abc', rebate: '   ' });
    expect(perQuintal).toBe(500);
  });
});

describe('contractCementRateSettings', () => {
  const schedules = [
    { name: 'Schedule A1', escalation: '-25.00', bidRate: '3.80' },
    { name: 'Schedule B2', escalation: '', bidRate: '1.10' },
  ];

  it('takes escalation and bid rate from the matching schedule and the rebate from the agreement', () => {
    expect(contractCementRateSettings(schedules, 'Schedule A1', 0.5)).toEqual({
      escalation: '-25.00',
      bidRate: '3.80',
      rebate: '0.5',
    });
  });

  it('matches a schedule by its code when the bill spells the name out in full', () => {
    const settings = contractCementRateSettings(schedules, 'Schedule A1-(List of works in DSR 2021)', null);
    expect(settings.escalation).toBe('-25.00');
    expect(settings.bidRate).toBe('3.80');
  });

  it('leaves the rates blank when the contract records none for that schedule', () => {
    expect(contractCementRateSettings(schedules, 'Schedule Z9', null)).toEqual({
      escalation: '',
      bidRate: '',
      rebate: '',
    });
  });

  it('carries a zero rebate through as "0", not as absent', () => {
    expect(contractCementRateSettings(schedules, 'Schedule A1', 0).rebate).toBe('0');
  });

  it('derives the base rate alone when the contract agreed nothing', () => {
    const settings = contractCementRateSettings([], 'Schedule A1', null);
    expect(deriveCementRate(DEFAULT_DSR_BASE_RATE, settings).perQuintal).toBeCloseTo(DEFAULT_DSR_BASE_RATE, 6);
  });
});

describe('isBlankCementRateSettings', () => {
  it('is blank when absent or wholly empty', () => {
    expect(isBlankCementRateSettings(null)).toBe(true);
    expect(isBlankCementRateSettings(undefined)).toBe(true);
    expect(isBlankCementRateSettings({ escalation: '', bidRate: '', rebate: '' })).toBe(true);
  });

  it('is not blank once any one field is set — including a "0" the user chose', () => {
    expect(isBlankCementRateSettings({ escalation: '0', bidRate: '', rebate: '' })).toBe(false);
    expect(isBlankCementRateSettings({ escalation: '', bidRate: '', rebate: '2.5' })).toBe(false);
  });
});
