import { describe, expect, it } from 'vitest';
import { findSubWorkRates } from './contract-schedules';

/** Schedule A4 of SR/TPJ/Civil/2025/0067 as the LOA awards it: one schedule, three
 * sub-works, two escalations. */
const schedules = [
  {
    name: 'A4',
    escalation: '',
    bidRate: '10',
    subWorks: [
      { name: 'Provision of CC apron and Complete Track renewal in Coach water jet Main line and Loop line.', escalation: '5.36', bidRate: '10' },
      { name: 'Provision of New Painting Shed behind HERS shop at Diesel POH/GOC', escalation: '5.36', bidRate: '10' },
      { name: 'Diesel Traction Training Center/GOC-Conversion of Existing Class room into Computer based', escalation: '0', bidRate: '10' },
    ],
  },
  { name: 'A3', escalation: '', bidRate: '30', subWorks: [] },
];

describe('findSubWorkRates', () => {
  it('prices a sub-work at its own escalation, not the schedule average', () => {
    const apron = findSubWorkRates(schedules, 'A4', 'Provision of CC apron and Complete Track renewal in Coach water jet Main line and Loop line.');
    expect(apron?.escalation).toBe('5.36');
    const dttc = findSubWorkRates(schedules, 'A4', 'Diesel Traction Training Center/GOC-Conversion of Existing Class room into Computer based test room and Face-lifting of Hostel building.');
    expect(dttc?.escalation).toBe('0');
  });

  it('matches the bill heading against the LOA wording despite small differences', () => {
    // The bill's Group Name ends "Diesel POH/GOC"; the LOA row ends "at Diesel POH and".
    const shed = findSubWorkRates(schedules, 'A4', 'Provision of New Painting Shed behind HERS shop at Diesel POH/GOC');
    expect(shed?.escalation).toBe('5.36');
  });

  it('falls back to the schedule where no sub-work matches or none are held', () => {
    expect(findSubWorkRates(schedules, 'A4', 'Something the LOA never priced')?.bidRate).toBe('10');
    expect(findSubWorkRates(schedules, 'A3', 'Horticulture work')?.bidRate).toBe('30');
    expect(findSubWorkRates(schedules, 'A4')?.bidRate).toBe('10');
  });

  it('fills a blank sub-work figure from the schedule level', () => {
    const partial = [{ name: 'B1', escalation: '2', bidRate: '17', subWorks: [{ name: 'Roof renewal', escalation: '', bidRate: '' }] }];
    const rates = findSubWorkRates(partial, 'B1', 'Roof renewal');
    expect(rates?.escalation).toBe('2');
    expect(rates?.bidRate).toBe('17');
  });
});
