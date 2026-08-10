import { describe, expect, it } from 'vitest';
import { matchExtractedSchedule, scheduleTag, shortScheduleName, scheduleWorkName } from './bill-schedule-matching';

/**
 * The schedules of SR/TPJ/Civil/2025/0067/B7, as the bill prints them. Every B schedule
 * repeats the same sentence and differs only by its tag, which is what defeated the
 * word-by-word matching.
 */
const B4 = 'Schedule B4-Items which are not covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for Tiruchirappalli Division. DTTC hostel/Diesel shed/Ponmalai.';
const B2 = 'Schedule B2-Items which are not covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for Tiruchirappalli Division. (The tenderer/contractor shall quote unit rate)-Renewal of worn out EOT crane gantry rails in Wheel Shop, BRS and Diesel POH shop';
const A4 = 'Schedule A4-All items which are covered by Unified Standard Schedule of rates 2021 for Tiruchirappalli Division - Except supply of cement and reinforcement steel.';

describe('matchExtractedSchedule', () => {
  it('matches a bare contract tag against the schedule the bill spells out', () => {
    const contract = ['A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4'];
    expect(matchExtractedSchedule(contract, [B4])).toBe('B4');
    expect(matchExtractedSchedule(contract, [B2])).toBe('B2');
    expect(matchExtractedSchedule(contract, [A4])).toBe('A4');
  });

  it('tells B schedules apart though they share every word but the tag', () => {
    const contract = ['B1', 'B2', 'B3', 'B4'];
    expect(matchExtractedSchedule(contract, [B4])).not.toBe('B1');
    expect(matchExtractedSchedule(contract, [B4])).toBe('B4');
  });

  it('still matches when the contract writes the word out too', () => {
    expect(matchExtractedSchedule(['Schedule B4', 'Schedule B2'], [B4])).toBe('Schedule B4');
  });

  it('handles a hyphenated or spaced tag', () => {
    expect(matchExtractedSchedule(['B-4', 'B-2'], [B4])).toBe('B-4');
    expect(matchExtractedSchedule(['B 4', 'B 2'], [B4])).toBe('B 4');
  });

  it('returns the extracted value when the contract lists no schedules', () => {
    expect(matchExtractedSchedule([], [B4])).toBe(B4);
  });

  it('gives nothing rather than a guess when no tag matches', () => {
    expect(matchExtractedSchedule(['C1', 'C2'], [B4])).toBe('');
  });
});

describe('scheduleTag', () => {
  it('reduces a spelled-out schedule to its tag', () => {
    expect(scheduleTag(B4)).toBe('B4');
    expect(scheduleTag(A4)).toBe('A4');
  });

  it('leaves a bare tag alone', () => {
    expect(scheduleTag('B4')).toBe('B4');
  });

  it('returns the text unchanged when it carries no tag, for the caller to clamp', () => {
    expect(scheduleTag('Miscellaneous works')).toBe('Miscellaneous works');
  });
});

describe('shortScheduleName', () => {
  it('keeps the tag and the work, drops the boilerplate', () => {
    expect(shortScheduleName(B2))
      .toBe('B2 - Renewal of worn out EOT crane gantry rails in Wheel Shop, BRS and Diesel POH shop');
    expect(shortScheduleName(B4)).toBe('B4 - DTTC hostel/Diesel shed/Ponmalai');
  });

  it('returns the tag alone where the schedule names no work', () => {
    expect(shortScheduleName(A4)).toBe('A4');
    expect(shortScheduleName('B4')).toBe('B4');
  });

  it('leaves text with no tag untouched rather than mangling it', () => {
    expect(shortScheduleName('Miscellaneous works')).toBe('Miscellaneous works');
  });

  it('still matches a bill after shortening', () => {
    expect(matchExtractedSchedule([shortScheduleName(B2), shortScheduleName(B4)], [B2]))
      .toBe(shortScheduleName(B2));
  });
});

describe('scheduleWorkName', () => {
  it('gives the sub-work alone, for entries whose bill printed no Group Name', () => {
    expect(scheduleWorkName(B2)).toBe('Renewal of worn out EOT crane gantry rails in Wheel Shop, BRS and Diesel POH shop');
    expect(scheduleWorkName(B4)).toBe('DTTC hostel/Diesel shed/Ponmalai');
  });

  it('keeps a dash-joined sub-work that the boilerplate strip used to eat', () => {
    const B1 = 'Schedule B1-Items which are not covered by Unified Standard Schedule of rates 2021 and CPWD-DSR-2021 for Tiruchirappalli Division- Renewal of roofing sheet in foundry shop. (The tenderer/contractor shall quote unit rate)';
    expect(scheduleWorkName(B1)).toBe('Renewal of roofing sheet in foundry shop');
  });

  it('gives nothing where the heading names no work', () => {
    expect(scheduleWorkName(A4)).toBe('');
    expect(scheduleWorkName('B4')).toBe('');
    expect(scheduleWorkName('Miscellaneous works')).toBe('');
  });
});
