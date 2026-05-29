import { NextRequest, NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/payment-validation';
import { GCC_CLASSIFICATIONS } from '@/lib/gcc-classifications-data';
import { prisma } from '@/lib/db';
import { extractLayoutText } from '@/lib/pdf-layout-extract';
import { parseIREPSBillText, ParsedLineItem } from '@/lib/bill-text-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Quick Extract API — pure text parsing, NO LLM calls.
 * Uses pdfjs-dist for text extraction + deterministic regex parser.
 */
export async function POST(request: NextRequest) {
  try {
    const validation = await validateApiAccess(request);
    if (!validation.authorized) {
      return NextResponse.json({ error: validation.message || 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const pdfTextFromClient = formData.get('pdfText') as string | null;

    if (!file && !pdfTextFromClient) {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    let rawText = '';

    if (pdfTextFromClient && pdfTextFromClient.trim().length > 100) {
      // Use client-extracted text (layout-preserving)
      rawText = pdfTextFromClient;
      console.log(`📄 Quick Extract: Using client text (${rawText.length} chars)`);
    } else if (file) {
      // Extract text server-side using pdfjs-dist
      console.log(`📄 Quick Extract: Client text empty/short, extracting server-side from ${file.name} (${file.size} bytes)`);
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        rawText = await extractLayoutText(buffer);
        console.log(`📄 Quick Extract: Server extracted ${rawText.length} chars`);
      } catch (extractErr: any) {
        console.error('📄 Quick Extract: Server-side extraction failed:', extractErr.message);
        return NextResponse.json({
          error: `PDF text extraction failed: ${extractErr.message}. Please ensure this is a text-based PDF (not scanned).`
        }, { status: 400 });
      }
    }

    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json({
        error: 'Could not extract text from PDF. The PDF may be scanned/image-based. IREPS bills should have selectable text.'
      }, { status: 400 });
    }

    // Parse the extracted text
    const parsed = parseIREPSBillText(rawText);

    // Build PVC classification
    const pvcEntries = buildPVCClassification(parsed.lineItems);

    // Build group summary
    const groupSummary = buildGroupSummary(parsed.lineItems);

    // Try to match contract in DB
    let matchedContract: any = null;
    if (parsed.basicDetails.agreementNo) {
      try {
        matchedContract = await prisma.contract.findFirst({
          where: { agreementNo: { contains: parsed.basicDetails.agreementNo.replace(/\//g, '/') } },
          select: { id: true, agreementNo: true }
        });
      } catch { /* ignore DB errors */ }
    }

    // Build classification entries from line items
    const classificationEntries = parsed.lineItems.map(item => ({
      srNo: item.srNo,
      itemNo: item.itemNo,
      itemType: item.itemType,
      description: item.description,
      unit: item.unit,
      baseRate: item.baseRate,
      agreementRate: item.agreementRate,
      originalAgmtQty: item.originalAgmtQty,
      currentAgmtQty: item.currentAgmtQty,
      qtyUptoLastBill: item.qtyUptoLastBill,
      qtySinceLastBill: item.qtySinceLastBill,
      qtyUptoDate: item.qtyUptoDate,
      amountUptoLastBill: item.amountUptoLastBill,
      amountSinceLastBill: item.amountSinceLastBill,
      amountSinceLastBillIncSpCond: item.amountSinceLastBillIncSpCond,
      totalUptoDateAmount: item.totalUptoDateAmount,
      schedule: item.schedule,
      scheduleFullName: item.scheduleFullName || '',
      groupName: item.groupName || '',
      chapterName: item.chapterName || '',
      remarks: item.remarks || '',
    }));

    // Build classification groups for PVC tab
    const classificationGroups: Record<string, any[]> = {};
    for (const entry of pvcEntries) {
      const key = entry.pvcClass;
      if (!classificationGroups[key]) classificationGroups[key] = [];
      classificationGroups[key].push(entry);
    }

    const response = {
      basicDetails: parsed.basicDetails,
      classificationEntries,
      scheduleSummary: parsed.scheduleSummary,
      grandTotal: parsed.grandTotal,
      rebatePercent: parsed.rebatePercent,
      billAmountIncGST: parsed.billAmountIncGST,
      previousBillRef: parsed.previousBillRef,
      groupSummary,
      pvcSummary: pvcEntries,
      matchedContract,
      classificationGroups,
      confidence: 0.85,
      notes: [
        'Extracted using deterministic text parser (no LLM)',
        'Verify amounts against Schedule Summary totals',
        parsed.lineItems.some(i => !i.itemNo) ? 'Some item numbers could not be parsed — verify manually' : '',
      ].filter(Boolean),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Quick extract error:', error);
    return NextResponse.json(
      { error: `Extraction failed: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * PVC Classification: Assign 9A/9B/9C/9D based on item description and chapter.
 * Only for items with qtySinceLastBill > 0 (active items in current bill).
 */
function buildPVCClassification(items: ParsedLineItem[]): any[] {
  const results: any[] = [];
  for (const item of items) {
    if (item.qtySinceLastBill <= 0 && item.amountSinceLastBill <= 0 && item.amountSinceLastBillIncSpCond <= 0) continue;

    // Try to match from GCC_CLASSIFICATIONS database
    let pvcClass = '9B'; // Default
    const desc = (item.description + ' ' + (item.chapterName || '')).toLowerCase();

    // 9A: Earthwork
    if (/earth\s*work|excavat|embankment|filling.*earth|formation.*rehab/i.test(desc)) {
      pvcClass = '9A';
    }
    // 9C: Steel / TMT / Reinforcement
    else if (/steel|tmt|thermo.*mechanical|reinforc.*bar|fe-?500|tor.*steel|structural.*steel/i.test(desc)) {
      pvcClass = '9C';
    }
    // 9D: Machinery / Plant / Equipment
    else if (/machin|plant|equipment|crane|excavator|dozer|roller|compactor/i.test(desc)) {
      pvcClass = '9D';
    }
    // 9B: Cement / Concrete / General (default)
    else if (/cement|concrete|rcc|pcc|cc\s+block|mortar|plaster|pointing|pitching|masonry|brick/i.test(desc)) {
      pvcClass = '9B';
    }

    // Also try GCC_CLASSIFICATIONS lookup by item number
    if (item.itemNo) {
      const gccMatch = GCC_CLASSIFICATIONS.find(g =>
        g.code === item.itemNo || g.code.startsWith(item.itemNo.split('.')[0])
      );
      if (gccMatch) {
        const mainClass = gccMatch.mainClassification.toLowerCase();
        if (/earth/i.test(mainClass)) pvcClass = '9A';
        else if (/steel|reinforc/i.test(mainClass)) pvcClass = '9C';
        else if (/machin|plant/i.test(mainClass)) pvcClass = '9D';
        else pvcClass = '9B';
      }
    }

    results.push({
      srNo: item.srNo,
      itemNo: item.itemNo,
      description: item.description.substring(0, 120),
      unit: item.unit,
      pvcClass,
      qtySinceLastBill: item.qtySinceLastBill,
      amountSinceLastBill: item.amountSinceLastBill || item.amountSinceLastBillIncSpCond,
      schedule: item.schedule,
      groupName: item.groupName,
    });
  }
  return results;
}

/**
 * Build group-name-wise summary (SW I / SW II).
 */
function buildGroupSummary(items: ParsedLineItem[]): any[] {
  const groups: Record<string, { amtLast: number; amtSince: number; total: number; count: number }> = {};
  for (const item of items) {
    const g = item.groupName || 'Unknown';
    if (!groups[g]) groups[g] = { amtLast: 0, amtSince: 0, total: 0, count: 0 };
    groups[g].amtLast += item.amountUptoLastBill;
    groups[g].amtSince += item.amountSinceLastBill + item.amountSinceLastBillIncSpCond;
    groups[g].total += item.totalUptoDateAmount;
    groups[g].count++;
  }
  return Object.entries(groups).map(([name, data]) => ({
    groupName: name,
    itemCount: data.count,
    amountUptoLastBill: Math.round(data.amtLast * 100) / 100,
    amountSinceLastBill: Math.round(data.amtSince * 100) / 100,
    totalAmount: Math.round(data.total * 100) / 100,
  }));
}
