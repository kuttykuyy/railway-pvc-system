/**
 * Pure text parser for IREPS-generated Indian Railway bill PDFs.
 * No LLM dependency — uses regex and string parsing on pdftotext-style layout output.
 * Uses (G)/(I) item-type markers as reliable anchors for item extraction.
 *
 * KEY INSIGHT: pdftotext splits numbers across lines via STRING CONCATENATION.
 * E.g., "3005919." on line N + "89" on line N+2 = "3005919.89"
 *       "1080" on line N + "4.2" on line N+2 = "10804.2"
 */

import { getDSRUnitRegex, extractDSRUnit, containsDSRUnit } from './dsr-units-helper';

export interface ParsedBasicDetails {
  billNo: string;
  agreementNo: string;
  agreementDate: string | null;
  billDate: string | null;
  dateOfCompletion: string | null;
  contractorName: string;
  loaNo: string | null;
  loaDate: string | null;
  tenderAcceptingAuthority: string | null;
  dateOfCommencement: string | null;
  department: string | null;
  unit: string | null;
  nameOfWork: string;
  measurementNo: string | null;
  measurementDateFrom: string | null;
  measurementDateTo: string | null;
  rateInclusiveGST: string | null;
  tenderCallingAuthority: string | null;
  dateOfMeasurement: string;
}

export interface ParsedLineItem {
  srNo: number;
  itemNo: string;
  itemType: string;
  description: string;
  unit: string;
  baseRate: number;
  agreementRate: number;
  originalAgmtQty: number;
  currentAgmtQty: number;
  qtyUptoLastBill: number;
  qtySinceLastBill: number;
  qtyUptoDate: number;
  amountUptoLastBill: number;
  amountSinceLastBill: number;
  amountSinceLastBillIncSpCond: number;
  totalUptoDateAmount: number;
  schedule: string;
  scheduleFullName: string;
  groupName: string | null;
  chapterName: string | null;
  remarks: string | null;
}

export interface ParsedScheduleSummary {
  schedule: string;
  scheduleFullName: string;
  amtUptoLastBill: number;
  amtSinceLastBillIncSpCond: number;
  totalUptoDateAmt: number;
}

export interface ParsedBillData {
  basicDetails: ParsedBasicDetails;
  lineItems: ParsedLineItem[];
  scheduleSummary: ParsedScheduleSummary[];
  grandTotal: { amtUptoLastBill: number; amtSinceLastBill: number; totalUptoDate: number };
  rebatePercent: number;
  billAmountIncGST: number;
  previousBillRef: { billNo: string | null; totalAmt: number } | null;
}

function convertDateToISO(dateStr: string | null): string {
  if (!dateStr) return '';
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return dateStr;
}

// ─── MAIN ENTRY ───
export function parseIREPSBillText(rawText: string): ParsedBillData {
  const text = rawText.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const basicDetails = parseBasicDetails(text, lines);
  const lineItems = parseLineItems(lines);
  const { scheduleSummary, grandTotal, rebatePercent, billAmountIncGST, previousBillRef } =
    parseScheduleSummary(lines);

  // ── POST-PROCESSING FIXES ──
  for (const item of lineItems) {
    // Fix: totalAmt truncation — when amtSince=0, totalAmt should equal amtLast
    if (item.amountSinceLastBill === 0 && item.amountSinceLastBillIncSpCond === 0 &&
        item.amountUptoLastBill > 0 && item.totalUptoDateAmount > 0 &&
        Math.abs(item.totalUptoDateAmount - Math.floor(item.amountUptoLastBill)) < 1) {
      item.totalUptoDateAmount = item.amountUptoLastBill;
    }
    // Fix: if qtyUptoDate=0 but qtyUptoLastBill>0 and qtySinceLastBill=0
    if (item.qtyUptoDate === 0 && item.qtyUptoLastBill > 0 && item.qtySinceLastBill === 0) {
      item.qtyUptoDate = item.qtyUptoLastBill;
    }
    // Fix: if totalAmt present in schedule summary but item total is 0
    if (item.totalUptoDateAmount === 0 && item.amountUptoLastBill > 0) {
      item.totalUptoDateAmount = item.amountUptoLastBill;
    }
  }

  return { basicDetails, lineItems, scheduleSummary, grandTotal, rebatePercent, billAmountIncGST, previousBillRef };
}

// ═══════════════════════════════════════════
// 1. BASIC DETAILS
// ═══════════════════════════════════════════
function parseBasicDetails(text: string, lines: string[]): ParsedBasicDetails {
  const hdr = lines.slice(0, 28).join('\n');

  const billNoMatch = text.match(/Bill\s*No\.?\s*([A-Z0-9][A-Z0-9/\-]+)/i);
  const billNo = billNoMatch ? billNoMatch[1].trim() : '';

  const agreementNo = kvExtract(hdr, 'Agreement No\\.?', 'Agreement Date') || '';
  const agreementDate = kvExtract(hdr, 'Agreement Date', 'Bill Date') || null;
  const billDate = kvExtract(hdr, 'Bill Date', '') || null;
  const department = kvExtract(hdr, 'Department', 'Unit') || null;
  const unit = kvExtract(hdr, 'Unit', 'Date of Completion') || null;
  const loaNo = kvExtract(hdr, 'LOA No\\.?', 'LOA Date') || null;
  const loaDate = kvExtract(hdr, 'LOA Date', 'Tender Calling') || null;
  const tenderCallingAuthority = kvExtract(hdr, 'Tender Calling Authority', '') || null;
  const tenderAcceptingAuthority = kvExtract(hdr, 'Tender Accepting Authority', 'Work|Date') || null;

  let dateOfCompletion: string | null = null;
  const docMatch = hdr.match(/Date\s+of\s+Completion[^\d]*(\d{2}\/\d{2}\/\d{4})/i);
  if (docMatch) dateOfCompletion = docMatch[1];

  let dateOfCommencement: string | null = null;
  const dcMatch = hdr.match(/(?:Commencement\s+of\s*\n?\s*Work|Date\s+of\s+Commencement)[^\d]*(\d{2}\/\d{2}\/\d{4})/i);
  if (dcMatch) dateOfCommencement = dcMatch[1];
  if (!dateOfCommencement) {
    const wm = hdr.match(/Work\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (wm) dateOfCommencement = wm[1];
  }

  let measurementNo: string | null = null;
  const measLineIdx = lines.findIndex(l => /Measurement\s+No/i.test(l));
  if (measLineIdx >= 0 && measLineIdx + 1 < lines.length) {
    const nextLine = lines[measLineIdx + 1].trim();
    const parts = nextLine.split(/\s{2,}/);
    if (parts[0] && !/^(Measurement|Bill|Tender|Date|Rate)/i.test(parts[0])) {
      measurementNo = parts[0].trim();
    }
  }

  const measurementDateFrom = kvExtract(hdr, 'Measurement Date From', 'Measurement Date To') || null;
  const measurementDateTo = kvExtract(hdr, 'Measurement Date To', '') || null;

  let rateInclusiveGST: string | null = null;
  const gstM = hdr.match(/GST\s+(Yes|No)/i);
  if (gstM) rateInclusiveGST = gstM[1];

  // Contractor name
  let contractorName = '';
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (/Name\s+Of\s+Contractor/i.test(lines[i])) {
      const m = lines[i].match(/Name\s+Of\s+Contractor\s+(\S.*)/i);
      if (m) contractorName = m[1].trim();
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (/LOA|Tender|Measurement|Is\s+it/i.test(lines[j])) break;
        if (lines[j].length > 100) {
          const rt = lines[j].substring(100).trim();
          if (rt && rt.length > 1 && !/^\d{2}\//.test(rt)) contractorName += ' ' + rt;
        }
      }
      break;
    }
  }
  contractorName = contractorName.replace(/[-\s]+$/, '').replace(/\s+/g, ' ').trim();

  // Name of Work
  let nameOfWork = '';
  const nwLineIdx = lines.findIndex(l => /Name\s+Of\s+Work/i.test(l));
  if (nwLineIdx >= 0) {
    const startSearch = Math.max(nwLineIdx - 4, 0);
    const endSearch = Math.min(nwLineIdx + 5, lines.length);
    for (let k = startSearch; k < endSearch; k++) {
      const line = lines[k];
      if (!line || line.trim().length < 5) continue;
      if (/Name\s+Of\s+(Work|Contractor)/i.test(line)) continue;
      if (/LOA\s+No|Measurement|Is\s+it/i.test(line)) continue;
      const center = line.length > 30 ? line.substring(30, Math.min(100, line.length)).trim() : '';
      if (center && center.length > 5 && /[a-zA-Z]{3}/.test(center)) nameOfWork += ' ' + center;
    }
  }
  nameOfWork = nameOfWork.replace(/\s+/g, ' ').trim();

  return {
    billNo, agreementNo, agreementDate, billDate, dateOfCompletion, contractorName,
    loaNo, loaDate, tenderAcceptingAuthority, dateOfCommencement, department, unit,
    nameOfWork, measurementNo, measurementDateFrom, measurementDateTo,
    rateInclusiveGST, tenderCallingAuthority,
    dateOfMeasurement: convertDateToISO(billDate || measurementDateTo),
  };
}

function kvExtract(block: string, labelRegex: string, nextLabel: string): string {
  let pattern: RegExp;
  if (nextLabel) {
    pattern = new RegExp(labelRegex + '\\s+(.*?)\\s{2,}(?:' + nextLabel + '|$)', 'im');
  } else {
    pattern = new RegExp(labelRegex + '\\s+([^\\n]+?)\\s*$', 'im');
  }
  const m = block.match(pattern);
  if (m) {
    let val = m[1].trim();
    val = val.split(/\s{3,}/)[0].trim();
    return val;
  }
  const simple = new RegExp(labelRegex + '\\s+(\\S+)', 'im');
  const sm = block.match(simple);
  return sm ? sm[1].trim() : '';
}

// ═══════════════════════════════════════════
// 2. LINE ITEMS — anchor on (G)/(I) markers
// ═══════════════════════════════════════════
function parseLineItems(lines: string[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  const sectionStart = lines.findIndex(l => /Item\s*wise\s*Bill\s*Details/i.test(l));
  if (sectionStart < 0) return items;
  const sectionEnd = lines.findIndex((l, idx) => idx > sectionStart + 10 && /^\s*Schedule\s+Summary/i.test(l));
  const endIdx = sectionEnd > 0 ? sectionEnd : lines.length;

  // Find ALL (G) and (I) anchors
  const anchors: { lineIdx: number; type: string }[] = [];
  for (let i = sectionStart; i < endIdx; i++) {
    if (/\(G\)|\(I\)/.test(lines[i]) && !/^\s*Total\s*\(/i.test(lines[i].trim())) {
      const type = /\(I\)/.test(lines[i]) ? 'I' : 'G';
      anchors.push({ lineIdx: i, type });
    }
  }

  let lastSchedule = { code: '', fullName: '' };
  let lastGroup: string | null = null;
  let lastChapter: string | null = null;

  const markers: { lineIdx: number; type: string; value: string }[] = [];
  for (let i = sectionStart; i < endIdx; i++) {
    const t = lines[i];
    const trimmed = t.trim();
    if (/^\s*Schedule\s+(A1[ab]|A[23]|B)\s*[-\(]/i.test(t) && !/^\s*Total/i.test(trimmed)) {
      markers.push({ lineIdx: i, type: 'schedule', value: trimmed });
    } else if (/^\s*Group\s+Name:\-/i.test(t)) {
      const gm = trimmed.match(/Group\s+Name:\-\s*(S\.?W\.?\s*I{1,2})/i);
      markers.push({ lineIdx: i, type: 'group', value: gm ? gm[1].replace(/\s+/g, '') : trimmed.replace(/^Group\s+Name:\-\s*/i, '') });
    } else if (/^\s*Chapter\s+Name:\-/i.test(t)) {
      markers.push({ lineIdx: i, type: 'chapter', value: trimmed.replace(/^Chapter\s+Name:\-\s*/i, '') });
    }
  }

  for (let ai = 0; ai < anchors.length; ai++) {
    const anchor = anchors[ai];
    const prevAnchor = ai > 0 ? anchors[ai - 1] : null;

    const lowerBound = prevAnchor ? prevAnchor.lineIdx + 1 : sectionStart;
    let blockStart = anchor.lineIdx;
    for (let j = anchor.lineIdx - 1; j >= lowerBound; j--) {
      const t = lines[j].trim();
      if (!t) continue;
      if (/^Group\s+Name:|^Chapter\s+Name:|^\s*Total\s*\(|Schedule\s+Summary|^Page\s+\d+/i.test(t)) break;
      if (/^\s*Schedule\s+(A1[ab]|A[23]|B)\s*[-\(]/i.test(lines[j]) && !/^Total/i.test(t)) break;
      if (/\d/.test(t) || containsDSRUnit(t)) blockStart = j;
    }

    let blockEnd = anchor.lineIdx;
    const nextAnchor = ai + 1 < anchors.length ? anchors[ai + 1] : null;
    const maxEnd = nextAnchor ? nextAnchor.lineIdx : endIdx;
    for (let j = anchor.lineIdx + 1; j < maxEnd; j++) {
      const t = lines[j].trim();
      if (!t) { blockEnd = j; continue; }
      if (/^Group\s+Name:|^Chapter\s+Name:|^\s*Total\s*\(|Schedule\s+Summary|^Page\s+\d+/i.test(t)) break;
      if (/^\s*Schedule\s+(A1[ab]|A[23]|B)\s*[-\(]/i.test(lines[j]) && !/^Total/i.test(t)) break;
      if (containsDSRUnit(t) && (t.match(/\d+\.?\d*/g) || []).length > 4) break;
      blockEnd = j;
    }

    // Update context from markers above this block
    for (const marker of markers) {
      if (marker.lineIdx >= blockStart) break;
      if (marker.type === 'schedule') lastSchedule = { code: identifyScheduleCode(marker.value), fullName: marker.value };
      else if (marker.type === 'group') lastGroup = marker.value;
      else if (marker.type === 'chapter') lastChapter = marker.value;
    }

    const blockLines = lines.slice(blockStart, blockEnd + 1);
    const anchorOffset = anchor.lineIdx - blockStart;
    const parsed = parseItemBlock(blockLines, anchorOffset);

    items.push({
      srNo: ai + 1, itemNo: parsed.itemNo, itemType: anchor.type,
      description: parsed.description, unit: parsed.unit,
      baseRate: parsed.baseRate, agreementRate: parsed.agreementRate,
      originalAgmtQty: parsed.originalAgmtQty, currentAgmtQty: parsed.currentAgmtQty,
      qtyUptoLastBill: parsed.qtyUptoLastBill, qtySinceLastBill: parsed.qtySinceLastBill,
      qtyUptoDate: parsed.qtyUptoDate,
      amountUptoLastBill: parsed.amountUptoLastBill, amountSinceLastBill: parsed.amountSinceLastBill,
      amountSinceLastBillIncSpCond: parsed.amountSinceLastBillIncSpCond,
      totalUptoDateAmount: parsed.totalUptoDateAmount,
      schedule: lastSchedule.code, scheduleFullName: lastSchedule.fullName,
      groupName: lastGroup, chapterName: lastChapter, remarks: parsed.remarks,
    });
  }

  return items;
}

function identifyScheduleCode(text: string): string {
  if (/A1b/i.test(text)) return 'A1b';
  if (/A1a/i.test(text)) return 'A1a';
  if (/A3/i.test(text)) return 'A3';
  if (/A2/i.test(text)) return 'A2';
  if (/\bB\b/i.test(text)) return 'B';
  return '';
}

interface ParsedItemBlock {
  itemNo: string; unit: string; description: string;
  baseRate: number; agreementRate: number;
  originalAgmtQty: number; currentAgmtQty: number;
  qtyUptoLastBill: number; qtySinceLastBill: number; qtyUptoDate: number;
  amountUptoLastBill: number; amountSinceLastBill: number;
  amountSinceLastBillIncSpCond: number; totalUptoDateAmount: number;
  remarks: string | null;
}

function parseItemBlock(blockLines: string[], anchorOffset: number): ParsedItemBlock {
  // ── ITEM NUMBER ──
  let itemNo = '';
  const anchorLine = blockLines[anchorOffset] || '';
  const itemNoCandidates: { value: string; line: number }[] = [];

  for (let i = 0; i < blockLines.length; i++) {
    const bl = blockLines[i];
    // DSR: X.X.X or X.X
    const dsrM = bl.match(/^\s{2,15}(\d{1,2}\.\d{1,3}(?:\.\d{1,3})?)\s/);
    if (dsrM) itemNoCandidates.push({ value: dsrM[1], line: i });
    // SOR 4-digit
    const sorM = bl.match(/^\s{2,15}(\d{4})\s/);
    if (sorM) itemNoCandidates.push({ value: sorM[1], line: i });
    // NS pattern
    const nsM = bl.match(/^\s{2,15}(ns\d+)\s/i);
    if (nsM) itemNoCandidates.push({ value: nsM[1], line: i });
    // SOR after " - "
    const dashSorM = bl.match(/^\s*-\s+(\d{4})\s/);
    if (dashSorM) itemNoCandidates.push({ value: dashSorM[1], line: i });
    // Sub-number on " - XX" line
    const dashSubM = bl.match(/^\s*-\s+(\d{1,2})\s/);
    if (dashSubM && i !== anchorOffset) itemNoCandidates.push({ value: dashSubM[1], line: i });
  }

  const anchorSuffix = anchorLine.match(/^\s+\.?(\d{1,3})\s*\([GI]\)/i);

  if (itemNoCandidates.length > 0) {
    const dsrCandidates = itemNoCandidates.filter(c => /^\d{1,2}\.\d/.test(c.value));
    const sorCandidates = itemNoCandidates.filter(c => /^\d{4}$/.test(c.value));
    const nsCandidates = itemNoCandidates.filter(c => /^ns/i.test(c.value));

    let mainNo = '';
    if (dsrCandidates.length > 0) mainNo = dsrCandidates[0].value;
    else if (sorCandidates.length > 0) mainNo = sorCandidates[0].value;
    else if (nsCandidates.length > 0) mainNo = nsCandidates[0].value;
    else mainNo = itemNoCandidates[0].value;

    if (anchorSuffix) {
      const suffix = anchorSuffix[1];
      if (!mainNo.endsWith('.' + suffix) && !mainNo.endsWith(suffix)) {
        mainNo = mainNo + '.' + suffix;
      }
    }

    // For SOR items: look for sub-number
    if (/^\d{4}$/.test(mainNo)) {
      for (const c of itemNoCandidates) {
        if (c.value !== mainNo && /^\d{1,2}$/.test(c.value)) {
          mainNo = mainNo + '.' + c.value;
          break;
        }
      }
    }

    itemNo = mainNo;
  }

  // ── UNIT ──
  const fullBlock = blockLines.join('\n');
  const unit = extractDSRUnit(fullBlock) || '';

  // ── REMARKS ──
  const remarksM = fullBlock.match(/(Now\s+to\s+pay\s+\d+%)/i);
  const remarks = remarksM ? remarksM[1] : null;

  // ── DESCRIPTION ──
  const descLines: string[] = [];
  const afterType = anchorLine.replace(/.*\([GI]\)\s*/i, '').trim();
  if (afterType && afterType.length > 3 && /[a-zA-Z]{2}/.test(afterType)) {
    descLines.push(afterType.replace(/Now\s+to\s+pay.*/i, '').trim());
  }
  for (let i = anchorOffset + 1; i < blockLines.length; i++) {
    const t = blockLines[i].trim();
    if (!t) continue;
    if (/^Page\s+\d+/i.test(t)) continue;
    const letters = (t.match(/[a-zA-Z]/g) || []).length;
    if (letters > 5) descLines.push(t.replace(/Now\s+to\s+pay.*/i, '').trim());
  }
  const description = descLines.join(' ').replace(/\s+/g, ' ').trim();

  // ── NUMERIC VALUES ──
  const numerics = extractPositionedNumbers(blockLines, anchorOffset);
  const reconstructed = reconstructSplitNumbers(numerics);
  const values = assignValues(reconstructed);

  return { itemNo, unit, description, remarks, ...values };
}

interface PosNum {
  value: number;
  rawText: string;
  col: number;
  rightEdge: number; // col + rawText.length
  line: number;
  endsWithDot: boolean;
  idx: number; // original index for matching
}

function extractPositionedNumbers(blockLines: string[], anchorOffset: number): PosNum[] {
  const result: PosNum[] = [];
  let idx = 0;
  for (let li = 0; li <= Math.min(anchorOffset, blockLines.length - 1); li++) {
    let line = blockLines[li];
    if (li === anchorOffset) {
      const typeIdx = line.search(/\([GI]\)/i);
      if (typeIdx >= 0) line = line.substring(0, typeIdx);
    }
    line = line.replace(/Now\s+to\s+pay.*/i, '').replace(/Page\s+\d+\s+of\s+\d+/i, '');
    const regex = /(\d+\.?\d*\.?)/g;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const raw = m[1];
      if (m.index < 3 && raw.length <= 2) continue; // skip sr.no markers
      const val = parseFloat(raw.replace(/\.$/, ''));
      if (!isNaN(val)) {
        result.push({
          value: val, rawText: raw, col: m.index,
          rightEdge: m.index + raw.length,
          line: li, endsWithDot: raw.endsWith('.'), idx: idx++,
        });
      }
    }
  }
  return result;
}

/**
 * Reconstruct numbers split across lines via PAIRWISE MATCHING.
 * For each number on an earlier line, find the best matching continuation
 * on a later line at a similar column position.
 *
 * Matching criteria:
 * - Different lines
 * - Column proximity: min(leftEdgeDist, rightEdgeDist) ≤ threshold
 *   - threshold = 16 if main number ends with dot (explicit decimal split)
 *   - threshold = 5 if main number does not end with dot
 * - For non-dot main: continuation value must be < 100 (small decimal part)
 */
function reconstructSplitNumbers(nums: PosNum[]): PosNum[] {
  if (nums.length === 0) return [];

  // Group by line
  const byLine = new Map<number, PosNum[]>();
  for (const n of nums) {
    if (!byLine.has(n.line)) byLine.set(n.line, []);
    byLine.get(n.line)!.push(n);
  }
  const lineNums = Array.from(byLine.keys()).sort((a, b) => a - b);

  const matchedContIdx = new Set<number>(); // indices of consumed continuation numbers
  const pairMap = new Map<number, number>(); // mainIdx -> contIdx

  // For each pair of lines (earlier → later), try to match.
  // KEY: in IREPS bills, the main data line and continuation line are always
  // separated by at least one line (rate/unit line). So only match lines
  // that are >= 2 apart to avoid false positives.
  for (let li = 0; li < lineNums.length; li++) {
    for (let lj = li + 1; lj < lineNums.length; lj++) {
      if (lineNums[lj] - lineNums[li] < 2) continue; // skip adjacent lines
      const mainNums = byLine.get(lineNums[li])!;
      const contNums = byLine.get(lineNums[lj])!;

      // Sort main by column to process left-to-right
      const sortedMain = [...mainNums].sort((a, b) => a.col - b.col);

      for (const main of sortedMain) {
        if (pairMap.has(main.idx)) continue; // already matched

        const thresh = main.endsWithDot ? 16 : 5;
        let bestContIdx = -1;
        let bestDist = Infinity;

        for (const cont of contNums) {
          if (matchedContIdx.has(cont.idx)) continue;
          if (pairMap.has(cont.idx)) continue; // cont is itself a main that was matched

          // For non-dot main: continuation must be small
          if (!main.endsWithDot && cont.value >= 100) continue;

          const leftDist = Math.abs(main.col - cont.col);
          const rightDist = Math.abs(main.rightEdge - cont.rightEdge);
          const dist = Math.min(leftDist, rightDist);

          if (dist <= thresh && dist < bestDist) {
            bestDist = dist;
            bestContIdx = cont.idx;
          }
        }

        if (bestContIdx >= 0) {
          pairMap.set(main.idx, bestContIdx);
          matchedContIdx.add(bestContIdx);
        }
      }
    }
  }

  // Build result: concatenate matched pairs, keep unmatched as-is
  const result: PosNum[] = [];
  for (const n of nums) {
    if (matchedContIdx.has(n.idx)) continue; // consumed as continuation

    if (pairMap.has(n.idx)) {
      const cont = nums.find(x => x.idx === pairMap.get(n.idx)!)!;
      let combined: string;
      if (n.endsWithDot) {
        // "3005919." + "89" → "3005919.89"
        combined = n.rawText + cont.rawText.replace(/\./g, '');
      } else {
        // "1031" + "8.0" → "10318.0"
        combined = n.rawText + cont.rawText;
      }
      const val = parseFloat(combined);
      result.push({ ...n, value: isNaN(val) ? 0 : val, rawText: combined });
    } else {
      // Clean trailing dot for standalone numbers
      const cleanVal = parseFloat(n.rawText.replace(/\.$/, ''));
      result.push({ ...n, value: isNaN(cleanVal) ? 0 : cleanVal });
    }
  }

  return result;
}

function assignValues(nums: PosNum[]): {
  baseRate: number; agreementRate: number;
  originalAgmtQty: number; currentAgmtQty: number;
  qtyUptoLastBill: number; qtySinceLastBill: number; qtyUptoDate: number;
  amountUptoLastBill: number; amountSinceLastBill: number;
  amountSinceLastBillIncSpCond: number; totalUptoDateAmount: number;
} {
  const def = {
    baseRate: 0, agreementRate: 0,
    originalAgmtQty: 0, currentAgmtQty: 0,
    qtyUptoLastBill: 0, qtySinceLastBill: 0, qtyUptoDate: 0,
    amountUptoLastBill: 0, amountSinceLastBill: 0,
    amountSinceLastBillIncSpCond: 0, totalUptoDateAmount: 0,
  };
  if (nums.length === 0) return def;

  // Filter out item-number tokens (col < 17) and "100" from "Now to pay 100%"
  const filtered = nums.filter(n => {
    if (n.col < 17) return false;
    if (n.value === 100 && n.col > 130) return false;
    return true;
  });

  // Sort all numbers by column position for ORDER-BASED assignment.
  // IREPS bills always have 11 data columns in this exact order:
  // baseRate, agmtRate, origQty, currQty, qtyLast, qtySince, qtyDate,
  // amtLast, amtSince, amtSpCond, totalAmt
  //
  // Column positions shift between items, so we can't use fixed boundaries.
  // Instead, sort by column and assign in order.
  filtered.sort((a, b) => a.col - b.col);

  // Deduplicate: remove numbers that are very close in both column AND value
  // (same number appearing on multiple data lines at nearly the same position)
  const deduped: PosNum[] = [];
  for (const n of filtered) {
    const isDup = deduped.some(d =>
      Math.abs(d.col - n.col) < 4 &&
      Math.abs(d.value - n.value) < 0.01
    );
    if (!isDup) deduped.push(n);
  }

  // Expected: 11 values. Assign in order.
  const vals = deduped.map(n => n.value);
  const fieldNames = [
    'baseRate', 'agreementRate',
    'originalAgmtQty', 'currentAgmtQty',
    'qtyUptoLastBill', 'qtySinceLastBill', 'qtyUptoDate',
    'amountUptoLastBill', 'amountSinceLastBill',
    'amountSinceLastBillIncSpCond', 'totalUptoDateAmount',
  ] as const;

  if (vals.length >= 11) {
    // Perfect: assign first 11 in order
    for (let i = 0; i < 11; i++) {
      (def as any)[fieldNames[i]] = vals[i];
    }
  } else if (vals.length >= 7) {
    // Partial data: assign rates first, then try to fill from the end for amounts
    def.baseRate = vals[0] || 0;
    def.agreementRate = vals[1] || 0;
    // Fill quantities from index 2
    const remaining = vals.slice(2);
    if (remaining.length >= 9) {
      // All qty + amt
      def.originalAgmtQty = remaining[0];
      def.currentAgmtQty = remaining[1];
      def.qtyUptoLastBill = remaining[2];
      def.qtySinceLastBill = remaining[3];
      def.qtyUptoDate = remaining[4];
      def.amountUptoLastBill = remaining[5];
      def.amountSinceLastBill = remaining[6];
      def.amountSinceLastBillIncSpCond = remaining[7]; // "Amount Since last Bill including special condition"
      def.totalUptoDateAmount = remaining[8];
    } else {
      // Assign what we can
      for (let i = 0; i < remaining.length && i + 2 < fieldNames.length; i++) {
        (def as any)[fieldNames[i + 2]] = remaining[i];
      }
    }
  } else {
    // Very few values: assign what we can
    for (let i = 0; i < vals.length && i < fieldNames.length; i++) {
      (def as any)[fieldNames[i]] = vals[i];
    }
  }

  return def;
}

// ═══════════════════════════════════════════
// 3. SCHEDULE SUMMARY
// ═══════════════════════════════════════════
function parseScheduleSummary(lines: string[]): {
  scheduleSummary: ParsedScheduleSummary[];
  grandTotal: { amtUptoLastBill: number; amtSinceLastBill: number; totalUptoDate: number };
  rebatePercent: number;
  billAmountIncGST: number;
  previousBillRef: { billNo: string | null; totalAmt: number } | null;
} {
  const scheduleSummary: ParsedScheduleSummary[] = [];
  let grandTotal = { amtUptoLastBill: 0, amtSinceLastBill: 0, totalUptoDate: 0 };
  let rebatePercent = 0;
  let billAmountIncGST = 0;
  let previousBillRef: { billNo: string | null; totalAmt: number } | null = null;

  const summaryStart = lines.findIndex(l => /^\s*Schedule\s+Summary/i.test(l));
  if (summaryStart < 0) return { scheduleSummary, grandTotal, rebatePercent, billAmountIncGST, previousBillRef };

  const summaryLines = lines.slice(summaryStart, Math.min(summaryStart + 80, lines.length));

  // The schedule summary section has split numbers too.
  // Collect the full text and parse line by line.
  for (let i = 0; i < summaryLines.length; i++) {
    const line = summaryLines[i].trim();
    if (!line) continue;

    if (/Cost\s+Breakup|Amt\s+including|Amt\s+Upto|Total\s+upto\s+date|^\s*Condition/i.test(line)
      && !/^Schedule/i.test(line) && !/^Total/i.test(line)) continue;

    if (/^Total\s+Amount/i.test(line)) {
      // Collect numbers from this and next few lines (may be split)
      const block = summaryLines.slice(i, Math.min(i + 3, summaryLines.length)).join(' ');
      const nums = extractSummaryNumbers(block);
      if (nums.length >= 3) {
        grandTotal = { amtUptoLastBill: nums[0], amtSinceLastBill: nums[1], totalUptoDate: nums[2] };
      }
      i += 2;
      continue;
    }

    if (/^Rebate/i.test(line)) {
      const rm = line.match(/Rebate\s*\((\d+(?:\.\d+)?)%\)/i);
      if (rm) rebatePercent = parseFloat(rm[1]);
      continue;
    }

    if (/Bill\s+Amount.*Including.*GST/i.test(line)) {
      const nums = extractSummaryNumbers(line);
      if (nums.length > 0) billAmountIncGST = nums[nums.length - 1];
      continue;
    }

    if (/Previous\s+Bill/i.test(line)) {
      let refBlock = '';
      for (let j = i; j < Math.min(i + 4, summaryLines.length); j++) refBlock += ' ' + summaryLines[j];
      const billM = refBlock.match(/([A-Z0-9][A-Z0-9/\-]+\/B\d+)/i);
      const nums = extractSummaryNumbers(refBlock).filter(n => n > 1000);
      previousBillRef = { billNo: billM ? billM[1] : null, totalAmt: nums.length > 0 ? nums[nums.length - 1] : 0 };
      i += 3;
      continue;
    }

    if (/^Schedule\s+(A1[ab]|A[23]|B)/i.test(line)) {
      let schedName = line;
      const schedCode = identifyScheduleCode(line);
      // Collect the full schedule block (name + data lines) - usually spans 2-4 lines
      const blockLines = [summaryLines[i]];
      let foundData = false;
      for (let j = i + 1; j < Math.min(i + 6, summaryLines.length); j++) {
        const nextLine = summaryLines[j];
        blockLines.push(nextLine);
        // Check if we have enough numbers across the collected block
        const blockText = blockLines.join('\n');
        const nums = extractScheduleSummaryAmounts(blockText);
        if (nums.length >= 2) {
          scheduleSummary.push({
            schedule: schedCode,
            scheduleFullName: schedName.replace(/\s+/g, ' ').trim(),
            amtUptoLastBill: nums[0] || 0,
            amtSinceLastBillIncSpCond: nums.length >= 3 ? nums[1] : 0,
            totalUptoDateAmt: nums[nums.length - 1] || 0,
          });
          i = j;
          foundData = true;
          break;
        }
        // Maybe schedule name continuation
        const nt = nextLine.trim();
        if (nt && !/^Schedule|^Total|^Rebate|^Bill|^Previous|^Page|^Unique/i.test(nt)) {
          if (/[a-zA-Z]{3}/.test(nt)) schedName += ' ' + nt;
        }
      }
      continue;
    }

    if (/Unique\s+Work\s+Id/i.test(line)) break;
  }

  return { scheduleSummary, grandTotal, rebatePercent, billAmountIncGST, previousBillRef };
}

/** Extract numbers from summary text, handling split numbers across lines */
function extractSummaryNumbers(text: string): number[] {
  const nums: number[] = [];
  const matches = text.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return [];
  for (const m of matches) {
    const val = parseFloat(m);
    if (val > 1) nums.push(val);
  }
  return nums;
}

/** 
 * Extract schedule summary amounts, handling the split-number pattern.
 * Schedule summary lines have amounts split across lines like:
 * "15506571.7" on one line and "4" on the next → 15506571.74
 */
function extractScheduleSummaryAmounts(blockText: string): number[] {
  const lines = blockText.split('\n');
  // Find the line(s) with large numbers (> 10000) — these are the amount lines
  const amountNums: { value: number; rawText: string; col: number; line: number; endsWithDot: boolean }[] = [];
  
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const regex = /(\d+\.?\d*\.?)/g;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const raw = m[1];
      const val = parseFloat(raw.replace(/\.$/, ''));
      if (!isNaN(val) && val > 10) {
        amountNums.push({ value: val, rawText: raw, col: m.index, line: li, endsWithDot: raw.endsWith('.') });
      }
    }
  }

  // Reconstruct split numbers: match dot-ending with continuation
  const used = new Set<number>();
  const result: number[] = [];

  for (let i = 0; i < amountNums.length; i++) {
    if (used.has(i)) continue;
    const n = amountNums[i];
    
    if (n.endsWithDot) {
      // Find continuation on a later line at similar column
      let bestJ = -1;
      let bestDist = 999;
      for (let j = i + 1; j < amountNums.length; j++) {
        if (used.has(j)) continue;
        const c = amountNums[j];
        if (c.line === n.line) continue;
        if (c.value >= 100) continue; // continuation should be small (decimal digits)
        const dist = Math.min(Math.abs(c.col - n.col), Math.abs((c.col + c.rawText.length) - (n.col + n.rawText.length)));
        if (dist < bestDist && dist <= 16) {
          bestDist = dist;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        const combined = n.rawText + amountNums[bestJ].rawText.replace(/\./g, '');
        result.push(parseFloat(combined) || n.value);
        used.add(bestJ);
      } else {
        result.push(n.value);
      }
    } else if (n.value > 100) {
      result.push(n.value);
    }
    used.add(i);
  }

  return result;
}
