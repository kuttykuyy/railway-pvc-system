import { describe, expect, it } from 'vitest';
import { pickMonthlyValue } from './cpwd-10cc-indices';

describe('pickMonthlyValue', () => {
  const rows = [
    { month: '2024-03', value: 139.2 },
    { month: '2026-05', value: 147.3 },
    { month: '2026-07', value: 148.1 },
  ];

  it('takes the exact month when present', () => {
    expect(pickMonthlyValue(rows, '2026-07')?.value).toBe(148.1);
  });

  it('holds the latest earlier month when the target is not published', () => {
    expect(pickMonthlyValue(rows, '2026-09')?.month).toBe('2026-07');
  });

  it('returns null when the target predates all data', () => {
    expect(pickMonthlyValue(rows, '2024-02')).toBeNull();
  });

  it('is order-independent', () => {
    expect(pickMonthlyValue([rows[2], rows[0], rows[1]], '2026-06')?.month).toBe('2026-05');
  });
});
