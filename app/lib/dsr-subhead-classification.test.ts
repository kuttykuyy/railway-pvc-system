import { describe, it, expect } from 'vitest';
import {
  subHeadNumberFromItemNo,
  inferCpwdDsrSubHead,
  inferUssorChapter,
  inferScheduleSubHead,
  CPWD_DSR_SUBHEADS,
  USSOR_2021_CHAPTERS,
  CONTEXT,
} from './dsr-subhead-classification';

describe('subHeadNumberFromItemNo', () => {
  it('takes the leading integer of a DSR item number', () => {
    expect(subHeadNumberFromItemNo('16.3.3')).toBe(16);
    expect(subHeadNumberFromItemNo('2.25')).toBe(2);
    expect(subHeadNumberFromItemNo('5.33.1.1')).toBe(5);
    expect(subHeadNumberFromItemNo('6.1.2')).toBe(6);
  });

  it('returns null for missing or non-numeric item numbers', () => {
    expect(subHeadNumberFromItemNo('')).toBeNull();
    expect(subHeadNumberFromItemNo(undefined)).toBeNull();
    expect(subHeadNumberFromItemNo('ABC')).toBeNull();
  });
});

describe('inferCpwdDsrSubHead', () => {
  it('classifies a Road Work item by its number when the schedule is DSR (user example → group 9)', () => {
    const r = inferCpwdDsrSubHead({ itemNo: '16.3.3', sourceBook: 'DSR_2021' });
    expect(r).toEqual({ number: 16, name: 'Road Work', gccGroup: '9' });
  });

  it('works from the printed Chapter Name when the schedule is not detected as DSR', () => {
    const r = inferCpwdDsrSubHead({ itemNo: '16.1', chapter: 'ROAD WORK', sourceBook: 'UNKNOWN' });
    expect(r?.gccGroup).toBe('9');
  });

  it('classifies RCC items by sub-head', () => {
    expect(inferCpwdDsrSubHead({ itemNo: '5.33.1.1', sourceBook: 'DSR_2021' })?.gccGroup).toBe('5');
  });

  it('marks context-dependent sub-heads (Earth Work, Pile work, plumbing) as CONTEXT', () => {
    expect(inferCpwdDsrSubHead({ itemNo: '2.25', sourceBook: 'DSR_2021' })?.gccGroup).toBe(CONTEXT);
    expect(inferCpwdDsrSubHead({ itemNo: '20.1', sourceBook: 'DSR_2021' })?.gccGroup).toBe(CONTEXT);
    expect(inferCpwdDsrSubHead({ itemNo: '18.2', sourceBook: 'DSR_2021' })?.gccGroup).toBe(CONTEXT);
  });

  it('does not guess when neither the schedule nor the chapter confirms CPWD DSR', () => {
    expect(inferCpwdDsrSubHead({ itemNo: '16.3.3', sourceBook: 'UNKNOWN' })).toBeNull();
    expect(inferCpwdDsrSubHead({ itemNo: '16.3.3', chapter: 'SOME OTHER HEADING', sourceBook: 'UNKNOWN' })).toBeNull();
  });

  it('returns null for a sub-head number outside the table', () => {
    expect(inferCpwdDsrSubHead({ itemNo: '99.1', sourceBook: 'DSR_2021' })).toBeNull();
  });

  it('every mapped sub-head has a valid GCC group 1-9 or CONTEXT', () => {
    for (const entry of Object.values(CPWD_DSR_SUBHEADS)) {
      expect(entry.gccGroup === CONTEXT || /^[1-9]$/.test(entry.gccGroup)).toBe(true);
    }
  });
});

describe('inferUssorChapter', () => {
  it('classifies bridge chapters as Group 6 from the printed chapter name', () => {
    expect(inferUssorChapter({ chapter: 'BRIDGE WORKS - SUBSTRUCTURE', sourceBook: 'USSR_2021' })?.gccGroup).toBe('6');
    expect(inferUssorChapter({ chapter: 'Bridge Works - Super Structure (Steel)', sourceBook: 'USSR_2021' })?.gccGroup).toBe('6');
  });

  it('classifies P-Way chapters as Group 7', () => {
    expect(inferUssorChapter({ chapter: 'RAILS, SLEEPERS AND FITTINGS RENEWAL', sourceBook: 'USSR_2021' })?.gccGroup).toBe('7');
    expect(inferUssorChapter({ chapter: 'Welding Activities', sourceBook: 'USSR_2021' })?.gccGroup).toBe('7');
    expect(inferUssorChapter({ chapter: 'Turnouts and Renewals', sourceBook: 'USSR_2021' })?.gccGroup).toBe('7');
  });

  it('marks context-dependent chapters (Earth Work, Deep Screening/Ballast, Level Crossings) as CONTEXT', () => {
    expect(inferUssorChapter({ chapter: 'EARTH WORK', sourceBook: 'USSR_2021' })?.gccGroup).toBe(CONTEXT);
    expect(inferUssorChapter({ chapter: 'Deep Screening and Ballast Related Activities', sourceBook: 'USSR_2021' })?.gccGroup).toBe(CONTEXT);
    expect(inferUssorChapter({ chapter: 'Level Crossings', sourceBook: 'USSR_2021' })?.gccGroup).toBe(CONTEXT);
  });

  it('falls back to the item number leading integer when the chapter is missing', () => {
    expect(inferUssorChapter({ itemNo: '11.4.2', sourceBook: 'USSR_2021' })?.gccGroup).toBe('1'); // Formation Rehabilitation
  });

  it('never applies to non-USSOR items', () => {
    expect(inferUssorChapter({ chapter: 'EARTH WORK', sourceBook: 'DSR_2021' })).toBeNull();
  });

  it('every USSOR chapter has a valid GCC group 1-9 or CONTEXT', () => {
    for (const entry of Object.values(USSOR_2021_CHAPTERS)) {
      expect(entry.gccGroup === CONTEXT || /^[1-9]$/.test(entry.gccGroup)).toBe(true);
    }
  });
});

describe('inferScheduleSubHead (dispatcher)', () => {
  it('routes USSOR items to the USSOR table and DSR items to the CPWD table', () => {
    // Same chapter text, different schedule: USSOR "Formation Rehabilitation" → 1;
    // DSR item 16.x → Road Work → 9.
    expect(inferScheduleSubHead({ chapter: 'FORMATION REHABILITATION', sourceBook: 'USSR_2021' })?.gccGroup).toBe('1');
    expect(inferScheduleSubHead({ itemNo: '16.3.3', sourceBook: 'DSR_2021' })?.gccGroup).toBe('9');
  });
});
