import { describe, expect, it } from 'vitest';
import ussor from '../data/ussor-2021.json';
// The build script's own function, so the shipped book and a regenerated one are
// stripped by exactly the same rule.
const { stripCarriedOverHeadings } = require('../scripts/strip-carried-over-headings') as {
  stripCarriedOverHeadings: (items: Array<{ c: string; d: string }>) => string[];
};

const itemOf = (code: string) => (ussor as { items: Array<{ c: string; d: string; u: string }> })
  .items.find(item => item.c === code)!;

describe('stripCarriedOverHeadings', () => {
  it('drops a previous item that was stored as this item\'s heading', () => {
    const slewing = 'Longitudinally slewing of steel plate girders of span 12.2m to 24.4m under traffic block using contractor\'s own hydraulic jacks of 100 tons capacity without damaging the girder and track alignment and cross levels.';
    const items = [
      { c: '041352', d: `${slewing} For Span above 18.3 M to 24.4 M` },
      { c: '041360', d: `${slewing} Arresting leakage of oil from oil bath tank of rocker and roller bearings of nominated OWG bridges of all types of spans under traffic conditions with contractor's labour and materials.` },
    ];
    expect(stripCarriedOverHeadings(items)).toEqual(['041360']);
    expect(items[1].d).toMatch(/^Arresting leakage of oil/);
  });

  it('keeps a real heading, which siblings differ from only by a short variant', () => {
    const heading = 'Providing road crane of specified lifting capacity with specified jib length revolving type for material handling, assembly & erection of girders/slab/RCC Box etc.';
    const items = [
      { c: '041201', d: `${heading} 12 MT capacity` },
      { c: '041202', d: `${heading} 20 MT capacity` },
    ];
    expect(stripCarriedOverHeadings(items)).toEqual([]);
    expect(items[1].d).toBe(`${heading} 20 MT capacity`);
  });

  it('compares each item with what the one before it ORIGINALLY said', () => {
    // Three in a row carrying the same stale heading: all three must lose it, not only
    // the first.
    const stale = 'Delaunching of all types of Steel girders and stacking away from river stream as directed by Engineer in charge with all labour, tools and plant.';
    const items = [
      { c: '1', d: stale },
      { c: '2', d: `${stale} Supplying and fixing in position access ladders and inspection platforms on bridges with structural steel conforming to IS:2062 including welding and bolting.` },
      { c: '3', d: `${stale} Painting cleaned triangulated bridge girders including all scaffolding with provision of hanging scaffolding ladder where required as directed.` },
    ];
    expect(stripCarriedOverHeadings(items)).toEqual(['2', '3']);
  });
});

describe('the shipped USSOR 2021 book', () => {
  it('gives 041370 its own wording, the one the bill prints', () => {
    const item = itemOf('041370');
    expect(item.u).toBe('MT');
    expect(item.d).toMatch(/^Supplying fabricating and erecting welded and\/or bolted and\/or riveted steel work/);
    expect(item.d).not.toMatch(/Longitudinally slewing/);
  });

  it('leaves the slewing item itself alone', () => {
    expect(itemOf('041350').d).toMatch(/^Longitudinally slewing of steel plate girders/);
    expect(itemOf('041351').d).toMatch(/^Longitudinally slewing of steel plate girders/);
  });

  it('has no item left carrying the one before it', () => {
    const items = (ussor as { items: Array<{ c: string; d: string; u: string }> })
      .items.map(item => ({ ...item }));
    expect(stripCarriedOverHeadings(items)).toEqual([]);
  });
});
