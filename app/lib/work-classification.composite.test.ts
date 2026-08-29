import { describe, expect, it } from 'vitest';
import { looksCompositeWork } from './work-classification';

describe('looksCompositeWork', () => {
  it('detects the real Ponmalai six-sub-work agreement', () => {
    const name = 'Central Workshops/Ponmalai (i) Renewal of roof in foundry shop, (ii) Renewal of worn out EOT crane gantry rails in Wheel Shop, BRS and Diesel POH shop, (iii) Provision of CC apron and Complete Track renewal in Coach water jet Main line and Loop line, (iv) Improvements to Roller Bearing section in Wheel Shop, (v) Provision of New Painting Shed behind HERS shop at Diesel POH and (vi) GOC- DTTC : Conversion of Existing Class room into Computer based test room and Face-lifting of Hostel building.';
    const result = looksCompositeWork(name);
    expect(result.isComposite).toBe(true);
    expect(result.subWorkCount).toBe(6);
  });

  it('detects numeric enumeration too', () => {
    expect(looksCompositeWork('Provision of (1) staff quarters and (2) approach road at XYZ').isComposite).toBe(true);
  });

  it('does not fire on a single-scope name', () => {
    expect(looksCompositeWork('Earthwork in formation between km 12 and km 18').isComposite).toBe(false);
    expect(looksCompositeWork('').isComposite).toBe(false);
  });

  it('one marker alone is not composite', () => {
    expect(looksCompositeWork('Renewal of roof (i) foundry shop').isComposite).toBe(false);
  });
});
