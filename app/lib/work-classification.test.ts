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
