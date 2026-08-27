import { describe, expect, it } from 'vitest';
import { parseNsrCivil10ca, monthLabelToYYYYMM } from './cpwd-price-fetcher';

describe('monthLabelToYYYYMM', () => {
  it('parses "Mon YYYY" labels', () => {
    expect(monthLabelToYYYYMM('Dec 2025')).toBe('2025-12');
    expect(monthLabelToYYYYMM('Jan 2018')).toBe('2018-01');
    expect(monthLabelToYYYYMM('Oct 2012')).toBe('2012-10');
  });
  it('returns null for junk', () => {
    expect(monthLabelToYYYYMM('later')).toBeNull();
    expect(monthLabelToYYYYMM('2025')).toBeNull();
  });
});

describe('parseNsrCivil10ca', () => {
  // A snippet in the exact shape NSRCivil embeds.
  const html = `stuff before
    {month:'Dec 2025',year:2025,opc:4915.25,ppc:4237.29,tmt:45760,struct:48410,diesel:87.62,opc_i:123.56,ppc_i:114.18,tmt_i:101.39,struct_i:116.57,diesel_i:186.62,circ:'x'}
    {month:'Nov 2025',year:2025,opc:4915.25,ppc:4186.44,tmt:46800,struct:48493,diesel:87.67,opc_i:123.56,ppc_i:112.81,tmt_i:103.69,struct_i:116.77,diesel_i:186.73,circ:'y'}
    stuff after`;

  it('expands each month into one row per material', () => {
    const rows = parseNsrCivil10ca(html);
    // 2 months × 5 materials = 10 rows
    expect(rows).toHaveLength(10);
    const opcDec = rows.find(r => r.material === 'cement-opc' && r.month === '2025-12');
    expect(opcDec).toEqual({ region: 'delhi-ncr', material: 'cement-opc', month: '2025-12', price: 4915.25, aipi: 123.56 });
    const tmtNov = rows.find(r => r.material === 'steel-tmt' && r.month === '2025-11');
    expect(tmtNov?.price).toBe(46800);
  });

  it('maps struct→steel-structural and diesel→diesel', () => {
    const rows = parseNsrCivil10ca(html);
    expect(rows.find(r => r.material === 'steel-structural' && r.month === '2025-12')?.price).toBe(48410);
    expect(rows.find(r => r.material === 'diesel' && r.month === '2025-12')?.price).toBe(87.62);
  });

  it('skips a block with no OPC price and unparseable months', () => {
    expect(parseNsrCivil10ca(`{month:'later',opc:100}`)).toHaveLength(0);
    expect(parseNsrCivil10ca(`{month:'Dec 2025',ppc:4000}`)).toHaveLength(0); // no opc → skipped
  });
});
