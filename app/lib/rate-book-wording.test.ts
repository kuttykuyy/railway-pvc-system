import { describe, expect, it } from 'vitest';
import { enrichDescription, rateBookWordingDisagrees } from './rate-book-lookup';

const entry = (description: string) => ({
  edition: 'USSOR 2021', code: '041370', description, unit: 'MT', rate: 0,
  subHead: '04', subHeadName: 'Bridge Works',
} as any);

describe('rateBookWordingDisagrees', () => {
  it('catches a book row that describes different work from the bill', () => {
    // USSOR 041370 as the book had it, against what the bill actually printed.
    expect(rateBookWordingDisagrees(
      'Supplying fabricating and erecting welded and/or bolted and/or riveted steel work in built up sections, trusses and framed work with contractors own steel',
      "Longitudinally slewing of steel plate girders of span 12.2m to 24.4m under traffic block using contractor's own hydraulic jacks of 100 tons capacity without damaging the girder and track alignment",
    )).toBe(true);
  });

  it('accepts the normal case, where the book says the same thing at greater length', () => {
    expect(rateBookWordingDisagrees(
      'Providing and laying cement concrete 1:2:4 in foundation',
      'Providing and laying in position cement concrete of specified grade 1:2:4 (1 cement : 2 coarse sand : 4 graded stone aggregate 20 mm nominal size) in foundation and plinth',
    )).toBe(false);
  });

  it('never calls a short sub-item line a disagreement', () => {
    // These lines name no work of their own — they are meant to sit under the book's
    // heading, so the book's wording is exactly what they need.
    for (const line of ['For Span above 18.3 M to 24.4 M', '12 MT capacity', 'In hard rock']) {
      expect(rateBookWordingDisagrees(line, 'Providing road crane of specified lifting capacity with specified jib length revolving type for material handling, assembly and erection of girders'), line).toBe(false);
    }
  });
});

describe('enrichDescription', () => {
  it('puts the bill first when the two disagree, so a bad book row cannot rename the item', () => {
    const bill = 'Supplying fabricating and erecting welded and/or bolted and/or riveted steel work in built up sections, trusses and framed work with contractors own steel';
    const book = "Longitudinally slewing of steel plate girders of span 12.2m to 24.4m under traffic block using contractor's own hydraulic jacks of 100 tons capacity";
    expect(enrichDescription(bill, entry(book))).toBe(`${bill} — ${book}`);
  });

  it('still puts the book first when it is the fuller wording of the same item', () => {
    const book = 'Providing and laying in position cement concrete of specified grade 1:2:4 in foundation and plinth';
    expect(enrichDescription('For 1:2:4 mix', entry(book))).toBe(`${book} — For 1:2:4 mix`);
  });

  it('uses the book alone when it already contains the bill line', () => {
    const book = 'Providing and laying in position cement concrete of specified grade in foundation and plinth';
    expect(enrichDescription('cement concrete of specified grade', entry(book))).toBe(book);
  });
});
