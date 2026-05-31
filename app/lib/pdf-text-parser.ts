import { logger } from './logger';
/**
 * Text-based PDF parser for Indian Railway running account bills.
 * Extracts bill data using regex pattern matching on text extracted via pdfjs-dist.
 * No AI/LLM required - works with text-based PDFs only.
 *
 * For scanned/image PDFs (no extractable text), returns null so the caller can fall back to LLM.
 */

// @ts-ignore - pdfjs-dist legacy build doesn't have perfect types
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Disable worker to avoid "Cannot find module './pdf.worker.js'" in standalone builds.
// The actual disabling happens via disableWorker:true in getDocument() calls.
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface ParsedLineItem {
  itemNo: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  schedule: string;
  category: 'steel' | 'non-steel';
  steelType: string | null;
  amountUptoLastBill: number;
  amountSinceLastBill: number;
  amountSinceLastBillSpecial: number; // "Amount Since last Bill including special condition"
  totalUptoDateAmount: number;
  qtySinceLastBill: number;
}

export interface ParsedBillData {
  billNo: string | null;
  agreementNo: string | null;
  contractorName: string | null;
  workDescription: string | null;
  dateOfMeasurement: string | null;
  dateOfCommencement: string | null;
  agreementDate: string | null;
  grossBillAmount: number | null;
  cementAmount: number | null;
  steelTmtBarsAmount: number | null;
  lineItems: ParsedLineItem[];
  steelSummary: {
    totalAmount: number;
    tmtBarsAmount: number;
    angleChannelAmount: number;
    platesAmount: number;
    otherSectionsAmount: number;
    items: string[];
  };
  nonSteelSummary: {
    totalAmount: number;
    items: string[];
  };
  scheduleSummary: Record<string, { amtUptoLastBill: number; amtSpecial: number; totalUptoDate: number }>;
  suggestedClassifications: any[];
  nonScheduleItems: any[];
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  extractionMethod: 'text-parser';
}

/**
 * Extract text from each page of a PDF buffer.
 * Returns null if the PDF has no extractable text (scanned/image PDF).
 */
export async function extractPdfText(pdfBuffer: ArrayBuffer): Promise<string[] | null> {
  const uint8 = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({
    data: uint8,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    disableWorker: true,
  }).promise;
  const numPages = doc.numPages;
  const pages: string[] = [];
  let totalChars = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push(pageText);
    totalChars += pageText.length;
  }

  if (totalChars < 100) {
    logger.log(`\u{1F4C4} PDF has only ${totalChars} chars of text - likely scanned/image PDF`);
    return null;
  }

  logger.log(`\u{1F4C4} Extracted ${totalChars} chars of text from ${numPages} pages`);
  return pages;
}

/**
 * Parse header information from page 1.
 */
function parseHeader(pageText: string): Partial<ParsedBillData> {
  const result: Partial<ParsedBillData> = {};

  // Bill No
  const billNoMatch = pageText.match(/Bill\s*No\.?\s*([A-Z0-9/\-]+(?:\/[A-Z0-9]+)*(?:\/R\d+)?)/i);
  if (billNoMatch) result.billNo = billNoMatch[1].trim();

  // Agreement No
  const agreeMatch = pageText.match(/Agreement\s*No\.?\s*([A-Z0-9/\-]+(?:\/[A-Z0-9]+)*)/i);
  if (agreeMatch) result.agreementNo = agreeMatch[1].trim();

  // Agreement Date
  const agreeDateMatch = pageText.match(/Agreement\s*Date\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (agreeDateMatch) result.agreementDate = agreeDateMatch[1];

  // Bill Date / Measurement Date
  const billDateMatch = pageText.match(/Bill\s*Date\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const measDateMatch = pageText.match(/Measurement\s*Date\s*(?:From|To)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  result.dateOfMeasurement = measDateMatch?.[1] || billDateMatch?.[1] || null;

  // Date of Commencement
  const commMatch = pageText.match(/Date\s*of\s*Commencement\s*(?:of\s*Work)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (commMatch) result.dateOfCommencement = commMatch[1];

  // Contractor Name - ends at LOA or next field
  const contractorMatch = pageText.match(/Name\s*Of\s*Contractor\s+(.+?)\s+LOA\s/i)
    || pageText.match(/Name\s*Of\s*Contractor\s+(.+?)(?=\s{3,})/i);
  if (contractorMatch) result.contractorName = contractorMatch[1].replace(/-\s*$/, '').trim();

  // Work Description - capture from "Name Of Work" to "Name Of Contractor"
  const workMatch = pageText.match(/Name\s*Of\s*Work\s*(.+?)(?=\s*Name\s*Of\s*Contractor)/is);
  if (workMatch) {
    result.workDescription = workMatch[1].replace(/\s+/g, ' ').trim();
  }

  return result;
}

/**
 * Determine the schedule type from schedule header text.
 */
function classifySchedule(scheduleText: string): string {
  const lower = scheduleText.toLowerCase();
  if (lower.includes('a1b') || (lower.includes('a1') && lower.includes('delhi'))) return 'A1b';
  if (lower.includes('a1a') || (lower.includes('a1') && lower.includes('unified'))) return 'A1a';
  if (lower.includes('a3')) return 'A3b';
  if (lower.includes('a2')) return 'A2b';
  if (lower.includes('schedule b')) return 'B';
  return 'other';
}

/**
 * Classify item by DSR chapter for cement/steel detection.
 */
function classifyItemByDsr(itemNo: string): { category: 'steel' | 'non-steel'; steelType: string | null } {
  const normalized = itemNo.replace(/\s+/g, '').replace(/\(.*\)/, '');

  // Item 5.22 = TMT steel
  if (/^5\.22/i.test(normalized)) {
    return { category: 'steel', steelType: 'TMT Bars' };
  }
  // Chapter 10 = Steel work
  if (/^10\./i.test(normalized)) {
    return { category: 'steel', steelType: 'Structural Steel' };
  }
  return { category: 'non-steel', steelType: null };
}

/**
 * Parse numbers that may be split across lines/spaces in PDF text.
 * Handles: "3005919. 89", "1361329 2", "15506571.7 4"
 */
function parseAmount(text: string): number {
  if (!text) return 0;
  const cleaned = text.trim().replace(/\s+/g, '').replace(/,/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Clean up item numbers that get split by PDF text extraction.
 */
function cleanItemNo(raw: string): string {
  return raw.replace(/\.\s+/g, '.').replace(/\s+\./g, '.').trim();
}

/**
 * Parse line items from pages (excluding page 1 header and summary page).
 */
function parseLineItems(pagesText: string[]): { items: ParsedLineItem[]; scheduleSummary: Record<string, any> } {
  const items: ParsedLineItem[] = [];
  const scheduleSummary: Record<string, { amtUptoLastBill: number; amtSpecial: number; totalUptoDate: number }> = {};

  // Filter out summary pages
  const itemPagesText = pagesText.filter(p => !p.includes('Schedule Summary') && !p.includes('Schedule Cost Breakup'));

  // Strip "Page X of Y" markers to prevent page-boundary splits
  const cleanedPages = itemPagesText.map(p => p.replace(/Page\s+\d+\s+of\s+\d+/gi, ' '));
  let fullText = cleanedPages.join(' ');

  // Fix USSOR items split across pages: "0510 cum 3517.49 ... Now to pay 100% 80 (G) 0 0 656 ..."
  // When a 4-digit USSOR code appears before a unit WITHOUT (G)/(I), and later a short number + (G)/(I) appears,
  // they belong together. Reconstruct by:
  // 1. Merging the suffix into the item number
  // 2. Reassembling the split decimal numbers (e.g., "1031." + "0" → "1031.0", "3576077." + "31" → "3576077.31")
  fullText = fullText.replace(
    /(\b\d{4})\s+(cum|sqm|mt|kg|rm|each|no|set|ls|job|quintal|litre)\s+([\d,.\s]+?Now\s+to\s+pay\s+\d+%)\s+(\d{1,2})\s*\(([GI])\)\s*((?:\d+\s+){0,12})/gi,
    (_, prefix, unit, numBlock, suffix, marker, staleNums) => {
      // Reassemble split decimals: numbers ending with "." in numBlock get their continuations from staleNums
      let fixedNumBlock = numBlock;
      if (staleNums) {
        const continuations = staleNums.trim().split(/\s+/);
        let cIdx = 0;
        // Replace each trailing "." number with its continuation
        fixedNumBlock = numBlock.replace(/(\d+)\.\s/g, (m: string, num: string) => {
          if (cIdx < continuations.length) {
            return `${num}.${continuations[cIdx++]} `;
          }
          return `${num}.0 `;
        });
      }
      return `${prefix} ${suffix} (${marker}) ${unit} ${fixedNumBlock}`;
    }
  );

  // Find schedule sections (skip "Total (Schedule ...)" matches)
  const schedulePattern = /Schedule\s+(A\d+[ab]?|B)\s*-?\s*\(([^)]+)\)/gi;
  const scheduleSections: { schedule: string; label: string; startIdx: number }[] = [];
  const seenSchedules = new Set<string>();
  let match;

  while ((match = schedulePattern.exec(fullText)) !== null) {
    const beforeMatch = fullText.substring(Math.max(0, match.index - 10), match.index);
    if (beforeMatch.includes('Total')) continue;

    const sched = classifySchedule(match[0]);
    if (!seenSchedules.has(sched)) {
      seenSchedules.add(sched);
      scheduleSections.push({
        schedule: sched,
        label: match[2].trim(),
        startIdx: match.index
      });
    }
  }

  // For each schedule section, extract items
  for (let s = 0; s < scheduleSections.length; s++) {
    const section = scheduleSections[s];
    const nextStart = s + 1 < scheduleSections.length ? scheduleSections[s + 1].startIdx : fullText.length;
    const sectionText = fullText.substring(section.startIdx, nextStart);

    // Pattern: DSR item no (digits with dots, 4-digit USSOR, or ns-prefix) followed by (G)/(I) and unit
    const itemPattern = /(?:^|\s)((?:\d+\.[\d.\s]*\d|\d{4}(?:\s+\d+)?|ns\d+))\s*\(([GI])\)\s+(\w+)/g;
    let itemMatch;
    const itemPositions: { itemNo: string; marker: string; unit: string; pos: number; endPos: number }[] = [];

    while ((itemMatch = itemPattern.exec(sectionText)) !== null) {
      const rawItemNo = cleanItemNo(itemMatch[1]);
      itemPositions.push({
        itemNo: rawItemNo,
        marker: itemMatch[2],
        unit: itemMatch[3],
        pos: itemMatch.index,
        endPos: itemMatch.index + itemMatch[0].length
      });
    }

    for (let i = 0; i < itemPositions.length; i++) {
      const item = itemPositions[i];
      const nextPos = i + 1 < itemPositions.length ? itemPositions[i + 1].pos : sectionText.length;
      const fullItemText = sectionText.substring(item.endPos, nextPos);

      // CRITICAL: Only extract numbers from the NUMERIC portion of the item text.
      // Prevent description text ("DSR 2021", "1.5 m"), page numbers, and schedule totals from contaminating amounts.
      let cutoff = fullItemText.length;
      const nowToPayIdx = fullItemText.search(/Now\s+to\s+pay/i);
      const totalIdx = fullItemText.search(/Total\s*\(/i);
      if (nowToPayIdx > 0) cutoff = Math.min(cutoff, nowToPayIdx);
      if (totalIdx > 0) cutoff = Math.min(cutoff, totalIdx);
      // For items without "Now to pay" (all-zero amounts), detect description start:
      // transition from numbers/zeros to descriptive text (uppercase word 4+ chars)
      if (nowToPayIdx < 0) {
        const descStart = fullItemText.search(/(?<=\d\.?\d*\s+)[A-Z][a-z]{3,}/);
        if (descStart > 0) cutoff = Math.min(cutoff, descStart);
      }
      const numericText = fullItemText.substring(0, cutoff);

      // Extract numbers, handling PDF text splitting (e.g., "362790.2 1" → "362790.21", "7047. 0" → "7047.0")
      // Strategy: extract raw number tokens, then reassemble split decimals
      const rawTokens: { value: string; pos: number }[] = [];
      const tokenPattern = /(\d[\d,]*\.?\d*)/g;
      let tokenMatch;
      while ((tokenMatch = tokenPattern.exec(numericText)) !== null) {
        rawTokens.push({ value: tokenMatch[1], pos: tokenMatch.index });
      }

      // Reassemble split numbers: if token[i] ends with "." and next token is close, merge
      // Also handle "362790.2 1" → check if merging makes a valid decimal with more precision
      const assembledNumbers: number[] = [];
      for (let t = 0; t < rawTokens.length; t++) {
        const curr = rawTokens[t];
        const next = t + 1 < rawTokens.length ? rawTokens[t + 1] : null;
        const gap = next ? next.pos - (curr.pos + curr.value.length) : 999;

        if (next && gap <= 2) {
          // Case 1: "7232117. 15" → current ends with dot, merge
          // But NOT if next token is a standalone number (3+ digits) — e.g., "1031." + "1431." are separate values
          if (curr.value.endsWith('.') && next.value.length <= 2) {
            const merged = curr.value + next.value;
            assembledNumbers.push(parseAmount(merged));
            t++; // skip next
            continue;
          }
          // Case 2: "362790.2 1" → current has dot+digits, next is 1-2 digits continuation
          // Merge if: current contains '.', next is short (1-2 digits), and merging makes sense
          if (curr.value.includes('.') && next.value.length <= 2 && /^\d+$/.test(next.value)) {
            const merged = curr.value + next.value;
            assembledNumbers.push(parseAmount(merged));
            t++; // skip next
            continue;
          }
          // Case 3: "1361329 2" → large number split; current has no dot, next is short
          // Only merge if current is >= 5 digits and next is 1-2 digits
          if (!curr.value.includes('.') && curr.value.replace(/,/g, '').length >= 5 && next.value.length <= 2 && /^\d+$/.test(next.value)) {
            const merged = curr.value + next.value;
            assembledNumbers.push(parseAmount(merged));
            t++; // skip next
            continue;
          }
        }
        assembledNumbers.push(parseAmount(curr.value));
      }

      // CRITICAL: Keep zeros — they represent real column values (e.g., amtSinceLastBill=0)
      // Filtering them out shifts the "last 4" position-based logic incorrectly
      const amounts = assembledNumbers;

      // Extract description from the full text (after "Now to pay")
      let description = '';
      const descMatch = fullItemText.match(/Now\s+to\s+pay\s+\d+%\s*(.*?)(?=\s*(?:Group\s+Name|Chapter\s+Name|Schedule|Total\s*\(|Page\s+\d|$))/si);
      if (descMatch) {
        description = descMatch[1].replace(/\s+/g, ' ').trim().substring(0, 300);
      }
      if (!description) {
        const altDesc = fullItemText.match(/([A-Z][a-z].{20,}?)(?=\s*(?:Group|Chapter|Schedule|Total|Page|$))/s);
        if (altDesc) description = altDesc[1].replace(/\s+/g, ' ').trim().substring(0, 300);
      }

      // The table has 11 columns:
      //   [0] baseRate, [1] agreementRate, [2] origQty, [3] currQty, [4] qtyLastBill,
      //   [5] qtySinceLastBill, [6] qtyUptoDate, [7] amountUptoLastBill,
      //   [8] amountSinceLastBill, [9] amountSinceLastBillSpecial (incl. special condition),
      //   [10] totalUptoDateAmount
      let amountUptoLastBill = 0;
      let amountSinceLastBill = 0;
      let amountSinceLastBillSpecial = 0;
      let totalUptoDateAmount = 0;
      let rate = 0;
      let qtySinceLastBill = 0;

      if (amounts.length >= 4) {
        totalUptoDateAmount = amounts[amounts.length - 1];
        amountSinceLastBillSpecial = amounts[amounts.length - 2]; // "Amount Since last Bill including special condition"
        amountSinceLastBill = amounts[amounts.length - 3];
        amountUptoLastBill = amounts[amounts.length - 4];
        if (amounts.length >= 2 && amounts[1] < 100000) {
          rate = amounts[1]; // Agreement rate
        } else if (amounts[0] < 100000) {
          rate = amounts[0];
        }
        // Extract qtySinceLastBill — column [5], which is at index length-6 for 11-column rows
        if (amounts.length >= 6) {
          qtySinceLastBill = amounts[amounts.length - 6];
        }
      } else if (amounts.length >= 3) {
        totalUptoDateAmount = amounts[amounts.length - 1];
        amountSinceLastBillSpecial = amounts[amounts.length - 2];
        amountSinceLastBill = amounts[amounts.length - 3];
      } else if (amounts.length >= 1) {
        totalUptoDateAmount = amounts[amounts.length - 1];
      }

      const dsrInfo = classifyItemByDsr(item.itemNo);

      items.push({
        itemNo: item.itemNo + ` (${item.marker})`,
        description,
        unit: item.unit,
        quantity: 0,
        rate,
        amount: totalUptoDateAmount,
        schedule: section.schedule,
        category: dsrInfo.category,
        steelType: dsrInfo.steelType,
        amountUptoLastBill,
        amountSinceLastBill,
        amountSinceLastBillSpecial,
        totalUptoDateAmount,
        qtySinceLastBill,
      });
    }

    // Extract schedule total
    const totalMatch = sectionText.match(/Total\s*\([^)]*\)\s*([\d,.\s]+?)\s+([\d,.\s]+?)\s+([\d,.\s]+)/i);
    if (totalMatch) {
      scheduleSummary[section.schedule] = {
        amtUptoLastBill: parseAmount(totalMatch[1]),
        amtSpecial: parseAmount(totalMatch[2]),
        totalUptoDate: parseAmount(totalMatch[3]),
      };
    }
  }

  return { items, scheduleSummary };
}

/**
 * Parse the schedule summary page for overall totals.
 */
function parseScheduleSummaryPage(pageText: string): { totalAmount: number; billAmount: number } {
  let totalAmount = 0;
  let billAmount = 0;

  const totalMatch = pageText.match(/Total\s*Amount\s*\(Rs\.?\)\s*([\d,.\s]+?)\s+([\d,.\s]+?)\s+([\d,.\s]+)/i);
  if (totalMatch) {
    totalAmount = parseAmount(totalMatch[3]);
  }

  const billMatch = pageText.match(/Bill\s*Amount\s*\(Rs\.?\)\s*(?:\(.*?\))?\s*([\d,.\s]+)/i);
  if (billMatch) {
    billAmount = parseAmount(billMatch[1]);
  }

  return { totalAmount, billAmount };
}

/**
 * Parse per-schedule breakdown from the Schedule Summary page.
 * Columns: "Amt Upto last Bill" | "Amt including Special Condition" | "Total upto date Amt"
 */
function parseDetailedScheduleSummary(pages: string[]): Record<string, { amtUptoLastBill: number; amtIncSpecialCondition: number; totalUptoDate: number }> {
  const result: Record<string, { amtUptoLastBill: number; amtIncSpecialCondition: number; totalUptoDate: number }> = {};

  const summaryPage = pages.find(p => p.includes('Schedule Summary') || p.includes('Schedule Cost Breakup'));
  if (!summaryPage) return result;

  // Match each schedule line: "Schedule X-(description) amount1 amount2 amount3"
  const scheduleLinePattern = /Schedule\s+(A\d+[ab]?|B)\s*-?\s*\([^)]+\)\s*([\d,.\s]+?)\s+([\d,.\s]+?)\s+([\d,.\s]+?)(?=\s+(?:Schedule|Total\s*Amount))/gi;
  let match;
  while ((match = scheduleLinePattern.exec(summaryPage)) !== null) {
    const sched = classifySchedule(match[0]);
    result[sched] = {
      amtUptoLastBill: parseAmount(match[2]),
      amtIncSpecialCondition: parseAmount(match[3]), // "Amt including Special Condition"
      totalUptoDate: parseAmount(match[4]),
    };
  }

  return result;
}

/**
 * Cross-validate and correct item amounts using Schedule Summary data.
 * - When schedule summary shows amtIncSpecialCondition=0, force items' since-last-bill amounts to 0
 * - When schedule summary shows amtIncSpecialCondition>0, validate item totals match
 * - Corrects amountUptoLastBill = totalUptoDateAmount when no work since last bill
 */
function crossValidateWithScheduleSummary(
  items: ParsedLineItem[],
  detailedSummary: Record<string, { amtUptoLastBill: number; amtIncSpecialCondition: number; totalUptoDate: number }>
): void {
  for (const item of items) {
    const schedSummary = detailedSummary[item.schedule];
    if (!schedSummary) continue;

    // If schedule summary shows 0 for "Amt including Special Condition", force items to 0
    if (schedSummary.amtIncSpecialCondition === 0) {
      item.amountSinceLastBill = 0;
      item.amountSinceLastBillSpecial = 0;
      item.qtySinceLastBill = 0;
      // When no work since last bill, amountUptoLastBill = totalUptoDateAmount
      item.amountUptoLastBill = item.totalUptoDateAmount;
    }
  }

  // Log validation: sum of amountSinceLastBillSpecial per schedule vs summary
  const schedTotals: Record<string, number> = {};
  for (const item of items) {
    schedTotals[item.schedule] = (schedTotals[item.schedule] || 0) + item.amountSinceLastBillSpecial;
  }
  for (const [sched, summary] of Object.entries(detailedSummary)) {
    const itemTotal = schedTotals[sched] || 0;
    const diff = Math.abs(itemTotal - summary.amtIncSpecialCondition);
    if (diff > 1) {
      logger.warn(`⚠️ Schedule ${sched}: items amtSinceLastBillSpecial sum=${itemTotal.toFixed(2)} vs summary=${summary.amtIncSpecialCondition.toFixed(2)} (diff=${diff.toFixed(2)})`);
    }
  }
}

/**
 * Main entry point: Parse a PDF buffer into structured bill data.
 * Returns null if the PDF is scanned/image-based (no extractable text).
 */
export async function parseBillPdf(pdfBuffer: ArrayBuffer): Promise<ParsedBillData | null> {
  const pages = await extractPdfText(pdfBuffer);
  if (!pages) return null;

  logger.log('\u{1F4DD} Parsing bill data from extracted text...');

  const header = parseHeader(pages[0] || '');
  const itemPages = pages.slice(1);
  const { items, scheduleSummary } = parseLineItems(itemPages);

  // Parse schedule summary page for cross-validation
  const detailedSummary = parseDetailedScheduleSummary(pages);

  // Cross-validate items: correct misextracted amounts using schedule summary
  if (Object.keys(detailedSummary).length > 0) {
    crossValidateWithScheduleSummary(items, detailedSummary);
  }

  // Parse summary page
  let grossBillAmount = 0;
  for (const page of pages) {
    if (page.includes('Schedule Summary') || page.includes('Total Amount(Rs.)')) {
      const summary = parseScheduleSummaryPage(page);
      if (summary.totalAmount > 0) grossBillAmount = summary.totalAmount;
    }
  }

  // Calculate steel and cement totals
  let cementTotal = 0;
  let steelTotal = 0;
  let tmtBarsAmount = 0;
  const steelItems: string[] = [];
  const nonSteelItems: string[] = [];

  for (const item of items) {
    const normalized = item.itemNo.replace(/\s+/g, '').replace(/\(.*\)/, '');
    const chapterMatch = normalized.match(/^(\d+)\./);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;

    if (item.category === 'steel') {
      steelTotal += item.totalUptoDateAmount;
      if (/^5\.22/i.test(normalized)) {
        tmtBarsAmount += item.totalUptoDateAmount;
      }
      steelItems.push(`${item.itemNo}: ${item.description || 'Steel item'} = \u20B9${item.totalUptoDateAmount.toLocaleString('en-IN')}`);
    } else {
      if (chapter === 4 || chapter === 5) {
        cementTotal += item.totalUptoDateAmount;
      }
      nonSteelItems.push(`${item.itemNo}: ${item.description || 'Non-steel item'} = \u20B9${item.totalUptoDateAmount.toLocaleString('en-IN')}`);
    }
  }

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (items.length > 0 && header.billNo && grossBillAmount > 0) {
    confidence = 'high';
  } else if (items.length > 0 || header.billNo) {
    confidence = 'medium';
  }

  const result: ParsedBillData = {
    billNo: header.billNo || null,
    agreementNo: header.agreementNo || null,
    contractorName: header.contractorName || null,
    workDescription: header.workDescription || null,
    dateOfMeasurement: header.dateOfMeasurement || null,
    dateOfCommencement: header.dateOfCommencement || null,
    agreementDate: header.agreementDate || null,
    grossBillAmount: grossBillAmount || null,
    cementAmount: cementTotal > 0 ? Math.round(cementTotal * 100) / 100 : null,
    steelTmtBarsAmount: tmtBarsAmount > 0 ? Math.round(tmtBarsAmount * 100) / 100 : null,
    lineItems: items,
    steelSummary: {
      totalAmount: Math.round(steelTotal * 100) / 100,
      tmtBarsAmount: Math.round(tmtBarsAmount * 100) / 100,
      angleChannelAmount: 0,
      platesAmount: 0,
      otherSectionsAmount: Math.round((steelTotal - tmtBarsAmount) * 100) / 100,
      items: steelItems,
    },
    nonSteelSummary: {
      totalAmount: Math.round((grossBillAmount - steelTotal) * 100) / 100,
      items: nonSteelItems,
    },
    scheduleSummary,
    suggestedClassifications: [],
    nonScheduleItems: [],
    confidence,
    notes: `Extracted via text parser (no AI). ${items.length} line items found across ${Object.keys(scheduleSummary).length} schedules.`,
    extractionMethod: 'text-parser',
  };

  logger.log(`\u2705 Text parser: ${items.length} items, gross=${grossBillAmount}, cement=${cementTotal}, steel=${steelTotal}`);
  return result;
}

