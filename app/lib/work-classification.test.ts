import { describe, it, expect } from 'vitest';
import { inferMainClassification, classificationCodeMatchesWork } from './work-classification';

describe('inferMainClassification', () => {
  it('classifies building works as group 5', () => {
    const r = inferMainClassification('Face lifting of hostel building and masonry repair');
    expect(r.code).toBe('5');
    expect(r.label).toMatch(/Building/i);
    expect(r.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('classifies bridge/protection works as group 6', () => {
    expect(inferMainClassification('Construction of retaining wall near bridge no 112').code).toBe('6');
    expect(inferMainClassification('Rock-fall protection arrangement').code).toBe('6');
  });

  it('classifies earthwork as group 1', () => {
    expect(inferMainClassification('Earthwork in embankment formation and compaction').code).toBe('1');
  });

  it('weighs the repeated scope over a group named once in passing', () => {
    // SR/MDU/Civil/2024/0037. "formation" twice (the actual scope) against
    // "retaining wall" once and a "Permanent way" that is only the addressee's
    // designation. All three tied at one distinct match, and group 7 has no B/C
    // sub-divisions, so losing this tie would have cost the TMT item its steel index.
    const r = inferMainClassification(
      '(SW I):-Kudal Nagar Goods yard:-Proposed standardization of formation at isolated '
      + 'locations for a length of 3.353 km including retaining wall. (SW II):-Senior Section '
      + 'Engineer /Permanent way/BG/Madurai sec:-Proposed strengthening of existing formation '
      + 'by providing pitching over the existing slope of the embankement at isolated locations '
      + 'for a length of 2709 meters between Km.492.600 to 491.600.',
    );
    expect(r.code).toBe('1');
  });

  it('reads the common "embankement" misspelling as embankment', () => {
    expect(inferMainClassification('Strengthening the existing embankement slope').code).toBe('1');
  });

  it('classifies tunnels: 3 without explosives, 4 with blasting', () => {
    expect(inferMainClassification('Tunnel boring works').code).toBe('3');
    expect(inferMainClassification('Tunnel excavation using controlled blasting').code).toBe('4');
  });

  it('returns group 9 with no matched keywords for unrelated text', () => {
    const r = inferMainClassification('completely unrelated administrative note');
    expect(r.code).toBe('9');
    expect(r.matchedKeywords).toEqual([]);
  });

  it('handles empty / nullish input safely', () => {
    expect(inferMainClassification('').code).toBe('9');
    expect(inferMainClassification(undefined as unknown as string).code).toBe('9');
  });
});

describe('classificationCodeMatchesWork', () => {
  it('matches a sub-code to the inferred main group', () => {
    expect(classificationCodeMatchesWork('5A', 'hostel building renovation')).toBe(true);
    expect(classificationCodeMatchesWork('6B', 'hostel building renovation')).toBe(false);
  });
});
