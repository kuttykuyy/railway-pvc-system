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

const { repairTableReads, collapseRepeatedRuns, dropEmbeddedItemCode } = require('../scripts/repair-table-reads') as {
  repairTableReads: (items: Array<{ c: string; d: string }>) => string[];
  collapseRepeatedRuns: (text: string) => string;
  dropEmbeddedItemCode: (text: string) => string;
};

describe('repairTableReads', () => {
  it('cuts at a stray item code when a whole item follows it', () => {
    // USSOR 211240, as read: the machinery-hire item in front of its own wording.
    const was = 'Hiring of machinery for minor miscellaneous works for short duration including operator/driver, fuel, lubricants and consumable. '
      + 'Payment shall be made for actual working hours at site. 211240 Loading of sand/quarry dust filled bags from Railway stacks in to '
      + "Railway Wagons with all contractor's empty polythene cement bag, tools & plants, machinery, labour, lead and lift, crossing of track "
      + 'wherever necessary etc., complete as directed by the Engineer In charge.';
    expect(dropEmbeddedItemCode(was)).toMatch(/^Loading of sand\/quarry dust filled bags/);
  });

  it('keeps the heading when only a short variant follows the code', () => {
    // USSOR 103031: "Using H3B electrodes" is this item's variant, not an item of its own.
    const was = "Reconditioning of worn out 1:8½ tongue rail of all rail sections on Cess or Depot, as directed by engineer in-charge. 103031 Using H3B electrodes";
    expect(dropEmbeddedItemCode(was)).toBe(
      "Reconditioning of worn out 1:8½ tongue rail of all rail sections on Cess or Depot, as directed by engineer in-charge. Using H3B electrodes",
    );
  });

  it('collapses a line the page break made the reader read twice', () => {
    expect(collapseRepeatedRuns("Loading of all types of rails on BFRs with Railway's Portal Crane in PQRS Depot, Portal Crane in PQRS Depot, complete in such a complete in such a manner that no damage occurs"))
      .toBe("Loading of all types of rails on BFRs with Railway's Portal Crane in PQRS Depot, complete in such a manner that no damage occurs");
  });

  it('leaves a measurement written twice on purpose alone', () => {
    // USSOR 186160 really does measure a pit 1025mm x 1025mm x 1000mm.
    const measured = 'Digging of pit of size 1025mm x 1025mm x 1000mm for fixing of the post';
    expect(collapseRepeatedRuns(measured)).toBe(measured);
  });

  it('reports the codes it changed and leaves clean items alone', () => {
    const items = [
      { c: '1', d: 'Supplying and fixing in position access ladders on bridges as directed by the Engineer in charge.' },
      { c: '2', d: 'Painting cleaned girders cleaned girders including all scaffolding as directed by the Engineer in charge.' },
    ];
    expect(repairTableReads(items)).toEqual(['2']);
    expect(items[1].d).toBe('Painting cleaned girders including all scaffolding as directed by the Engineer in charge.');
  });
});

describe('the shipped USSOR 2021 book, after the table-read repair', () => {
  it('gives 211240 the wording its rate is for', () => {
    const item = itemOf('211240');
    expect(item.d).toMatch(/^Loading of sand\/quarry dust filled bags/);
    expect(item.d).not.toMatch(/Hiring of machinery/);
  });

  it('gives 041124 its own capacity, not the item before it', () => {
    expect(itemOf('041124').d).toMatch(/250 MT Capacity/);
  });

  it('gives 123100 the track-linking wording, not the slewing item above it', () => {
    const item = itemOf('123100');
    expect(item.d).toMatch(/^Assembling, laying and linking of Broad Gauge track/);
    expect(item.d).not.toMatch(/Shifting \/ Slewing/);
  });

  it('keeps a pit that really is measured twice', () => {
    expect(itemOf('186160').d).toMatch(/1025mm x 1025mm x 1000mm/);
  });

  it('has nothing left for either rule to repair', () => {
    const items = (ussor as { items: Array<{ c: string; d: string; u: string }> })
      .items.map(item => ({ ...item }));
    expect(repairTableReads(items)).toEqual([]);
    expect(stripCarriedOverHeadings(items)).toEqual([]);
  });
});
