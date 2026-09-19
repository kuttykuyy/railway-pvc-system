import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PositionedPdfPage, PositionedPdfTextItem } from './pdf-layout-extract';

// The parser reads positioned text, so the layout extractor is replaced with pages
// built here. Coordinates are taken from real IREPS bills (A4 landscape, 842 wide).
const extractPositionedPdfPages = vi.fn<() => Promise<PositionedPdfPage[]>>();
vi.mock('./pdf-layout-extract', () => ({
  extractPositionedPdfPages: () => extractPositionedPdfPages(),
}));

import { parseIrepsBillPdfDirect } from './ireps-direct-pdf-parser';

function words(y: number, entries: Array<[number, string]>): PositionedPdfTextItem[] {
  return entries.map(([x, text]) => ({ text, x, y, width: text.length * 5, height: 10 }));
}

function page(pageNumber: number, items: PositionedPdfTextItem[]): PositionedPdfPage {
  return { pageNumber, width: 842, height: 595, items };
}

// The header lines every page of the item table carries.
const HEADER = [
  ...words(102, [[60, 'Sr.'], [97, 'No.'], [172, 'Base'], [229, 'Agreement']]),
  ...words(104, [[487, 'Amount'], [543, 'Amount'], [600, 'Bill'], [656, 'Total']]),
];

// The Schedule Summary as page 5 of the same bill prints it: amount up to the last
// bill, this bill's amount, and the total to date, then the net Bill Amount.
const SUMMARY = [
  ...words(300, [[60, 'Schedule'], [110, 'Summary:']]),
  ...words(361, [[173, '31066917.93'], [286, '2544518.62'], [437, '33611436.55']]),
  ...words(362, [[55, 'Total'], [79, 'Amount(Rs.)']]),
  ...words(375, [[369, '0.0']]),
  ...words(376, [[55, 'Rebate(0.0%)']]),
  ...words(389, [[286, '2544518.62']]),
  ...words(390, [[55, 'Bill'], [74, 'Amount'], [100, '(Rs.)'], [123, '(Including'], [165, 'Tax'], [180, '(GST))']]),
];

/**
 * B7 of SER/ADA/Civil/2024/0079, page 2: a row billed "Per Track Metre" whose unit
 * prints down three lines and whose figures wrap over two, followed by the last row of
 * the page whose figures continue onto the first line of page 3.
 */
function wrappedUnitBill(): PositionedPdfPage[] {
  const page2 = page(2, [
    ...HEADER,
    ...words(148, [[304, 'Schedule'], [347, 'C-Execution'], [404, 'of'], [418, 'all'], [438, 'special'], [476, 'items']]),
    ...words(162, [[60, 'Group'], [89, 'Name:-'], [123, 'Execution'], [171, 'of'], [186, 'all'], [205, 'special'], [244, 'items']]),
    ...words(176, [[135, 'Per']]),
    ...words(181, [[167, '112447.7'], [226, '110007.6044'], [492, '2257356'], [543, '1078074.'], [599, '1078074.'], [659, '2365163']]),
    ...words(186, [[135, 'Track'], [297, '215.0'], [334, '215.0'], [379, '205.2'], [420, '9.8'], [447, '215.0'], [713, 'Now'], [734, 'to'], [750, 'pay'], [771, '100%']]),
    ...words(191, [[203, '2'], [273, '76'], [492, '0.44'], [574, '52'], [630, '52'], [678, '4.96']]),
    ...words(196, [[135, 'Metre']]),
    ...words(210, [[135, 'Manufacturing,'], [201, 'supply'], [231, 'and'], [249, 'installation'], [306, 'of'], [319, 'rubberised'], [367, 'level'], [393, 'crossing'], [433, 'pad']]),
    ...words(218, [[67, '-'], [97, '1'], [106, '(G)']]),
    ...words(300, [[300, 'Total'], [340, '(Schedule'], [400, 'C-Execution'], [480, 'of'], [500, 'all'], [520, 'special'], [560, 'items'], [600, 'of'], [620, 'works.)']]),
    ...words(320, [[304, 'Schedule'], [347, 'B-Execution'], [404, 'of'], [418, 'all'], [438, 'works'], [476, 'under'], [510, 'USSOR'], [550, '2021-Ver-1']]),
    ...words(334, [[60, 'Group'], [89, 'Name:-'], [123, 'Execution'], [171, 'of'], [186, 'all'], [205, 'works'], [244, 'under'], [280, 'USSOR']]),
    ...words(348, [[60, 'Chapter'], [95, 'Name:-'], [130, 'CHAPTER'], [175, '-'], [185, '4'], [195, ':'], [205, 'Bridge'], [240, 'Works']]),
    ...words(560, [[67, '-'], [97, '0413'], [135, 'MT'], [167, '114366.5'], [226, '120496.6392'], [297, '99.0'], [334, '99.0'], [379, '66.71'], [420, '12.17'], [447, '78.88'], [492, '8038330.'], [543, '1466444.'], [599, '1466444.'], [659, '9504774.'], [713, 'Now'], [734, 'to'], [750, 'pay'], [771, '100%']]),
  ]);
  const page3 = page(3, [
    ...words(32, [[203, '9'], [273, '24'], [492, '8'], [579, '1'], [636, '1'], [692, '9']]),
    ...words(46, [[135, 'Supplying'], [178, 'fabricating'], [231, 'and'], [248, 'erecting'], [288, 'welded'], [318, 'steel'], [349, 'work']]),
    ...words(56, [[97, '70(G)']]),
    ...SUMMARY,
  ]);
  return [page2, page3];
}

/**
 * A bill whose only row is a non-schedule item added after the agreement, billed "per
 * cm depth per cm width per metre length" — the unit printed down ten lines of its
 * column — with the payment remark "Rate Reduction as per Variation (-4%) for beyond
 * 50%" wrapped down the right-hand margin, and the item numbered "NS01 (I)" over two
 * lines.
 */
function additionalNsBill(): PositionedPdfPage[] {
  const unitCol = ['per', 'cm', 'depth', 'per', 'cm', 'width', 'per', 'metre', 'lengt', 'h'];
  const page16 = page(16, [
    ...HEADER,
    ...words(148, [[330, 'Schedule'], [372, 'D-Additional'], [432, 'NS'], [448, 'item']]),
    ...unitCol.flatMap((text, i) => words(162 + i * 10, [[135, text]])),
    ...words(200, [[67, '1'], [97, 'NS01']]),
    ...words(210, [[97, '(I)']]),
    ...words(205, [[167, '247.0'], [226, '247.0'], [297, '0.0'], [334, '2000.0'], [379, '0.0'], [420, '1876.98'], [447, '1876.98'], [492, '0.0'], [543, '463614.06'], [599, '445069.5'], [659, '445069.5']]),
    ...words(195, [[713, 'Rate'], [740, 'Reduction']]),
    ...words(205, [[713, 'as'], [725, 'per'], [745, 'Variation'], [790, '(-']]),
    ...words(215, [[713, '4%)'], [735, 'for'], [755, 'beyond']]),
    ...words(225, [[713, '50%']]),
    ...words(272, [[135, 'NS-GNT-DSR-348:'], [205, 'Making'], [240, 'groove'], [272, 'of'], [285, 'suitable'], [320, 'width'], [350, '&'], [360, 'depth'], [390, 'in'], [402, 'concrete'], [440, 'flooring']]),
    ...words(282, [[135, 'by'], [150, 'mechanical'], [200, 'cutter'], [230, 'true'], [252, 'to'], [265, 'the'], [282, 'line'], [305, 'for'], [322, 'expansion'], [368, 'of'], [380, 'floor']]),
    ...words(310, [[300, 'Total'], [340, '(Schedule'], [400, 'D-Additional'], [470, 'NS'], [490, 'item)'], [543, '463614.06'], [599, '445069.5'], [659, '445069.5']]),
  ]);
  const summary = page(17, [
    ...words(300, [[60, 'Schedule'], [110, 'Summary:']]),
    ...words(361, [[173, '0.0'], [286, '445069.5'], [437, '445069.5']]),
    ...words(362, [[55, 'Total'], [79, 'Amount(Rs.)']]),
    ...words(375, [[369, '0.0']]),
    ...words(376, [[55, 'Rebate(0.0%)']]),
    ...words(389, [[286, '445069.5']]),
    ...words(390, [[55, 'Bill'], [74, 'Amount'], [100, '(Rs.)'], [123, '(Including'], [165, 'Tax'], [180, '(GST))']]),
  ]);
  return [page16, summary];
}

/**
 * The page break that cost CC-6 62908 a whole row.
 *
 * Item 081031, Rs 13,16,366.59 of structural steel, is the last row on its page and
 * every figure it carries is cut in half by the break. The remainder does not print on
 * one line: the quantity's "0.316" lands on the first line of the next page, the
 * amount's "59" paise on the second, and the quantity's final "2" on the third. Reading
 * only the first of those lines left a quantity of 1100 standing against an amount of
 * Rs 13,16,366, which cannot multiply out, so the row was dropped and the bill came up
 * short by its whole value.
 */
function pageBreakBill(): PositionedPdfPage[] {
  const page4 = page(4, [
    ...HEADER,
    ...words(148, [[304, 'Schedule'], [347, 'B-Execution'], [404, 'of'], [418, 'all'], [438, 'works'], [476, 'under'], [510, 'USSOR'], [550, '2021-Ver-1']]),
    ...words(530, [[60, 'Chapter'], [102, 'Name:-'], [139, 'Steel'], [171, 'And'], [192, 'Aluminium'], [244, 'Work']]),
    ...words(544, [[98, '0810'], [300, '7911'], [337, '1100'], [380, '9527'], [413, '1100'], [450, '1062'], [492, '1140090'], [544, '1316366.'], [600, '1316366.'], [659, '1271727']]),
    ...words(548.5, [[67, '-'], [135, 'Kg'], [184, '87.03'], [237, '119.66625'], [713, 'Now'], [734, 'to'], [750, 'pay'], [771, '100%']]),
  ]);
  const page5 = page(5, [
    ...words(32, [[410, '0.316'], [447, '72.83']]),
    ...words(37, [[98, '31'], [308, '2.0'], [340, '00.0'], [380, '2.518'], [492, '4.96'], [574, '59'], [630, '59'], [679, '1.55']]),
    ...words(42, [[429, '2'], [461, '42']]),
    ...words(49, [[98, '(G)']]),
    ...words(56, [[135, 'In'], [149, 'RSJ,'], [172, 'tees,'], [200, 'angles'], [232, 'and'], [250, 'channels']]),
    ...words(300, [[60, 'Schedule'], [110, 'Summary:']]),
    ...words(361, [[173, '11400904.96'], [286, '1316366.59'], [437, '12717271.55']]),
    ...words(362, [[55, 'Total'], [79, 'Amount(Rs.)']]),
    ...words(389, [[286, '1316366.59']]),
    ...words(390, [[55, 'Bill'], [74, 'Amount'], [100, '(Rs.)'], [123, '(Including'], [165, 'Tax'], [180, '(GST))']]),
  ]);
  return [page4, page5];
}

describe('parseIrepsBillPdfDirect', () => {
  beforeEach(() => {
    extractPositionedPdfPages.mockReset();
  });

  it('reads a row whose unit wraps over three lines exactly once, with its figures whole', async () => {
    extractPositionedPdfPages.mockResolvedValue(wrappedUnitBill());
    const bill = await parseIrepsBillPdfDirect(Buffer.from('%PDF-1.4 test'));

    const perTrackMetre = bill.items.filter(item => item.schedule === 'Schedule C');
    expect(perTrackMetre).toHaveLength(1);
    expect(perTrackMetre[0]).toMatchObject({
      itemNo: '1',
      unit: 'PerTrackMetre',
      quantitySinceLastBill: 9.8,
      agreementRate: 110007.604476,
      amountSinceLastBill: 1078074.52,
    });
  });

  it('still joins the last row of a page with the digits printed at the top of the next', async () => {
    extractPositionedPdfPages.mockResolvedValue(wrappedUnitBill());
    const bill = await parseIrepsBillPdfDirect(Buffer.from('%PDF-1.4 test'));

    const steel = bill.items.find(item => item.itemNo === '0413');
    expect(steel).toMatchObject({
      unit: 'MT',
      quantitySinceLastBill: 12.17,
      agreementRate: 120496.639224,
      amountSinceLastBill: 1466444.1,
    });
  });

  it('reconciles the bill to its printed total', async () => {
    extractPositionedPdfPages.mockResolvedValue(wrappedUnitBill());
    const bill = await parseIrepsBillPdfDirect(Buffer.from('%PDF-1.4 test'));

    expect(bill.items).toHaveLength(2);
    expect(bill.itemAmountTotal).toBe(2544518.62);
    expect(bill.amountsReconciled).toBe(true);
    expect(bill.amountDifference).toBe(0);
  });

  it('reads an added non-schedule item: its NS number, a clean heading and a clean description', async () => {
    extractPositionedPdfPages.mockResolvedValue(additionalNsBill());
    const bill = await parseIrepsBillPdfDirect(Buffer.from('%PDF-1.4 test'));

    expect(bill.items).toHaveLength(1);
    const ns = bill.items[0];
    expect(ns.itemNo).toBe('NS01');
    expect(ns.schedule).toBe('Schedule D');
    expect(ns.scheduleHeading).toBe('Schedule D-Additional NS item');
    expect(ns.sourceBook).toBe('NON_SCHEDULE');
    expect(ns.description.startsWith('NS-GNT-DSR-348:')).toBe(true);
    expect(ns.description).not.toMatch(/50%|lengt|Reduction/);
    expect(ns.amountSinceLastBill).toBe(445069.5);
    expect(ns.amountAtAgreementRateSinceLastBill).toBe(463614.06);
    expect(bill.amountsReconciled).toBe(true);
  });

  it('rejoins a row whose figures continue over the first three lines of the next page', async () => {
    extractPositionedPdfPages.mockResolvedValue(pageBreakBill());
    const bill = await parseIrepsBillPdfDirect(Buffer.from('%PDF-1.4 test'));

    expect(bill.items).toHaveLength(1);
    expect(bill.items[0]).toMatchObject({
      itemNo: '081031',
      unit: 'Kg',
      quantitySinceLastBill: 11000.3162,
      agreementRate: 119.66625,
      amountSinceLastBill: 1316366.59,
    });
    expect(bill.amountsReconciled).toBe(true);
  });
});
