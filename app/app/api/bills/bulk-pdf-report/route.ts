import { logger } from '@/lib/logger';


import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQuarterMonths, getQuarterFromDate, calculateWeightedComponents, calculatePvcComponentWithSteps, calculateDedicatedCementPvcWithSteps, calculateDedicatedSteelPvcWithSteps } from '@/lib/pvc-calculations';
import { createQuarterlyAveragesMemo } from '@/lib/db-utils';
import { format, addMonths, startOfMonth } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import { getFileUrl } from '@/lib/s3';
import { withTimeout, TIMEOUT_DEFAULTS } from '@/lib/api-timeout';
import { getSteelIndexNamesForZone, getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { embedLabourIndex, embedComponentIndicesRange } from '@/lib/pdf/utils/labour-index-embedder';
import { ComponentType } from '@prisma/client';
import { buildCumulativePvcSummaries, compareBillsChronologically } from '@/lib/pdf/cumulative-pvc';

/**
 * Appends the contract's abstract to a finished bulk PDF.
 *
 * Used by both output formats. It lived inside the IR branch only, so asking for the
 * abstract with the detailed format produced a file without one and said nothing.
 *
 * Returns the reason when nothing was appended, so the caller can tell the user
 * rather than hand back a silently incomplete file.
 */
async function appendContractAbstract(
  pdfBytes: Uint8Array,
  contractIds: string[],
): Promise<{ bytes: Uint8Array; status: string }> {
  // An abstract covers one agreement. Printed over a mixed batch it would state a
  // total for bills that are not all in the file.
  if (contractIds.length !== 1) return { bytes: pdfBytes, status: 'skipped-multiple-agreements' };
  try {
    const { PDFDocument } = await import('pdf-lib');
    const { generateAbstractPdf } = await import('@/lib/pdf/generators/abstract-report');
    const { pdfBuffer: abstractBytes } = await generateAbstractPdf(contractIds[0]);

    const target = await PDFDocument.load(pdfBytes);
    const abstractDoc = await PDFDocument.load(new Uint8Array(abstractBytes));
    const pages = await target.copyPages(abstractDoc, abstractDoc.getPageIndices());
    for (const page of pages) target.addPage(page);
    return { bytes: new Uint8Array(await target.save()), status: 'attached' };
  } catch (err: any) {
    // The statements are the deliverable; a missing abstract must not lose them.
    console.error('Bulk PDF: could not append the abstract:', err);
    return { bytes: pdfBytes, status: `unavailable: ${String(err?.message || 'error').slice(0, 120)}` };
  }
}

const STEEL_COMPONENT_TYPES = [ComponentType.TMT_BARS, ComponentType.ANGLE_CHANNEL, ComponentType.PLATES, ComponentType.OTHER_SECTIONS];
const NON_STEEL_COMPONENT_TYPES = Object.values(ComponentType).filter(t => !STEEL_COMPONENT_TYPES.includes(t as any)) as ComponentType[];

function anyBillHasSteel(bills: any[]): boolean {
  return bills.some(b => {
    const pvc = b.pvcCalculation;
    if (pvc && (
      (pvc.steelPvc ?? 0) !== 0
      || (pvc.dedicatedSteelPvc ?? 0) !== 0
      || (pvc.dedicatedSteelTmtBarsPvc ?? 0) !== 0
      || (pvc.dedicatedSteelAngleChannelPvc ?? 0) !== 0
      || (pvc.dedicatedSteelPlatesPvc ?? 0) !== 0
      || (pvc.dedicatedSteelOtherSectionsPvc ?? 0) !== 0
    )) {
      return true;
    }

    const entries = b.classificationEntries || [];
    return entries.some((entry: any) => {
      const steelTypes = entry.steelTypes || [];
      if (steelTypes.length > 0) return true;
      const code = String(entry.subClassification?.code || '').trim().toUpperCase();
      return code.endsWith('B') || code === 'STEEL';
    });
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for bulk PDF generation

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

// POST /api/bills/bulk-pdf-report - Generate enhanced combined PDF report for multiple bills
export async function POST(request: NextRequest) {
  // One memo for this request. A batch's bills mostly share a quarter, and every one of
  // them asked the database for the same three months of the same indices — three or
  // four queries each, in sequence, on one connection.
  const quarterlyAverages = createQuarterlyAveragesMemo();
  try {
    // Rate limiting for expensive bulk PDF generation
    const identifier = getIdentifier(request);
    const rateLimit = rateLimiter.check(identifier, RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: `Too many bulk PDF generation requests. Please try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
          }
        }
      );
    }

    // Execute with timeout protection (60 seconds for bulk PDF generation)
    return await withTimeout(
      (async () => {
        if (!jsPDF) {
          throw new Error('jsPDF is not available');
        }
        
        const body = await request.json();
        const { billIds, format: pdfFormat } = body;
        const includeIndexDocs = body.includeDocs !== false; // default: include
        // The abstract goes in unless the caller explicitly says no. It is what the
        // accounts office asks for alongside the statements, and making it a choice
        // meant it was almost never there.
        const includeAbstract = body.includeAbstract !== false;
        // Reported back in a header so a batch that couldn't take an abstract says why,
        // instead of returning a file that quietly lacks one.
        let abstractStatus = includeAbstract ? 'pending' : 'not-requested';

    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return NextResponse.json(
        { error: 'Bill IDs are required and must be an array' },
        { status: 400 }
      );
    }

    // Whose bills these are is checked BEFORE anything is fetched. This route took a
    // list of ids and served the reports with no ownership check at all — the session
    // was only read further down, for the letterhead — so any signed-in user could
    // request any other user's bills by id. Ids the requester cannot access are
    // dropped, the same rule the bills list applies.
    const authSession = await getServerSession(authOptions);
    if (!authSession?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const requester = await prisma.user.findUnique({
      where: { email: authSession.user.email },
      select: { id: true, role: true },
    });
    if (!requester) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { getUserAccessibleBills } = await import('@/lib/permissions');
    const accessibleBillIds = await getUserAccessibleBills(requester.id);
    const permittedBillIds = accessibleBillIds === null
      ? billIds // unrestricted (admin)
      : billIds.filter((id: string) => accessibleBillIds.includes(id));
    if (permittedBillIds.length === 0) {
      return NextResponse.json({ error: 'You do not have access to these bills.' }, { status: 403 });
    }

    // Get all selected bills with detailed information
    const bills = await prisma.bill.findMany({
      where: {
        id: { in: permittedBillIds }
      },
      include: {
        contract: {
          include: {
            extensions: {
              orderBy: { originalCompletionDate: 'asc' }
            }
          }
        },
        pvcCalculation: true,
        workClassification: true,
        billTransaction: true,
        classificationEntries: {
          include: {
            classification: true,
            subClassification: true
          }
        }
      },
      orderBy: [
        { contract: { agreementNo: 'asc' } },
        { createdAt: 'asc' }
      ]
    });

    // The trial watermark applies here exactly as it does on the single-bill report —
    // this route was the way around it: put the free-trial bill in a "batch" of one and
    // download it clean. Same rule as pdf-report: a trial-discounted bill is watermarked
    // until its owner has topped up at least once; admins are exempt.
    const isAdminRequester = requester.role === 'admin' || requester.role === 'superadmin';
    let bulkNeedsWatermark = false;
    if (!isAdminRequester) {
      const trialOwnerIds = [...new Set(
        bills
          .filter((b: any) => b.billTransaction?.discountType === 'trial')
          .map((b: any) => b.contract?.userId)
          .filter(Boolean),
      )] as string[];
      if (trialOwnerIds.length > 0) {
        const ownersWithTopup = await prisma.creditTransaction.findMany({
          where: { userId: { in: trialOwnerIds }, type: 'add' },
          select: { userId: true },
          distinct: ['userId'],
        });
        const topupOwners = new Set(ownersWithTopup.map(t => t.userId));
        bulkNeedsWatermark = trialOwnerIds.some(id => !topupOwners.has(id));
      }
    }

    if (bills.length === 0) {
      return NextResponse.json(
        { error: 'No bills found for the provided IDs' },
        { status: 404 }
      );
    }

    // Validate all bills are from the same contract
    const uniqueContractIds = [...new Set(bills.map((bill: any) => bill.contractId))];
    if (uniqueContractIds.length > 1) {
      return NextResponse.json(
        { 
          error: 'Invalid bill selection',
          details: 'All bills must be from the same contract. Please select bills from only one contract.' 
        },
        { status: 400 }
      );
    }
    
    // Get all required indices for all bills.
    //
    // One query for the union of every bill's range, split per bill in memory. This was
    // a range query per bill — each pulling every index value from that bill's base
    // month to its measurement month with the price index joined — so a thirty-bill
    // report ran thirty wide scans over the largest table for spans that overlap almost
    // entirely. Bills of one contract share a base month, so the overlap is nearly total.
    const billRanges = bills.map((bill: any) => {
      const baseMonthDate = bill.contract.baseMonth
        ? new Date(bill.contract.baseMonth)
        : addMonths(new Date(bill.contract.dateOfOpening), -1);
      const measurementDate = new Date(bill.dateOfMeasurement);
      // End of the measurement month, so the measurement month itself is included.
      const measurementMonthEnd = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);
      return {
        billId: bill.id,
        baseMonthDate,
        measurementDate,
        from: startOfMonth(baseMonthDate),
        to: startOfMonth(measurementMonthEnd),
      };
    });

    const allIndicesData = new Map();
    if (billRanges.length > 0) {
      const from = new Date(Math.min(...billRanges.map((r: any) => r.from.getTime())));
      const to = new Date(Math.max(...billRanges.map((r: any) => r.to.getTime())));
      const everyValueInRange = await prisma.monthlyIndexValue.findMany({
        where: { month: { gte: from, lte: to } },
        include: { priceIndex: true },
        orderBy: { month: 'asc' },
      });

      for (const range of billRanges) {
        allIndicesData.set(range.billId, {
          // Already sorted by month, so each bill's slice keeps the order it had.
          indices: everyValueInRange.filter(v => v.month >= range.from && v.month <= range.to),
          baseMonth: range.baseMonthDate,
          measurementDate: range.measurementDate,
        });
      }
    }

    // Helper function to calculate bill PVC from per-entry data (DB values - used as fallback)
    const calculateBillPvcFromEntries = (bill: any): number => {
      let classificationPvcTotal = 0;
      
      if (bill.classificationEntries && bill.classificationEntries.length > 0) {
        classificationPvcTotal = bill.classificationEntries.reduce((sum: number, entry: any) => {
          return sum + (entry.totalPvc || 0);
        }, 0);
      }
      
      if (classificationPvcTotal === 0) {
        classificationPvcTotal = 
          (bill.pvcCalculation?.labourPvc || 0) +
          (bill.pvcCalculation?.plantMachineryPvc || 0) +
          (bill.pvcCalculation?.fuelPowerPvc || 0) +
          (bill.pvcCalculation?.otherMaterialsPvc || 0) +
          (bill.pvcCalculation?.cementPvc || 0) +
          (bill.pvcCalculation?.steelPvc || 0) +
          (bill.pvcCalculation?.explosivesPvc || 0);
      }
      
      const dedicatedCementPvc = bill.pvcCalculation?.dedicatedCementPvc || 0;
      const dedicatedSteelPvc = 
        (bill.pvcCalculation?.dedicatedSteelTmtBarsPvc || 0) +
        (bill.pvcCalculation?.dedicatedSteelAngleChannelPvc || 0) +
        (bill.pvcCalculation?.dedicatedSteelPlatesPvc || 0) +
        (bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc || 0);
      
      return classificationPvcTotal + dedicatedCementPvc + dedicatedSteelPvc;
    };

    // Pre-compute correct PVC totals for each bill from indices (not stale DB values)
    // This mirrors the per-classification calculation done later in the PDF but stores results for overview tables
    const precomputedBillPvc = new Map<string, number>();
    
    const getIndicesNamesForBill = (billZone?: string | null, billFuelPriceType?: string | null) => {
      const steelNames = getSteelIndexNamesForZone(billZone);
      const fuelName = getFuelIndexNameForBill(billZone, billFuelPriceType);
      return [
        'Labour', 'RBI Plant Machinery', fuelName, 'RBI Other Materials',
        'RBI Cement', 'RBI Explosives',
        ...steelNames
      ];
    };
    const steelTypeMapForPrecompute: { [key: string]: string } = {
      'TMT': 'Steel TMT Bars',
      'ANGLE_CHANNEL': 'Steel Angle/Channel',
      'PLATES': 'Steel Plates',
      'OTHER_SECTIONS': 'Steel Other Sections'
    };
    const allSteelIndexNamesPrecompute = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    
    for (const bill of bills) {
      const billIndices = allIndicesData.get(bill.id);
      if (!billIndices || !bill.pvcCalculation || !bill.classificationEntries) {
        precomputedBillPvc.set(bill.id, calculateBillPvcFromEntries(bill));
        continue;
      }
      
      const { indices, baseMonth: bm } = billIndices;
      
      // Build base index data using per-bill indices (zone-aware)
      const billSpecificIndices = getIndicesNamesForBill(bill.zone, bill.fuelPriceType);
      const baseIdxData: { [key: string]: number } = {};
      for (const idxName of billSpecificIndices) {
        const baseEntry = indices.find((idx: any) => 
          format(new Date(idx.month), 'MMM-yyyy') === format(bm, 'MMM-yyyy') &&
          idx.priceIndex.name === idxName
        );
        if (baseEntry) baseIdxData[idxName] = baseEntry.value;
      }
      
      // Get quarterly averages
      let qAvgIndices: { [key: string]: number } = {};
      try {
        const qAvgs = await quarterlyAverages(bill.quarter, billSpecificIndices, bill.contract.baseMonth, 'auto');
        for (const avg of qAvgs) {
          qAvgIndices[avg.indexName] = avg.average;
        }
      } catch {
        // If quarterly averages fail, fall back to DB-stored values
        precomputedBillPvc.set(bill.id, calculateBillPvcFromEntries(bill));
        continue;
      }
      
      // Determine the actual fuel index name for this bill
      const billFuelIndexName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
      
      let totalClassificationPvc = 0;
      
      for (const entry of bill.classificationEntries) {
        const entryAmount = parseFloat(String(entry.amount)) || 0;
        if (entryAmount <= 0) continue;
        
        const classComp = (entry as any).subClassification || (entry as any).classification;
        if (!classComp) continue;
        
        const components = [
          { key: 'labour', percent: classComp.labour || 0 },
          { key: 'plantMachinery', percent: classComp.plantMachinery || 0 },
          { key: 'fuel', percent: classComp.fuel || 0 },
          { key: 'otherMaterials', percent: classComp.otherMaterials || 0 },
          { key: 'cement', percent: classComp.cement || 0 },
          { key: 'steel', percent: classComp.steel || 0 },
          { key: 'explosives', percent: classComp.explosives || 0 }
        ];
        
        // Use per-bill fuel index name (zone-aware)
        const compIndexMap: {[k: string]: string} = {
          'labour': 'Labour', 'plantMachinery': 'RBI Plant Machinery',
          'fuel': billFuelIndexName, 'otherMaterials': 'RBI Other Materials',
          'cement': 'RBI Cement', 'explosives': 'RBI Explosives'
        };
        
        for (const comp of components) {
          if (comp.percent <= 0) continue;
          
          if (comp.key === 'steel') {
            // Average selected steel types
            let steelNames = allSteelIndexNamesPrecompute;
            if (bill.steelTypes && Array.isArray(bill.steelTypes) && bill.steelTypes.length > 0) {
              steelNames = (bill.steelTypes as string[])
                .map((t: string) => steelTypeMapForPrecompute[t])
                .filter((n: string) => !!n);
            }
            const baseVals = steelNames.map((n: string) => baseIdxData[n]).filter((v: number) => v && v > 0);
            const curVals = steelNames.map((n: string) => qAvgIndices[n]).filter((v: number) => v && v > 0);
            const steelBase = baseVals.length > 0 ? baseVals.reduce((s: number, v: number) => s + v, 0) / baseVals.length : 0;
            const steelCur = curVals.length > 0 ? curVals.reduce((s: number, v: number) => s + v, 0) / curVals.length : 0;
            if (steelBase > 0 && steelCur > 0) {
              const step1 = Math.round((steelCur - steelBase) * 100) / 100;
              totalClassificationPvc += (entryAmount * step1 * (comp.percent / 100)) / steelBase;
            }
          } else {
            const idxName = compIndexMap[comp.key];
            if (!idxName) continue;
            const baseIdx = baseIdxData[idxName] || 0;
            const curIdx = qAvgIndices[idxName] || 0;
            if (baseIdx > 0 && curIdx > 0) {
              const step1 = Math.round((curIdx - baseIdx) * 100) / 100;
              totalClassificationPvc += (entryAmount * step1 * (comp.percent / 100)) / baseIdx;
            }
          }
        }
      }
      
      // Add dedicated cement/steel PVC
      const dedCement = bill.pvcCalculation.dedicatedCementPvc || 0;
      const dedSteel = 
        (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0) +
        (bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0) +
        (bill.pvcCalculation.dedicatedSteelPlatesPvc || 0) +
        (bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0);
      
      precomputedBillPvc.set(bill.id, totalClassificationPvc + dedCement + dedSteel);
    }
    
    // Helper to get precomputed PVC for a bill (falls back to DB-based calculation)
    const getBillPvc = (bill: any): number => {
      return precomputedBillPvc.get(bill.id) ?? calculateBillPvcFromEntries(bill);
    };

    // ── IR STANDARD FORMAT BRANCH (bulk) ─────────────────────────────────────
    if (pdfFormat === 'ir_standard') {
      const { generateIRStandardReport } = await import('@/lib/pdf/generators/ir-standard-report');
      const { PDFDocument } = await import('pdf-lib');
      const { getBillIndicesStatus, relevantIndexNamesForBill } = await import('@/lib/index-status');
      const { getSteelIndexNamesForZone: getSteelNames, getFuelIndexNameForBill: getFuelName } = await import('@/lib/zone-steel-city-mapping');

      // Fetch branding for the contract owner of the first bill
      let irOrgName = 'INDIAN RAILWAYS';
      if (bills.length > 0 && bills[0].contract?.userId) {
        const brandUser = await prisma.user.findUnique({
          where: { id: bills[0].contract.userId },
          select: { reportHeaderText: true },
        });
        if (brandUser?.reportHeaderText) irOrgName = brandUser.reportHeaderText;
      }

      // The single-bill route loads the owner's default report template and lets it
      // hide sections and the calculation steps; this branch never did, so a bulk run
      // of the very same bills came out with every section shown regardless of the
      // template — the two reports differed by whatever the template hides.
      let irSections: {
        contractDetails?: boolean;
        workClassification?: boolean;
        monthlyIndices?: boolean;
        showCalculationSteps?: boolean;
      } | undefined;
      if (bills.length > 0 && bills[0].contract?.userId) {
        const template = await prisma.reportTemplate.findFirst({
          where: { userId: bills[0].contract.userId, isDefault: true },
        });
        if (template) {
          const sections = (template.sections || {}) as any;
          const fields = (template.fields || {}) as any;
          irSections = {
            contractDetails: sections?.contractDetails,
            workClassification: sections?.workClassification,
            monthlyIndices: sections?.monthlyIndices,
            showCalculationSteps: fields?.pvcCalculation?.showCalculationSteps,
          };
        }
      }

      const mergedPdf = await PDFDocument.create();

      const allContractBillsForCumulative = await prisma.bill.findMany({
        where: { contractId: uniqueContractIds[0] },
        select: {
          id: true,
          contractId: true,
          billNo: true,
          dateOfMeasurement: true,
          createdAt: true,
          pvcCalculation: { select: { totalPvc: true } },
        },
      });
      const cumulativeSummaries = buildCumulativePvcSummaries(allContractBillsForCumulative);
      const irBills = [...bills].sort(compareBillsChronologically);

      // Row rectangles (mm) on the summary page + each bill's start page, so the summary
      // rows can be turned into clickable links that jump to the bill.
      const summaryRowRects: Array<{ page: number; yTop: number; h: number } | undefined> = [];
      const billPageStartIndex: number[] = [];

      // ── Summary page (page 1): PVC amount per bill + batch total ──
      {
        const sPdf = new jsPDF('l', 'mm', 'a4');
        const sW = sPdf.internal.pageSize.getWidth();
        sPdf.setFont('helvetica', 'bold'); sPdf.setFontSize(14);
        sPdf.text(irOrgName, sW / 2, 16, { align: 'center' });
        sPdf.setFontSize(12);
        sPdf.text('PRICE VARIATION (PVC) - COMBINED SUMMARY', sW / 2, 23, { align: 'center' });
        sPdf.setFont('helvetica', 'normal'); sPdf.setFontSize(9);
        sPdf.text(`${irBills.length} bill(s)  ·  Agreement: ${bills[0]?.contract?.agreementNo || '-'}`, sW / 2, 29, { align: 'center' });

        // Cumulative = running total of this batch's PVC amounts (chronological order), so
        // the last row's cumulative equals the batch TOTAL. (The stored per-bill cumulative
        // is inconsistent across bills, which made this column jump around before.)
        let runningCum = 0;
        let grossTotalSum = 0;
        const money = (n: number) => 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const rows: any[] = irBills.map((b, i) => {
          // Use the stored total PVC (what the individual bill statement shows), not the
          // recomputed value, so the batch total matches the bills.
          const pvc = Number(b.pvcCalculation?.totalPvc ?? 0) || getBillPvc(b);
          const gross = Number(b.grossBillAmount ?? b.billAmount ?? 0);
          runningCum += pvc;
          grossTotalSum += gross;
          return [
            i + 1,
            b.billNo || '-',
            format(new Date(b.dateOfMeasurement), 'dd MMM yyyy'),
            b.quarter || '-',
            money(gross),
            money(pvc),
            money(runningCum),
          ];
        });
        const grandTotal = runningCum;
        rows.push([
          { content: 'TOTAL (this batch)', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: money(grossTotalSum), styles: { fontStyle: 'bold', halign: 'right' } },
          { content: money(grandTotal), styles: { fontStyle: 'bold', halign: 'right' } },
          '',
        ]);
        autoTable(sPdf, {
          startY: 35,
          head: [['Sl.', 'Bill No.', 'Date of Measurement', 'Quarter', 'Gross Bill Amount (Rs.)', 'PVC Amount (Rs.)', 'Cumulative PVC (Rs.)']],
          body: rows,
          theme: 'grid',
          headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
          bodyStyles: { fontSize: 9, cellPadding: 2 },
          columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
          margin: { left: 14, right: 14 },
          didDrawCell: (data: any) => {
            // Capture each body row's rectangle (from column 0) for the clickable links.
            if (data.section === 'body' && data.column.index === 0 && data.row.index < irBills.length) {
              summaryRowRects[data.row.index] = { page: data.pageNumber, yTop: data.cell.y, h: data.cell.height };
            }
          },
        });
        const summaryBytes = new Uint8Array(sPdf.output('arraybuffer'));
        const summaryDoc = await PDFDocument.load(summaryBytes);
        const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryDoc.getPageIndices());
        for (const p of summaryPages) mergedPdf.addPage(p);
      }

      // Fetched once for the whole batch. Lets each report reconstruct the cement
      // working for bills saved before the derivation was kept on the item row.
      const cementCoefficients = await prisma.dsrCementCoefficient.findMany({
        select: { dsrCode: true, workUnit: true, cementQuantityPerUnit: true },
      }).catch(() => []);

      for (const bill of irBills) {
        const baseMonth = new Date(bill.contract.baseMonth);
        const fuelIdxName = getFuelName(bill.zone, bill.fuelPriceType);
        const steelIdxNames = getSteelNames(bill.zone);
        const allIdxNames = ['Labour', 'RBI Plant Machinery', fuelIdxName, 'RBI Other Materials', 'RBI Cement', 'RBI Explosives', ...steelIdxNames];
        const qaverages = await quarterlyAverages(bill.quarter, allIdxNames, baseMonth, 'auto');
        const indicesStatus = await getBillIndicesStatus(
          bill.quarter, baseMonth, relevantIndexNamesForBill(bill.zone, bill.fuelPriceType));

        const bulkQtrMonths = getQuarterMonths(bill.quarter, baseMonth);
        const bulkQtrEnd = bulkQtrMonths[bulkQtrMonths.length - 1];
        const bulkQtrEndDate = new Date(bulkQtrEnd.getFullYear(), bulkQtrEnd.getMonth() + 1, 1);
        const bulkPriceIndexes = await prisma.priceIndex.findMany({ where: { name: { in: allIdxNames } } });
        const bulkHistoricalRaw = await prisma.monthlyIndexValue.findMany({
          where: {
            priceIndexId: { in: bulkPriceIndexes.map((p: any) => p.id) },
            month: { gte: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1), lt: bulkQtrEndDate }
          },
          include: { priceIndex: true }
        });
        const allHistoricalMonthlyData = bulkHistoricalRaw.map((mv: any) => ({
          indexName: mv.priceIndex.name,
          month: new Date(mv.month).toISOString().slice(0, 7),
          value: mv.value
        }));

        // Per-item JPC steel readings (fortnightly F1/F2 per size) for this bill's steel
        // city, which the report turns into the AVERAGE JPC STEEL INDICES page showing how
        // each section's monthly index is derived. The single-bill route has always built
        // this; the bulk route did not, so a batch download simply lost that page.
        let steelBreakdown: any[] | undefined;
        try {
          const { buildSteelBreakdown } = await import('@/lib/jpc-items');
          const jpcRows = await prisma.jpcSteelItem.findMany({
            where: {
              city: getSteelCityForZone(bill.zone),
              month: { gte: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1), lt: bulkQtrEndDate },
            },
            select: { month: true, itemCode: true, f1: true, f2: true, average: true },
          });
          if (jpcRows.length > 0) {
            const itemsByMonth = new Map<string, Map<string, { f1: number | null; f2: number | null; average: number | null }>>();
            for (const row of jpcRows) {
              const monthKey = new Date(row.month).toISOString().slice(0, 7);
              if (!itemsByMonth.has(monthKey)) itemsByMonth.set(monthKey, new Map());
              itemsByMonth.get(monthKey)!.set(row.itemCode, { f1: row.f1, f2: row.f2, average: row.average });
            }
            steelBreakdown = buildSteelBreakdown(steelIdxNames, itemsByMonth);
          }
        } catch (err) {
          console.error('Bulk IR PDF: error building steel breakdown:', err);
        }

        const billPdfBuf = await generateIRStandardReport({
          cementCoefficients,
          steelBreakdown,
          bill: bill as any,
          quarterlyAverages: qaverages,
          baseMonth,
          organizationName: irOrgName,
          fuelIndexName: fuelIdxName,
          steelIndexNames: steelIdxNames,
          isProvisional: indicesStatus.isProvisional,
          provisionalIndices: indicesStatus.provisionalIndices,
          allHistoricalMonthlyData,
          previousCumulativePvc: cumulativeSummaries.get(bill.id)?.previousPvcTotal ?? 0,
          sections: irSections,
        });

        const billPdfDoc = await PDFDocument.load(billPdfBuf);
        const copiedPages = await mergedPdf.copyPages(billPdfDoc, billPdfDoc.getPageIndices());
        billPageStartIndex.push(mergedPdf.getPageCount()); // first page of this bill
        for (const page of copiedPages) mergedPdf.addPage(page);
      }

      let mergedBytes = new Uint8Array(await mergedPdf.save());

      // The abstract goes after the statements it summarises.
      if (includeAbstract) {
        const appended = await appendContractAbstract(mergedBytes, uniqueContractIds as string[]);
        mergedBytes = appended.bytes;
        abstractStatus = appended.status;
      }

      // Append component index documents to the combined IR report.
      // The IR branch returns early, so it must perform the same embedding
      // that the detailed format performs at the end of this route.
      const firstBill = bills[0];
      const componentIndexStartDate = bills.reduce((earliest, bill) => {
        const baseMonth = bill.contract.baseMonth
          ? new Date(bill.contract.baseMonth)
          : addMonths(new Date(bill.contract.dateOfOpening), -1);
        return baseMonth < earliest ? baseMonth : earliest;
      }, firstBill.contract.baseMonth
        ? new Date(firstBill.contract.baseMonth)
        : addMonths(new Date(firstBill.contract.dateOfOpening), -1));

      const componentIndexEndDate = bills.reduce((latest, bill) => {
        const measurementDate = new Date(bill.dateOfMeasurement);
        return measurementDate > latest ? measurementDate : latest;
      }, new Date(firstBill.dateOfMeasurement));

      let irFinalBytes = mergedBytes;
      if (includeIndexDocs) {
        try {
          const componentTypes = anyBillHasSteel(bills) ? undefined : NON_STEEL_COMPONENT_TYPES;
          // One JPC sheet serves the whole batch, so its marks must be true for every
          // bill in it: marked only when all bills read the same city, left plain when
          // zones differ — a box on another zone's column would be a false statement.
          const irJpcCities = new Set(bills.map((b: any) => getSteelCityForZone(b.zone)));
          irFinalBytes = await embedComponentIndicesRange(mergedBytes, {
            startDate: componentIndexStartDate,
            endDate: componentIndexEndDate,
            componentTypes,
            jpcCity: irJpcCities.size === 1 ? [...irJpcCities][0] : undefined,
            jpcCaption: `${firstBill.contract.agreementNo} — ${bills.length} bill(s)`,
          });
        } catch (error) {
          console.error('Bulk IR PDF: error embedding component index documents:', error);
        }
      }

      // Make each summary row a clickable link that jumps to that bill's first page.
      try {
        const { PDFDocument: PDFDoc2, PDFName: PDFName2 } = await import('pdf-lib');
        const linked = await PDFDoc2.load(irFinalBytes);
        const p0 = linked.getPage(0);
        const kmm = 72 / 25.4;               // mm -> PDF points
        const pageHpt = p0.getHeight();
        const x1 = 14 * kmm, x2 = (297 - 14) * kmm; // A4 landscape width 297mm, 14mm margins
        for (let i = 0; i < irBills.length; i++) {
          const rect = summaryRowRects[i];
          const tgt = billPageStartIndex[i];
          if (!rect || rect.page !== 1 || tgt == null || tgt >= linked.getPageCount()) continue;
          const yTop = pageHpt - rect.yTop * kmm;
          const yBot = pageHpt - (rect.yTop + rect.h) * kmm;
          const annot = linked.context.obj({
            Type: 'Annot', Subtype: 'Link',
            Rect: [x1, yBot, x2, yTop],
            Border: [0, 0, 0],
            Dest: [linked.getPage(tgt).ref, PDFName2.of('Fit')],
          });
          const ref = linked.context.register(annot);
          const existing = p0.node.Annots();
          if (existing) existing.push(ref);
          else p0.node.set(PDFName2.of('Annots'), linked.context.obj([ref]));
        }
        irFinalBytes = new Uint8Array(await linked.save());
      } catch (e) {
        console.error('Bulk IR PDF: could not add summary links:', e);
      }

      const mergedBuffer = Buffer.from(irFinalBytes);

      return new Response(mergedBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="IR_PVC_Statements_${bills.length}_Bills_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf"`,
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-Abstract-Status': abstractStatus,
        },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Create PDF in A3 Landscape format with proper margins
    const pdf = new jsPDF('l', 'mm', 'a3'); // 'l' for landscape, 'a3' for A3 size
    
    // Apply autoTable to the PDF instance
    pdf.autoTable = (options: any) => {
      autoTable(pdf, options);
      pdf.lastAutoTable = { finalY: (pdf as any).lastAutoTable?.finalY || 0 };
      return pdf;
    };

    const pageWidth = pdf.internal.pageSize.getWidth(); // 420mm for A3 landscape
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm for A3 landscape
    const marginTop = 20; // Increased top margin for better spacing
    const marginBottom = 15; // Space for page number
    const marginLeft = 12;
    const marginRight = 12;
    const contentWidth = pageWidth - marginLeft - marginRight; // 396mm content width
    let yPosition = marginTop;

    // Get session to fetch user branding settings
    const session = await getServerSession(authOptions);
    let brandingSettings = {
      logoPath: null as string | null,
      logoUrl: null as string | null,
      reportHeaderText: 'INDIAN RAILWAY',
      reportHeaderColor: '#000000',
      reportFooterText: '',
      showLogoInReports: true,
    };
    
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          logoPath: true,
          reportHeaderText: true,
          reportHeaderColor: true,
          reportFooterText: true,
          showLogoInReports: true,
        },
      });

      if (user) {
        brandingSettings = {
          logoPath: user.logoPath,
          logoUrl: null,
          reportHeaderText: user.reportHeaderText || 'INDIAN RAILWAY',
          reportHeaderColor: user.reportHeaderColor || '#000000',
          reportFooterText: user.reportFooterText || '',
          showLogoInReports: user.showLogoInReports,
        };

        // Generate signed URL for logo if it exists
        if (user.logoPath && user.showLogoInReports) {
          try {
            brandingSettings.logoUrl = await getFileUrl(user.logoPath, 3600);
          } catch (error) {
            console.error('Error generating logo URL:', error);
          }
        }
      }
    }

    // Override with first bill's contract owner's branding if different from session user
    if (bills.length > 0 && bills[0].contract.userId) {
      const contractUser = await prisma.user.findUnique({
        where: { id: bills[0].contract.userId },
        select: {
          logoPath: true,
          reportHeaderText: true,
          reportHeaderColor: true,
          reportFooterText: true,
          showLogoInReports: true,
        }
      });
      
      if (contractUser) {
        brandingSettings = {
          logoPath: contractUser.logoPath,
          logoUrl: null,
          reportHeaderText: contractUser.reportHeaderText || 'INDIAN RAILWAY',
          reportHeaderColor: contractUser.reportHeaderColor || '#000000',
          reportFooterText: contractUser.reportFooterText || '',
          showLogoInReports: contractUser.showLogoInReports,
        };

        // Generate signed URL for logo if it exists
        if (contractUser.logoPath && contractUser.showLogoInReports) {
          try {
            brandingSettings.logoUrl = await getFileUrl(contractUser.logoPath, 3600);
          } catch (error) {
            console.error('Error generating logo URL:', error);
          }
        }
      }
    }

    // Helper function to check if we need a new page
    const checkNewPage = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - marginBottom) {
        pdf.addPage();
        yPosition = marginTop;
        return true;
      }
      return false;
    };

    // Header with Logo and Branding - Add extra space above
    let headerYStart = 20;
    
    // Add logo if enabled and available
    if (brandingSettings.showLogoInReports && brandingSettings.logoUrl) {
      try {
        // Fetch logo image (5s timeout so a slow storage URL can't stall report generation)
        const logoResponse = await fetch(brandingSettings.logoUrl, { signal: AbortSignal.timeout(5000) });
        const logoBlob = await logoResponse.arrayBuffer();
        const logoBase64 = Buffer.from(logoBlob).toString('base64');
        const logoDataUrl = `data:image/png;base64,${logoBase64}`;
        
        // Add logo centered at top
        const logoWidth = 60;
        const logoHeight = 24;
        const logoX = marginLeft + (contentWidth / 2) - (logoWidth / 2);
        pdf.addImage(logoDataUrl, 'PNG', logoX, headerYStart, logoWidth, logoHeight);
        headerYStart += logoHeight + 4;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
      }
    }
    
    // Title and Header with custom branding
    pdf.setTextColor(0, 0, 0); // Black text for all content
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(brandingSettings.reportHeaderText, marginLeft + (contentWidth / 2), headerYStart, { align: 'center' });
    
    headerYStart += 6;
    pdf.setFontSize(16);
    pdf.text("BULK PVC REPORTS - CONSOLIDATED ANALYSIS", marginLeft + (contentWidth / 2), headerYStart, { align: 'center' });

    // Add simple separator line
    headerYStart += 3;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(marginLeft, headerYStart, pageWidth - marginRight, headerYStart);

    // Set yPosition after header with proper spacing
    yPosition = headerYStart + 8;

    // CONTRACT INFORMATION SECTION
    // ============================================================================
    checkNewPage(150);
    
    // Get the first contract info for display (all bills are from same contract)
    const firstContract = bills[0].contract;
    const firstBaseMonth = firstContract.baseMonth ? new Date(firstContract.baseMonth) : addMonths(new Date(firstContract.dateOfOpening), -1);
    
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("CONTRACT INFORMATION", marginLeft, yPosition);
    
    // Underline the section header
    const contractInfoTitle = "CONTRACT INFORMATION";
    const contractInfoWidth = pdf.getTextWidth(contractInfoTitle);
    pdf.setLineWidth(0.8);
    pdf.line(marginLeft, yPosition + 2, marginLeft + contractInfoWidth, yPosition + 2);
    yPosition += 14;
    
    // Two-column layout for contract information with proper spacing
    const columnGap = 20; // Gap between two columns
    const singleColumnWidth = (contentWidth - columnGap) / 2; // ~188mm per column
    
    // Column 1 measurements
    const col1LabelWidth = singleColumnWidth * 0.40; // 40% for label
    const col1ValueWidth = singleColumnWidth * 0.60; // 60% for value
    const col1LabelX = marginLeft; // Start of column 1
    const col1ValueX = col1LabelX + col1LabelWidth; // Start of column 1 values
    
    // Column 2 measurements
    const col2LabelX = marginLeft + singleColumnWidth + columnGap; // Start of column 2
    const col2LabelWidth = singleColumnWidth * 0.40; // 40% for label
    const col2ValueWidth = singleColumnWidth * 0.60; // 60% for value
    const col2ValueX = col2LabelX + col2LabelWidth; // Start of column 2 values
    
    // First row: Agreement No & Date of Opening
    pdf.setFont("helvetica", "bold");
    pdf.text("Agreement No:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const agreementText = pdf.splitTextToSize(firstContract.agreementNo, col1ValueWidth);
    pdf.text(agreementText, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Date of Opening:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const dateOfOpeningText = pdf.splitTextToSize(format(new Date(firstContract.dateOfOpening), 'dd MMM yyyy'), col2ValueWidth);
    pdf.text(dateOfOpeningText, col2ValueX, yPosition);
    
    yPosition += Math.max(8, agreementText.length * 6, dateOfOpeningText.length * 6);
    
    // Second row: Contractor & Base Month
    pdf.setFont("helvetica", "bold");
    pdf.text("Contractor:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const contractorText = pdf.splitTextToSize(firstContract.contractorName, col1ValueWidth);
    pdf.text(contractorText, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Base Month:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const baseMonthText = pdf.splitTextToSize(format(firstBaseMonth, 'MMM yyyy'), col2ValueWidth);
    pdf.text(baseMonthText, col2ValueX, yPosition);
    
    yPosition += Math.max(8, contractorText.length * 6, baseMonthText.length * 6);
    
    // Third row: Railway Zone & Fuel Pricing Type
    pdf.setFont("helvetica", "bold");
    pdf.text("Railway Zone:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const firstBill = bills[0];
    const zoneTextVal = firstBill?.zone || 'N/A';
    pdf.text(zoneTextVal, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Fuel Pricing Type:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const fuelPricingText = firstBill?.fuelPriceType === 'zone_city'
      ? 'Zone-Specific City Price'
      : 'Four-City Average';
    pdf.text(fuelPricingText, col2ValueX, yPosition);
    
    yPosition += 8;
    
    // Fourth row: Contract Value & Completion Period
    pdf.setFont("helvetica", "bold");
    pdf.text("Contract Value:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const contractValueText = firstContract.contractValue 
      ? `${firstContract.contractValue.toLocaleString('en-IN')}` 
      : 'N/A';
    pdf.text(contractValueText, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Completion Period:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const periodText = firstContract.completionPeriodMonths 
      ? `${firstContract.completionPeriodMonths} Months` 
      : 'N/A';
    pdf.text(periodText, col2ValueX, yPosition);
    
    yPosition += 8;
    
    // Fifth row: Railway Supplied Materials & Tender Value
    pdf.setFont("helvetica", "bold");
    pdf.text("Railway Materials:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const materialsText = firstContract.hasRailwaySuppliedMaterials ? 'Yes (Excluded from PVC)' : 'No (Supplied by Contractor)';
    pdf.text(materialsText, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Tender Value:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const tenderValText = firstContract.tenderAdvertisedValue 
      ? `${firstContract.tenderAdvertisedValue.toLocaleString('en-IN')}` 
      : 'N/A';
    pdf.text(tenderValText, col2ValueX, yPosition);
    
    yPosition += 8;
    
    // LOA details (if LOA exists)
    if (firstContract.loaNo) {
      pdf.setFont("helvetica", "bold");
      pdf.text("LOA Details:", col1LabelX, yPosition);
      pdf.setFont("helvetica", "normal");
      
      const loaDateFormatted = firstContract.loaDate 
        ? ` dated ${format(new Date(firstContract.loaDate), 'dd MMM yyyy')}` 
        : '';
      const loaFullText = `${firstContract.loaNo}${loaDateFormatted}`;
      const loaText = pdf.splitTextToSize(loaFullText, contentWidth - col1LabelWidth - 5);
      pdf.text(loaText, col1ValueX, yPosition);
      yPosition += Math.max(8, loaText.length * 6);
    }
    
    // Extension Details (if contract is extended)
    if (firstContract.isExtended) {
      // Original Completion Date and Extended Completion Date on same row
      if (firstContract.originalCompletionDate) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Original Completion:", col1LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        pdf.text(format(new Date(firstContract.originalCompletionDate), 'dd MMM yyyy'), col1ValueX, yPosition);
      }
      
      if (firstContract.currentCompletionDate) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Extended Completion:", col2LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        pdf.text(format(new Date(firstContract.currentCompletionDate), 'dd MMM yyyy'), col2ValueX, yPosition);
      }
      
      yPosition += 8;
      
      // Extension Type
      if (firstContract.extensionType) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Extension Type:", col1LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        const extensionTypeText = firstContract.extensionType === '17A' 
          ? 'GCC 17A (Without LD)' 
          : firstContract.extensionType === '17B'
          ? 'GCC 17B (With LD)'
          : firstContract.extensionType;
        pdf.text(extensionTypeText, col1ValueX, yPosition);
        yPosition += 8;
      }
      
      // Extension Reason
      if (firstContract.extensionReason) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Extension Reason:", col1LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        const reasonLines = pdf.splitTextToSize(firstContract.extensionReason, contentWidth - col1LabelWidth - 10);
        pdf.text(reasonLines, col1ValueX, yPosition);
        yPosition += reasonLines.length * 6 + 3;
      }
    }
    
    // Work Description
    pdf.setFont("helvetica", "bold");
    pdf.text("Work Description:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const workDescLines = pdf.splitTextToSize(firstContract.workDescription, contentWidth - col1LabelWidth - 10);
    pdf.text(workDescLines, col1ValueX, yPosition);
    yPosition += workDescLines.length * 6 + 12;
    
    // Extension Information (if any)
    const extensions = (firstContract as any).extensions || [];
    if (extensions.length > 0) {
      checkNewPage(40 + extensions.length * 30);
      
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("EXTENSION DETAILS", marginLeft, yPosition);
      const extTitle = "EXTENSION DETAILS";
      const extTitleWidth = pdf.getTextWidth(extTitle);
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(0, 0, 0);
      pdf.line(marginLeft, yPosition + 2, marginLeft + extTitleWidth, yPosition + 2);
      yPosition += 10;

      const extensionTableData = extensions.map((ext: any, idx: number) => {
        const extType = ext.extensionType === 'EOT_5B' ? 'EOT (Cl. 5B)' 
          : ext.extensionType === 'EOT_5C' ? 'EOT (Cl. 5C)' 
          : ext.extensionType === 'RESCHEDULE' ? 'Reschedule'
          : ext.extensionType || 'â€”';
        
        return [
          idx + 1,
          extType,
          format(new Date(ext.originalCompletionDate), 'dd MMM yyyy'),
          format(new Date(ext.extendedCompletionDate), 'dd MMM yyyy'),
          `${ext.extensionDuration} days`,
          ext.isPvcRestricted ? 'Yes' : 'No',
          ext.orderNumber || 'â€”'
        ];
      });

      pdf.autoTable({
        startY: yPosition,
        head: [['#', 'Type', 'Original Completion', 'Extended Completion', 'Duration', 'PVC Restricted', 'Order No.']],
        body: extensionTableData,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.3 },
        headStyles: { fillColor: [63, 81, 181], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: contentWidth * 0.15, halign: 'center' },
          2: { cellWidth: contentWidth * 0.17, halign: 'center' },
          3: { cellWidth: contentWidth * 0.17, halign: 'center' },
          4: { cellWidth: contentWidth * 0.12, halign: 'center' },
          5: { cellWidth: contentWidth * 0.12, halign: 'center' },
          6: { halign: 'center' }
        },
        margin: { left: marginLeft, right: marginRight }
      });
      
      yPosition = pdf.lastAutoTable.finalY + 12;
    }
    
    // Add thin separator line
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
    yPosition += 10;
    
    // Bills PVC Numbers Section
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("BILLS PVC SUMMARY", marginLeft, yPosition);
    
    const billsPvcSummaryTitle = "BILLS PVC SUMMARY";
    const billsPvcSummaryWidth = pdf.getTextWidth(billsPvcSummaryTitle);
    pdf.setLineWidth(0.5);
    pdf.line(marginLeft, yPosition + 2, marginLeft + billsPvcSummaryWidth, yPosition + 2);
    yPosition += 12;
    
    // Create table data for all bills with their PVC numbers
    const billsPvcTableData = bills.map((bill, index) => {
      const calculatedTotal = getBillPvc(bill);
      
      return [
        index + 1,
        bill.billNo,
        bill.pvcNumber || 'â€”',
        format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy'),
        bill.quarter || 'â€”',
        calculatedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
      ];
    });
    
    // Add total row
    const contractTotalPvc = bills.reduce((sum, bill) => {
      return sum + getBillPvc(bill);
    }, 0);
    
    billsPvcTableData.push([
      { content: 'TOTAL', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] } } as any,
      { content: contractTotalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } } as any
    ] as any);
    
    pdf.autoTable({
      startY: yPosition,
      head: [['S.No.', 'Bill Number', 'PVC Number', 'Measurement Date', 'Quarter', 'Total PVC Amount']],
      body: billsPvcTableData,
      theme: 'grid',
      headStyles: { 
        fontStyle: 'bold',
        fontSize: 11,
        halign: 'center',
        fillColor: [41, 128, 185]
      },
      styles: { 
        fontSize: 10, 
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.5
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: contentWidth,
      columnStyles: {
        0: { cellWidth: contentWidth * 0.08, halign: 'center' },
        1: { cellWidth: contentWidth * 0.22, halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: contentWidth * 0.18, halign: 'center' },
        3: { cellWidth: contentWidth * 0.16, halign: 'center' },
        4: { cellWidth: contentWidth * 0.12, halign: 'center' },
        5: { cellWidth: contentWidth * 0.24, halign: 'right', fontStyle: 'bold' }
      }
    });
    
    yPosition = pdf.lastAutoTable.finalY + 15;
    // Get summary statistics
    const totalPvcAmount = bills.reduce((sum, bill) => sum + getBillPvc(bill), 0);
    const contractsCount = new Set(bills.map(b => b.contract.id)).size;

    // ============================================================================
    // BILL-WISE ABSTRACT TABLE
    // ============================================================================
    checkNewPage(60);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("SELECTED BILLS OVERVIEW", marginLeft, yPosition);
    
    // Underline the title
    const billsOverviewTitle = "SELECTED BILLS OVERVIEW";
    const billsOverviewTitleWidth = pdf.getTextWidth(billsOverviewTitle);
    pdf.line(marginLeft, yPosition + 2, marginLeft + billsOverviewTitleWidth, yPosition + 2);
    yPosition += 10;

    // Sort bills by measurement date for correct cumulative calculation
    const billsSortedByDate = [...bills].sort((a, b) => 
      new Date(a.dateOfMeasurement).getTime() - new Date(b.dateOfMeasurement).getTime()
    );
    
    // Compute running cumulative PVC on-the-fly (don't trust stale DB values)
    const cumulativePvcMap = new Map<string, number>();
    let runningCumulativePvc = 0;
    for (const bill of billsSortedByDate) {
      const billPvc = bill.pvcCalculation ? getBillPvc(bill) : 0;
      runningCumulativePvc += billPvc;
      cumulativePvcMap.set(bill.id, runningCumulativePvc);
    }
    
    const billsTableData = billsSortedByDate.map((bill: any) => {
      // Calculate quarter dynamically if not present or invalid
      let displayQuarter = bill.quarter;
      if (!displayQuarter || displayQuarter === 'null' || displayQuarter === 'undefined') {
        try {
          const baseMonthDate = bill.contract.baseMonth ? new Date(bill.contract.baseMonth) : addMonths(new Date(bill.contract.dateOfOpening), -1);
          const measurementDate = new Date(bill.dateOfMeasurement);
          displayQuarter = getQuarterFromDate(measurementDate, baseMonthDate);
        } catch (error) {
          console.error(`Error calculating quarter for bill ${bill.billNo}:`, error);
          displayQuarter = 'N/A';
        }
      }
      
      return [
        bill.billNo,
        format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy'),
        displayQuarter,
        bill.billAmount.toLocaleString('en-IN'),
        bill.pvcCalculation ? getBillPvc(bill).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'Not Calculated',
        bill.pvcCalculation ? (cumulativePvcMap.get(bill.id) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'
      ];
    });

    pdf.autoTable({
      startY: yPosition,
      head: [['Bill No.', 'Measurement Date', 'Quarter', 'Bill Amount', 'PVC Amount', 'Cumulative PVC']],
      body: billsTableData,
      theme: 'grid',
      headStyles: { 
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'center'
      },
      styles: { 
        fontSize: 9, 
        cellPadding: 3,
        lineColor: [0, 0, 0],
        lineWidth: 0.5
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: contentWidth,
      columnStyles: {
        0: { cellWidth: contentWidth * 0.16, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: contentWidth * 0.17, halign: 'center' },
        2: { cellWidth: contentWidth * 0.12, halign: 'center' },
        3: { cellWidth: contentWidth * 0.18, halign: 'right' },
        4: { cellWidth: contentWidth * 0.18, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: contentWidth * 0.19, halign: 'right', fontStyle: 'bold' }
      }
    });

    yPosition = pdf.lastAutoTable.finalY + 15;
    
    // Add thin separator line after BILLS OVERVIEW section
    pdf.setDrawColor(200, 200, 200); // Light gray
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
    yPosition += 8;

    // ============================================================================
    // CONSOLIDATED MONTHLY INDICES TABLE (shown once for all bills)
    // ============================================================================
    
    // Find the earliest base month and latest measurement date across all bills
    let earliestBaseMonth: Date | null = null;
    let latestMeasurementDate: Date | null = null;
    const allZones = new Set<string>();
    
    // Define consolidatedQuarterlyData at outer scope so it can be used later for component calculations
    let consolidatedQuarterlyData: any[] = [];
    
    for (const bill of bills) {
      const baseMonth = bill.contract.baseMonth ? new Date(bill.contract.baseMonth) : addMonths(new Date(bill.contract.dateOfOpening), -1);
      const measurementDate = new Date(bill.dateOfMeasurement);
      
      if (!earliestBaseMonth || baseMonth < earliestBaseMonth) {
        earliestBaseMonth = baseMonth;
      }
      if (!latestMeasurementDate || measurementDate > latestMeasurementDate) {
        latestMeasurementDate = measurementDate;
      }
      
      if (bill.zone) {
        allZones.add(bill.zone);
      }
    }
    
    if (earliestBaseMonth && latestMeasurementDate) {
      // ---- Determine which indices are actually affected by the bills' classifications ----
      const steelTypeEnumToIndexName: { [key: string]: string } = {
        'TMT': 'Steel TMT Bars',
        'ANGLE_CHANNEL': 'Steel Angle/Channel',
        'PLATES': 'Steel Plates',
        'OTHER_SECTIONS': 'Steel Other Sections'
      };
      const allSteelIndexNamesList = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      const affectedIndexNames = new Set<string>();

      for (const bill of bills) {
        // Build per-bill component-to-index mapping (fuel is zone-aware)
        const billFuelIdx = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
        const componentToIndexName: { [key: string]: string } = {
          'labour': 'Labour',
          'plantMachinery': 'RBI Plant Machinery',
          'fuel': billFuelIdx,
          'otherMaterials': 'RBI Other Materials',
          'cement': 'RBI Cement',
          'explosives': 'RBI Explosives'
        };

        if (bill.classificationEntries && bill.classificationEntries.length > 0) {
          for (const entry of bill.classificationEntries) {
            const classComp = (entry as any).subClassification || (entry as any).classification;
            if (!classComp) continue;

            for (const [compKey, idxName] of Object.entries(componentToIndexName)) {
              if ((classComp as any)[compKey] > 0) affectedIndexNames.add(idxName);
            }

            // Steel: add only the specific steel types used
            if ((classComp as any).steel > 0) {
              const entrySteel = (entry as any).steelTypes;
              const billSteel = (bill as any).steelTypes;
              const steelArr = (entrySteel && Array.isArray(entrySteel) && entrySteel.length > 0) ? entrySteel
                : (billSteel && Array.isArray(billSteel) && billSteel.length > 0) ? billSteel
                : null;
              if (steelArr) {
                for (const st of steelArr) {
                  if (steelTypeEnumToIndexName[st]) affectedIndexNames.add(steelTypeEnumToIndexName[st]);
                }
              } else {
                // No specific steel types â€” include all steel
                allSteelIndexNamesList.forEach(n => affectedIndexNames.add(n));
              }
            }
          }
        }

        // Dedicated cement/steel amounts on the bill itself
        if ((bill as any).cementAmount > 0) affectedIndexNames.add('RBI Cement');
        if ((bill as any).steelAmount > 0) {
          const billSteel = (bill as any).steelTypes;
          if (billSteel && Array.isArray(billSteel) && billSteel.length > 0) {
            for (const st of billSteel) {
              if (steelTypeEnumToIndexName[st]) affectedIndexNames.add(steelTypeEnumToIndexName[st]);
            }
          } else {
            allSteelIndexNamesList.forEach(n => affectedIndexNames.add(n));
          }
        }

        // Dedicated PVC values (non-zero means that index was used)
        if (bill.pvcCalculation) {
          if (bill.pvcCalculation.dedicatedCementPvc && bill.pvcCalculation.dedicatedCementPvc !== 0) affectedIndexNames.add('RBI Cement');
          if (bill.pvcCalculation.dedicatedSteelTmtBarsPvc && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0) affectedIndexNames.add('Steel TMT Bars');
          if (bill.pvcCalculation.dedicatedSteelAngleChannelPvc && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0) affectedIndexNames.add('Steel Angle/Channel');
          if (bill.pvcCalculation.dedicatedSteelPlatesPvc && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0) affectedIndexNames.add('Steel Plates');
          if (bill.pvcCalculation.dedicatedSteelOtherSectionsPvc && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0) affectedIndexNames.add('Steel Other Sections');
        }
      }

      // Define the canonical column order and header info
      // Each column: { indexName, headerLabel, isSteelSub }
      // Include both 4-city average and all city-specific fuel indices (only affected ones will show)
      const allColumnDefs = [
        { indexName: 'Labour', headerLabel: 'Labour', isSteelSub: false },
        { indexName: 'RBI Plant Machinery', headerLabel: 'Plant Machinery & Spares', isSteelSub: false },
        { indexName: 'MPNG Fuel', headerLabel: 'MPNG Fuel (4-City Avg)', isSteelSub: false },
        { indexName: 'MPNG Fuel - Delhi', headerLabel: 'MPNG Fuel (Delhi)', isSteelSub: false },
        { indexName: 'MPNG Fuel - Mumbai', headerLabel: 'MPNG Fuel (Mumbai)', isSteelSub: false },
        { indexName: 'MPNG Fuel - Chennai', headerLabel: 'MPNG Fuel (Chennai)', isSteelSub: false },
        { indexName: 'MPNG Fuel - Kolkata', headerLabel: 'MPNG Fuel (Kolkata)', isSteelSub: false },
        { indexName: 'RBI Other Materials', headerLabel: 'Other Materials', isSteelSub: false },
        { indexName: 'RBI Cement', headerLabel: 'Cement', isSteelSub: false },
        { indexName: 'RBI Explosives', headerLabel: 'Explosives', isSteelSub: false },
        { indexName: 'Steel TMT Bars', headerLabel: 'TMT Bars', isSteelSub: true },
        { indexName: 'Steel Angle/Channel', headerLabel: 'Angle/Channel', isSteelSub: true },
        { indexName: 'Steel Plates', headerLabel: 'Plates', isSteelSub: true },
        { indexName: 'Steel Other Sections', headerLabel: 'Other Sections', isSteelSub: true },
      ];

      // If no affected indices detected (e.g. no classification entries), fall back to showing all
      const activeCols = affectedIndexNames.size > 0
        ? allColumnDefs.filter(c => affectedIndexNames.has(c.indexName))
        : allColumnDefs;
      const activeSteelCols = activeCols.filter(c => c.isSteelSub);
      const activeNonSteelCols = activeCols.filter(c => !c.isSteelSub);
      const totalDataCols = activeCols.length; // excludes Period column

      // Fetch all indices
      const consolidatedIndices = await prisma.priceIndex.findMany({
        orderBy: { name: 'asc' }
      });
      
      // Fetch all monthly values for the date range
      const consolidatedMonthlyValues = await prisma.monthlyIndexValue.findMany({
        where: {
          month: {
            gte: new Date(earliestBaseMonth.getFullYear(), earliestBaseMonth.getMonth(), 1),
            lte: new Date(latestMeasurementDate.getFullYear(), latestMeasurementDate.getMonth() + 1, 0)
          }
        },
        include: {
          priceIndex: true
        },
        orderBy: {
          month: 'asc'
        }
      });
      
      // Build all monthly values map
      const consolidatedMonthlyValuesMap: { [indexName: string]: { [monthKey: string]: number } } = {};
      for (const index of consolidatedIndices) {
        consolidatedMonthlyValuesMap[index.name] = {};
      }
      
      const startMonth = new Date(earliestBaseMonth);
      const measurementEndDate = new Date(latestMeasurementDate.getFullYear(), latestMeasurementDate.getMonth() + 1, 0);
      
      for (const index of consolidatedIndices) {
        let currentMonth = new Date(startMonth);
        while (currentMonth <= measurementEndDate) {
          const monthKey = format(currentMonth, 'yyyy-MM');
          const monthlyValue = consolidatedMonthlyValues.find((idx: any) => 
            idx.priceIndexId === index.id &&
            format(new Date(idx.month), 'yyyy-MM') === monthKey
          );
          
          const indexValue = monthlyValue ? monthlyValue.value : index.baseValue;
          consolidatedMonthlyValuesMap[index.name][monthKey] = indexValue;
          currentMonth.setMonth(currentMonth.getMonth() + 1);
        }
      }
      
      // Get quarterly data for consolidated table
      // (consolidatedQuarterlyData is already declared at outer scope)
      const currentMonth = new Date(startMonth);
      const quarterCache = new Map();
      
      while (currentMonth <= measurementEndDate) {
        const quarter = getQuarterFromDate(new Date(currentMonth), earliestBaseMonth);
        if (!quarterCache.has(quarter)) {
          // Skip Q0 and Base quarters
          if (['Q0', 'Base'].includes(quarter)) {
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            continue;
          }
          
          const allQuarterMonths = getQuarterMonths(quarter, earliestBaseMonth);
          const measurementMonthEnd = new Date(latestMeasurementDate.getFullYear(), latestMeasurementDate.getMonth() + 1, 0);
          let quarterMonths = allQuarterMonths.filter(qMonth => qMonth <= measurementMonthEnd);
          
          // For quarterly calculations, we need exactly 3 months
          if (quarterMonths.length > 0 && quarterMonths.length < 3) {
            const lastAvailableMonth = quarterMonths[quarterMonths.length - 1];
            const monthsNeeded = 3 - quarterMonths.length;
            
            for (let i = 1; i <= monthsNeeded; i++) {
              const futureMonth = new Date(lastAvailableMonth);
              futureMonth.setMonth(futureMonth.getMonth() + i);
              const normalizedFutureMonth = new Date(futureMonth.getFullYear(), futureMonth.getMonth(), 1);
              quarterMonths.push(normalizedFutureMonth);
            }
          }
          
          const quarterData = {
            quarter,
            quarterMonths,
            averages: {} as { [key: string]: number },
            monthlyData: {} as { [key: string]: { [monthKey: string]: number } }
          };
          
          // Calculate averages and collect monthly data for each index
          for (const index of consolidatedIndices) {
            quarterData.monthlyData[index.name] = {};
            const monthlyValues = [];
            
            for (const qMonth of quarterMonths) {
              const monthKey = format(qMonth, 'yyyy-MM');
              let value = consolidatedMonthlyValuesMap[index.name][monthKey];
              
              if (!value) {
                const futureMonthValue = await prisma.monthlyIndexValue.findFirst({
                  where: {
                    priceIndexId: index.id,
                    month: {
                      gte: new Date(qMonth.getFullYear(), qMonth.getMonth(), 1),
                      lt: new Date(qMonth.getFullYear(), qMonth.getMonth() + 1, 1)
                    }
                  },
                  orderBy: {
                    month: 'desc'
                  }
                });
                
                value = futureMonthValue?.value || index.baseValue;
                consolidatedMonthlyValuesMap[index.name][monthKey] = value;
              }
              
              quarterData.monthlyData[index.name][monthKey] = value;
              monthlyValues.push(value);
            }
            
            quarterData.averages[index.name] = monthlyValues.length > 0 
              ? monthlyValues.reduce((sum, val) => sum + val, 0) / monthlyValues.length
              : index.baseValue;
          }
          
          consolidatedQuarterlyData.push(quarterData);
          quarterCache.set(quarter, quarterData);
        }
        currentMonth.setMonth(currentMonth.getMonth() + 3);
      }
      
      // Create consolidated base index data
      const consolidatedBaseIndexData: { [key: string]: number } = {};
      for (const index of consolidatedIndices) {
        const normalizedBaseMonth = new Date(earliestBaseMonth.getFullYear(), earliestBaseMonth.getMonth(), 1);
        
        const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: normalizedBaseMonth,
              lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
            }
          },
          orderBy: {
            month: 'desc'
          }
        });
        
        consolidatedBaseIndexData[index.name] = baseMonthValue?.value || index.baseValue;
      }
      
      // Alias city-specific steel indices under base names for zone-aware display
      // Use the dominant zone from the bills (for single-zone scenarios, this is exact)
      if (allZones.size > 0) {
        const dominantZone = allZones.values().next().value;
        const consolidatedSteelCity = getSteelCityForZone(dominantZone);
        if (consolidatedSteelCity) {
          const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
          for (const baseName of steelBaseNames) {
            const cityName = `${baseName} - ${consolidatedSteelCity}`;
            // Override base name with city-specific value if available
            if (consolidatedBaseIndexData[cityName] !== undefined) {
              consolidatedBaseIndexData[baseName] = consolidatedBaseIndexData[cityName];
            }
            // Also alias in monthly values map
            if (consolidatedMonthlyValuesMap[cityName]) {
              consolidatedMonthlyValuesMap[baseName] = { ...consolidatedMonthlyValuesMap[baseName], ...consolidatedMonthlyValuesMap[cityName] };
            }
          }
        }
      }

      // Alias city-specific steel in consolidated quarterly data
      if (allZones.size > 0) {
        const dominantZone = allZones.values().next().value;
        const consolidatedSteelCity = getSteelCityForZone(dominantZone);
        if (consolidatedSteelCity) {
          const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
          for (const qData of consolidatedQuarterlyData) {
            for (const baseName of steelBaseNames) {
              const cityName = `${baseName} - ${consolidatedSteelCity}`;
              if (qData.averages[cityName] !== undefined) {
                qData.averages[baseName] = qData.averages[cityName];
              }
              if (qData.monthlyData[cityName]) {
                qData.monthlyData[baseName] = { ...qData.monthlyData[baseName], ...qData.monthlyData[cityName] };
              }
            }
          }
        }
      }
      
      // Render the consolidated monthly indices table
      checkNewPage(150);
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text(`MONTHLY PRICE INDICES`, marginLeft, yPosition);
      
      const indicesTitle = `MONTHLY PRICE INDICES`;
      const indicesTitleWidth = pdf.getTextWidth(indicesTitle);
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.line(marginLeft, yPosition + 2, marginLeft + indicesTitleWidth, yPosition + 2);
      yPosition += 12;

      // Build a map of quarters to bill numbers
      const quarterToBillsMap = new Map<string, string[]>();
      for (const bill of bills) {
        // Calculate quarter dynamically if not present or invalid
        let billQuarter = bill.quarter;
        if (!billQuarter || billQuarter === 'null' || billQuarter === 'undefined') {
          try {
            const baseMonthDate = bill.contract.baseMonth ? new Date(bill.contract.baseMonth) : addMonths(new Date(bill.contract.dateOfOpening), -1);
            const measurementDate = new Date(bill.dateOfMeasurement);
            billQuarter = getQuarterFromDate(measurementDate, baseMonthDate);
          } catch (error) {
            console.error(`Error calculating quarter for bill ${bill.billNo}:`, error);
            billQuarter = 'N/A';
          }
        }
        quarterToBillsMap.set(billQuarter, [...(quarterToBillsMap.get(billQuarter) || []), bill.billNo]);
      }

      // Create comprehensive monthly indices table
      const consolidatedMonthlyTableData = [];

      // Base month row
      // Helper function to format steel indices - show decimals if available
      const formatSteelIndex = (value: number | undefined) => {
        if (value === undefined || value === null) return '';
        // Check if value has decimals
        if (value % 1 !== 0) {
          return value.toString(); // Show natural decimals
        }
        return value.toString(); // Show as integer if no decimals
      };

      // Helper to format index value for a column
      const fmtIdx = (col: typeof activeCols[0], value: number | undefined) => {
        if (value === undefined || value === null) return '';
        return col.isSteelSub ? formatSteelIndex(value) : value.toFixed(2);
      };

      const consolidatedBaseRow = [
        `BASE (${format(earliestBaseMonth, 'MMM yyyy')})  [Base Month]`,
        ...activeCols.map(col => fmtIdx(col, consolidatedBaseIndexData[col.indexName]))
      ];
      consolidatedMonthlyTableData.push(consolidatedBaseRow);

      // Add all monthly data for each quarter
      for (const qData of consolidatedQuarterlyData) {
        // Quarter header
        consolidatedMonthlyTableData.push([
          `QUARTER ${qData.quarter}`,
          ...activeCols.map(() => '')
        ]);

        // Monthly data for this quarter
        for (const qMonth of qData.quarterMonths) {
          const monthKey = format(qMonth, 'yyyy-MM');
          const monthLabel = format(qMonth, 'MMM yyyy');
          
          const monthRow = [
            monthLabel,
            ...activeCols.map(col => fmtIdx(col, qData.monthlyData[col.indexName]?.[monthKey]))
          ];
          consolidatedMonthlyTableData.push(monthRow);
        }

        // Quarter average row with bill numbers in the period column
        const firstMonth = qData.quarterMonths[0];
        const lastMonth = qData.quarterMonths[qData.quarterMonths.length - 1];
        const quarterLabel = qData.quarterMonths.length === 1 
          ? format(firstMonth, 'MMM yyyy')
          : format(firstMonth, 'MMM') + '-' + format(lastMonth, 'MMM yyyy');
        
        // Get bill numbers that use this quarter
        const billsForQuarter = quarterToBillsMap.get(qData.quarter) || [];
        const periodWithBills = billsForQuarter.length > 0 
          ? `${quarterLabel} AVERAGE\n[Bills: ${billsForQuarter.join(', ')}]`
          : `${quarterLabel} AVERAGE`;
        
        const avgRow = [
          periodWithBills,
          ...activeCols.map(col => {
            const v = qData.averages[col.indexName];
            return (v !== undefined && v !== null) ? v.toFixed(2) : '';
          })
        ];
        consolidatedMonthlyTableData.push(avgRow);
      }

      // Add zone information to table header if available
      const zoneText = allZones.size > 0 ? ` (${Array.from(allZones).join(', ')})` : '';
      
      // Calculate optimized column widths dynamically based on active columns
      const periodColWidth = contentWidth * 0.15;
      const indexColWidth = totalDataCols > 0 ? (contentWidth - periodColWidth) / totalDataCols : 0;
      
      // Build dynamic header rows
      const hasSteelCols = activeSteelCols.length > 0;
      const headerRow1: any[] = [
        { content: 'Period', rowSpan: hasSteelCols ? 2 : 1, styles: { valign: 'middle', halign: 'center' } }
      ];
      const headerRow2: string[] = [];

      for (const col of activeNonSteelCols) {
        headerRow1.push({ content: col.headerLabel, rowSpan: hasSteelCols ? 2 : 1, styles: { valign: 'middle', halign: 'center' } });
      }
      if (hasSteelCols) {
        headerRow1.push({ content: `Steel${zoneText}`, colSpan: activeSteelCols.length, styles: { halign: 'center', fontStyle: 'bold' } });
        for (const col of activeSteelCols) {
          headerRow2.push(col.headerLabel);
        }
      }

      const headRows: any[] = [headerRow1];
      if (hasSteelCols) headRows.push(headerRow2);

      // Build columnStyles dynamically
      const colStyles: any = {
        0: { cellWidth: periodColWidth, fontStyle: 'bold', halign: 'left', fontSize: 8.5 }
      };
      for (let i = 0; i < totalDataCols; i++) {
        colStyles[i + 1] = { cellWidth: indexColWidth, halign: 'center' };
      }
      
      pdf.autoTable({
        startY: yPosition,
        head: headRows,
        body: consolidatedMonthlyTableData,
        theme: 'grid',
        headStyles: { 
          fontStyle: 'bold',
          fontSize: 11,
          halign: 'center'
        },
        styles: { 
          fontSize: 9.5, 
          cellPadding: 2.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.5
        },
        margin: { left: marginLeft, right: marginRight },
        tableWidth: contentWidth,
        columnStyles: colStyles
      });

      yPosition = pdf.lastAutoTable.finalY + 15;
      
      // Add thin separator line after MONTHLY INDICES section
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
      yPosition += 8;
      
      // ============================================================================
      // CONSOLIDATED CEMENT AND STEEL DETAILS TABLE
      // ============================================================================
      
      // Calculate total cement and steel amounts across all bills
      let totalCementAmount = 0;
      let totalSteelAmount = 0;
      let totalCementPvc = 0;
      let totalSteelPvc = 0;
      
      const cementSteelTableData: any[] = [];
      
      for (const bill of bills) {
        if (!bill.pvcCalculation) continue;
        
        const cementPvc = (bill.pvcCalculation.cementPvc || 0) + (bill.pvcCalculation.dedicatedCementPvc || 0);
        const steelPvc = (bill.pvcCalculation.steelPvc || 0) + 
          (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0) +
          (bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0) +
          (bill.pvcCalculation.dedicatedSteelPlatesPvc || 0) +
          (bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0);
        
        // Only include bills with cement or steel components
        if (cementPvc > 0 || steelPvc > 0) {
          // Use actual cement and steel amounts stored in the bill
          let cementAmount = bill.cementAmount || 0;
          let steelAmount = (bill.steelTmtBarsAmount || 0) + 
                           (bill.steelAngleChannelAmount || 0) + 
                           (bill.steelPlatesAmount || 0) + 
                           (bill.steelOtherSectionsAmount || 0);
          
          // If no dedicated amounts are provided, calculate from classification percentages
          if (cementAmount === 0 && steelAmount === 0) {
            if (bill.classificationEntries && bill.classificationEntries.length > 0) {
              // Use calculateWeightedComponents to get percentages
              const weightedComponents = await calculateWeightedComponents(
                bill.classificationEntries.map((entry: any) => ({
                  subClassificationId: entry.subClassificationId,
                  classificationId: entry.classificationId,
                  amount: parseFloat(entry.amount) || 0
                }))
              );
              
              cementAmount = (bill.billAmount * weightedComponents.cement) / 100;
              steelAmount = (bill.billAmount * weightedComponents.steel) / 100;
            } else if (bill.workClassification) {
              cementAmount = (bill.billAmount * (bill.workClassification.cement || 0)) / 100;
              steelAmount = (bill.billAmount * (bill.workClassification.steel || 0)) / 100;
            }
          }
          
          totalCementAmount += cementAmount;
          totalSteelAmount += steelAmount;
          totalCementPvc += cementPvc;
          totalSteelPvc += steelPvc;
          
          cementSteelTableData.push([
            bill.billNo,
            cementAmount > 0 ? cementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-',
            cementPvc > 0 ? cementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-',
            steelAmount > 0 ? steelAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-',
            steelPvc > 0 ? steelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'
          ]);
        }
      }
      
      // Only show the table if there are cement or steel components
      if (cementSteelTableData.length > 0) {
        checkNewPage(100);
        
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text(`CEMENT & STEEL WORK DETAILS`, marginLeft, yPosition);
        
        const cementSteelTitle = `CEMENT & STEEL WORK DETAILS`;
        const cementSteelTitleWidth = pdf.getTextWidth(cementSteelTitle);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.line(marginLeft, yPosition + 2, marginLeft + cementSteelTitleWidth, yPosition + 2);
        yPosition += 12;
        
        // Add total row
        cementSteelTableData.push([
          { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'center' } },
          { content: totalCementAmount > 0 ? totalCementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-', styles: { fontStyle: 'bold' } },
          { content: totalCementPvc > 0 ? totalCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-', styles: { fontStyle: 'bold' } },
          { content: totalSteelAmount > 0 ? totalSteelAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-', styles: { fontStyle: 'bold' } },
          { content: totalSteelPvc > 0 ? totalSteelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-', styles: { fontStyle: 'bold' } }
        ]);
        
        pdf.autoTable({
          startY: yPosition,
          head: [[
            { content: 'Bill No.', styles: { halign: 'center' } },
            { content: 'Cement Amount', styles: { halign: 'center' } },
            { content: 'Cement PVC', styles: { halign: 'center' } },
            { content: 'Steel Amount', styles: { halign: 'center' } },
            { content: 'Steel PVC', styles: { halign: 'center' } }
          ]],
          body: cementSteelTableData,
          theme: 'grid',
          headStyles: { 
            fontStyle: 'bold',
            fontSize: 11,
            halign: 'center',
            fillColor: [41, 128, 185]
          },
          styles: { 
            fontSize: 10, 
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.5
          },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: contentWidth * 0.20, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: contentWidth * 0.20, halign: 'right' },
            2: { cellWidth: contentWidth * 0.20, halign: 'right' },
            3: { cellWidth: contentWidth * 0.20, halign: 'right' },
            4: { cellWidth: contentWidth * 0.20, halign: 'right' }
          }
        });
        
        yPosition = pdf.lastAutoTable.finalY + 15;
        
        // Add thin separator line after CEMENT & STEEL DETAILS section
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
        yPosition += 8;
      }
      
      // Note: Detailed cement and steel calculations are now shown within each bill's section
      // This removed section will be moved to individual bill sections below
    }

    // ============================================================================
    // END OF CONSOLIDATED MONTHLY INDICES TABLE
    // ============================================================================

    // Helper function to get quarterly average for an index
    const getQuarterlyAverage = (indices: any[], indexName: string, quarterMonths: Date[], baseMonth: Date) => {
      const quarterValues = quarterMonths.map(monthDate => {
        const monthIndex = indices.find(idx => 
          format(new Date(idx.month), 'MMM-yyyy') === format(monthDate, 'MMM-yyyy') &&
          idx.priceIndex.name === indexName
        );
        return monthIndex ? monthIndex.value : null;
      }).filter(val => val !== null);
      
      if (quarterValues.length === 0) return null;
      return quarterValues.reduce((sum: number, val: number) => sum + val, 0) / quarterValues.length;
    };

    // Helper function to get base index value
    const getBaseIndexValue = (indices: any[], indexName: string, baseMonth: Date) => {
      const baseMonthIndex = indices.find(idx => 
        format(new Date(idx.month), 'MMM-yyyy') === format(baseMonth, 'MMM-yyyy') &&
        idx.priceIndex.name === indexName
      );
      return baseMonthIndex ? baseMonthIndex.value : null;
    };

    // Helper function to get component percentage
    const getComponentPercentage = (classification: any, component: string): number => {
      if (!classification) return 0;
      
      // Check if it's a database Classification model (has direct properties)
      if (classification.cement !== undefined) {
        return classification[component] || 0;
      }
      
      // Check if it's a WorkClassification from constants (has components object)
      if (classification.components) {
        return classification.components[component] || 0;
      }
      
      return 0;
    };

    // Enhanced Individual Bill Analysis
    for (let i = 0; i < bills.length; i++) {
      const bill = bills[i];
      const billIndicesData = allIndicesData.get(bill.id);
      if (!billIndicesData) continue;
      
      const { indices, baseMonth, measurementDate } = billIndicesData;
      
      // Handle quarter months calculation - special cases for Q0 or Base
      let quarterMonths: Date[] = [];
      if (bill.quarter && !['Q0', 'Base'].includes(bill.quarter)) {
        quarterMonths = getQuarterMonths(bill.quarter, baseMonth);
      } else {
        // For Q0 or Base, use the measurement month only
        quarterMonths = [measurementDate];
      }
      
      checkNewPage(100);
      
      // Bill Header
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text(`BILL ${i + 1}: ${bill.billNo} - DETAILED ANALYSIS`, marginLeft, yPosition);
      
      // Underline the bill header
      const billHeaderText = `BILL ${i + 1}: ${bill.billNo} - DETAILED ANALYSIS`;
      const billHeaderWidth = pdf.getTextWidth(billHeaderText);
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.8);
      pdf.line(marginLeft, yPosition + 2, marginLeft + billHeaderWidth, yPosition + 2);
      
      yPosition += 10;
      
      // BUILD QUARTERLY DATA FOR THIS BILL (same as single PDF report)
      // Get all unique indices from database
      const allIndices = await prisma.priceIndex.findMany({
        orderBy: { name: 'asc' }
      });

      // Build all monthly values map
      const allMonthlyValues: { [indexName: string]: { [monthKey: string]: number } } = {};
      for (const index of allIndices) {
        allMonthlyValues[index.name] = {};
      }

      const startMonth = new Date(baseMonth);
      const measurementEndDate = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);
      
      for (const index of allIndices) {
        let currentMonth = new Date(startMonth);
        while (currentMonth <= measurementEndDate) {
          const monthKey = format(currentMonth, 'yyyy-MM');
          const monthlyValue = indices.find((idx: any) => 
            idx.priceIndexId === index.id &&
            format(new Date(idx.month), 'yyyy-MM') === monthKey
          );
          
          const indexValue = monthlyValue ? monthlyValue.value : index.baseValue;
          allMonthlyValues[index.name][monthKey] = indexValue;
          currentMonth.setMonth(currentMonth.getMonth() + 1);
        }
      }

      // Get quarterly data
      const quarterlyData: any[] = [];
      const currentMonth = new Date(startMonth);
      const quarterCache = new Map();
      
      // Only process quarters up to and including the measurement month
      while (currentMonth <= measurementEndDate) {
        const quarter = getQuarterFromDate(new Date(currentMonth), baseMonth);
        if (!quarterCache.has(quarter)) {
          // Handle quarter months calculation - skip Q0 and Base quarters as they're pre-contract
          if (['Q0', 'Base'].includes(quarter)) {
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            continue;
          }
          
          const allQuarterMonths = getQuarterMonths(quarter, baseMonth);
          // Filter months to only include those up to and including the measurement month
          const measurementMonthEnd = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);
          let quarterMonths = allQuarterMonths.filter(qMonth => qMonth <= measurementMonthEnd);
          
          // For quarterly calculations, we ALWAYS need exactly 3 months for a proper average
          if (quarterMonths.length > 0 && quarterMonths.length < 3) {
            const lastAvailableMonth = quarterMonths[quarterMonths.length - 1];
            const monthsNeeded = 3 - quarterMonths.length;
            
            for (let i = 1; i <= monthsNeeded; i++) {
              const futureMonth = new Date(lastAvailableMonth);
              futureMonth.setMonth(futureMonth.getMonth() + i);
              const normalizedFutureMonth = new Date(futureMonth.getFullYear(), futureMonth.getMonth(), 1);
              quarterMonths.push(normalizedFutureMonth);
            }
          }
          
          const quarterData = {
            quarter,
            quarterMonths,
            averages: {} as { [key: string]: number },
            monthlyData: {} as { [key: string]: { [monthKey: string]: number } },
            includesFutureMonths: quarterMonths.length === 3 && quarterMonths.some(qMonth => qMonth > measurementMonthEnd)
          };
          
          // Calculate averages and collect monthly data for each index
          for (const index of allIndices) {
            quarterData.monthlyData[index.name] = {};
            const monthlyValues = [];
            
            for (const qMonth of quarterMonths) {
              const monthKey = format(qMonth, 'yyyy-MM');
              let value = allMonthlyValues[index.name][monthKey];
              
              if (!value) {
                // Try to fetch this month's value from the database
                const futureMonthValue = await prisma.monthlyIndexValue.findFirst({
                  where: {
                    priceIndexId: index.id,
                    month: {
                      gte: new Date(qMonth.getFullYear(), qMonth.getMonth(), 1),
                      lt: new Date(qMonth.getFullYear(), qMonth.getMonth() + 1, 1)
                    }
                  },
                  orderBy: {
                    month: 'desc'
                  }
                });
                
                value = futureMonthValue?.value || index.baseValue;
                allMonthlyValues[index.name][monthKey] = value;
              }
              
              quarterData.monthlyData[index.name][monthKey] = value;
              monthlyValues.push(value);
            }
            
            quarterData.averages[index.name] = monthlyValues.length > 0 
              ? monthlyValues.reduce((sum, val) => sum + val, 0) / monthlyValues.length
              : index.baseValue;
          }
          
          quarterlyData.push(quarterData);
          quarterCache.set(quarter, quarterData);
        }
        currentMonth.setMonth(currentMonth.getMonth() + 3);
      }

      // Create base index data for this bill
      const baseIndexData: { [key: string]: number } = {};
      for (const index of allIndices) {
        const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
        
        const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: normalizedBaseMonth,
              lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
            }
          },
          orderBy: {
            month: 'desc'
          }
        });
        
        baseIndexData[index.name] = baseMonthValue?.value || index.baseValue;
      }

      // Alias city-specific steel indices under base names for this bill's zone
      const perBillSteelCity = getSteelCityForZone(bill.zone);
      if (perBillSteelCity) {
        const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
        for (const baseName of steelBaseNames) {
          const cityName = `${baseName} - ${perBillSteelCity}`;
          if (baseIndexData[cityName] !== undefined) {
            baseIndexData[baseName] = baseIndexData[cityName];
          }
          // Also alias in allMonthlyValues
          if (allMonthlyValues[cityName]) {
            allMonthlyValues[baseName] = { ...allMonthlyValues[baseName], ...allMonthlyValues[cityName] };
          }
        }
        // Also alias in per-bill quarterlyData
        for (const qData of quarterlyData) {
          for (const baseName of steelBaseNames) {
            const cityName = `${baseName} - ${perBillSteelCity}`;
            if (qData.averages[cityName] !== undefined) {
              qData.averages[baseName] = qData.averages[cityName];
            }
            if (qData.monthlyData[cityName]) {
              qData.monthlyData[baseName] = { ...qData.monthlyData[baseName], ...qData.monthlyData[cityName] };
            }
          }
        }
      }

      // Note: Monthly indices table is now shown once at the top for all bills (consolidated)
      
      // Use the workClassification from the bill (already included in the query)
      const workClassification = bill.workClassification;
      
      // If bill doesn't have work classification, show warning and skip classification-dependent sections
      if (!workClassification && (!bill.classificationEntries || bill.classificationEntries.length === 0)) {
        checkNewPage(60);
        
        // Show warning message
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(255, 0, 0); // Red color for warning
        pdf.text("âš  WORK CLASSIFICATION NOT ASSIGNED", marginLeft, yPosition);
        pdf.setTextColor(0, 0, 0); // Reset to black
        
        yPosition += 10;
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.text("This bill does not have work classification assigned. PVC calculations cannot be performed.", marginLeft + 10, yPosition);
        pdf.text("Please edit the bill and assign work classification to generate complete PVC report.", marginLeft + 10, yPosition + 6);
        
        yPosition += 20;
        
        // Skip to next bill
        continue;
      }

      // CLASSIFICATION INFORMATION SECTION
      checkNewPage(100);

      // GCC version heading (matches single bill report)
      pdf.setFontSize(19);
      pdf.setFont("helvetica", "bold");
      pdf.text("WORK CLASSIFICATION (GCC-2022-ACS2)", marginLeft, yPosition);
      const gccTitleWidth = pdf.getTextWidth("WORK CLASSIFICATION (GCC-2022-ACS2)");
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.line(marginLeft, yPosition + 2, marginLeft + gccTitleWidth, yPosition + 2);
      yPosition += 12;

      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text("WORK CLASSIFICATIONS & AMOUNTS", marginLeft, yPosition);

      const classifTitle = "WORK CLASSIFICATIONS & AMOUNTS";
      const classifTitleWidth = pdf.getTextWidth(classifTitle);
      pdf.setLineWidth(0.5);
      pdf.line(marginLeft, yPosition + 2, marginLeft + classifTitleWidth, yPosition + 2);
      yPosition += 12;
      
// Check if we have classification entries (new approach)
      if (bill.classificationEntries && bill.classificationEntries.length > 0) {
        const entryData: any[] = [];
        let totalAmount = 0;

        // Check which optional columns are present
        const hasDescriptions = bill.classificationEntries.some((entry: any) => entry.description);
        const hasSchedules = bill.classificationEntries.some((entry: any) => entry.scheduleItem);

        // Build dynamic headers
        const headers: string[] = ['S.No.', 'Code', 'Classification Name'];
        if (hasSchedules) headers.push('Schedule');
        if (hasDescriptions) headers.push('Description');
        headers.push('Amount');

        bill.classificationEntries.forEach((entry: any, index: number) => {
          const code = entry.subClassification?.code || entry.classification?.code || '';
          const name = entry.subClassification?.name || entry.classification?.name || '';
          const amount = parseFloat(entry.amount) || 0;
          totalAmount += amount;

          const row: any[] = [index + 1, code, name];
          if (hasSchedules) row.push(entry.scheduleItem || '');
          if (hasDescriptions) row.push(entry.description || '');
          row.push(amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
          entryData.push(row);
        });

        // Add total row - colSpan covers all columns except Amount
        const totalColSpan = headers.length - 1;
        entryData.push([
          { content: 'TOTAL', colSpan: totalColSpan, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } }
        ]);

        // Build dynamic column styles
        const colCount = headers.length;
        const colStyles: any = {};
        if (colCount === 4) {
          // S.No, Code, Name, Amount
          colStyles[0] = { cellWidth: contentWidth * 0.08, halign: 'center' };
          colStyles[1] = { cellWidth: contentWidth * 0.12, halign: 'center', fontStyle: 'bold' };
          colStyles[2] = { cellWidth: contentWidth * 0.55, halign: 'left' };
          colStyles[3] = { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' };
        } else if (colCount === 5) {
          // S.No, Code, Name, (Schedule OR Description), Amount
          colStyles[0] = { cellWidth: contentWidth * 0.07, halign: 'center' };
          colStyles[1] = { cellWidth: contentWidth * 0.10, halign: 'center', fontStyle: 'bold' };
          colStyles[2] = { cellWidth: contentWidth * 0.33, halign: 'left' };
          colStyles[3] = { cellWidth: contentWidth * 0.28, halign: 'left' };
          colStyles[4] = { cellWidth: contentWidth * 0.22, halign: 'right', fontStyle: 'bold' };
        } else if (colCount === 6) {
          // S.No, Code, Name, Schedule, Description, Amount
          colStyles[0] = { cellWidth: contentWidth * 0.06, halign: 'center' };
          colStyles[1] = { cellWidth: contentWidth * 0.09, halign: 'center', fontStyle: 'bold' };
          colStyles[2] = { cellWidth: contentWidth * 0.25, halign: 'left' };
          colStyles[3] = { cellWidth: contentWidth * 0.20, halign: 'left' };
          colStyles[4] = { cellWidth: contentWidth * 0.22, halign: 'left' };
          colStyles[5] = { cellWidth: contentWidth * 0.18, halign: 'right', fontStyle: 'bold' };
        }

        pdf.autoTable({
          startY: yPosition,
          head: [headers],
          body: entryData,
          theme: 'grid',
          headStyles: {
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'center'
          },
          styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.5
          },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: colStyles
        });
        
        yPosition = pdf.lastAutoTable.finalY + 8;

        // ---- Item Rows Detail Table ----
        const hasAnyItemRows = bill.classificationEntries.some((entry: any) => {
          const rows = entry.itemRows ? (typeof entry.itemRows === 'string' ? JSON.parse(entry.itemRows) : entry.itemRows) : null;
          return Array.isArray(rows) && rows.length > 0;
        });

        if (hasAnyItemRows) {
          if (yPosition > pageHeight - 60) { pdf.addPage(); yPosition = marginTop; }
          pdf.setFontSize(11);
          pdf.setFont("helvetica", "bold");
          pdf.text("ITEM DETAILS:", marginLeft, yPosition);
          yPosition += 6;

          const itemHeaders = ['S.No.', 'Classification', 'Item No.', 'Qty', 'Agmt. Rate', 'Amount'];
          const itemData: any[] = [];
          let serialNo = 0;

          bill.classificationEntries.forEach((entry: any) => {
            const code = entry.subClassification?.code || entry.classification?.code || '';
            const rows = entry.itemRows ? (typeof entry.itemRows === 'string' ? JSON.parse(entry.itemRows) : entry.itemRows) : null;

            if (Array.isArray(rows) && rows.length > 0) {
              rows.forEach((row: any) => {
                serialNo++;
                const qty = parseFloat(row.quantity) || 0;
                const rate = parseFloat(row.agreementRate) || 0;
                const rowAmt = qty * rate;
                itemData.push([
                  serialNo,
                  code,
                  row.itemNumber || '',
                  qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
                  rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                  rowAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                ]);
              });
            } else if (entry.itemNumber || entry.quantity || entry.agreementRate) {
              serialNo++;
              const qty = parseFloat(entry.quantity) || 0;
              const rate = parseFloat(entry.agreementRate) || 0;
              const rowAmt = qty * rate;
              itemData.push([
                serialNo,
                code,
                entry.itemNumber || '',
                qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
                rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                rowAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              ]);
            }
          });

          if (itemData.length > 0) {
            pdf.autoTable({
              startY: yPosition,
              head: [itemHeaders],
              body: itemData,
              theme: 'grid',
              headStyles: { fontStyle: 'bold', fontSize: 9, halign: 'center' },
              styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.5 },
              margin: { left: marginLeft, right: marginRight },
              tableWidth: contentWidth,
              columnStyles: {
                0: { cellWidth: contentWidth * 0.06, halign: 'center' },
                1: { cellWidth: contentWidth * 0.12, halign: 'center', fontStyle: 'bold' },
                2: { cellWidth: contentWidth * 0.22, halign: 'left' },
                3: { cellWidth: contentWidth * 0.15, halign: 'right' },
                4: { cellWidth: contentWidth * 0.20, halign: 'right' },
                5: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
              }
            });
            yPosition = pdf.lastAutoTable.finalY + 10;
          }
        }

      } else if (workClassification) {
        // Legacy approach: display single classification
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Classification Code: ${workClassification.code}`, marginLeft + 10, yPosition);
        
        yPosition += 6;
        pdf.setFont("helvetica", "normal");
        pdf.text(`Classification Name: ${workClassification.name}`, marginLeft + 10, yPosition);
        
        yPosition += 10;
      }

      // ============================================================================
      // DETAILED CEMENT AND STEEL CALCULATIONS FOR THIS BILL
      // ============================================================================
      
      if (bill.pvcCalculation) {
        // Check if bill has cement or steel components
        const hasCement = bill.cementAmount && bill.cementAmount > 0;
        const hasSteel = (bill.steelTmtBarsAmount && bill.steelTmtBarsAmount > 0) ||
                        (bill.steelAngleChannelAmount && bill.steelAngleChannelAmount > 0) ||
                        (bill.steelPlatesAmount && bill.steelPlatesAmount > 0) ||
                        (bill.steelOtherSectionsAmount && bill.steelOtherSectionsAmount > 0);
        
        if (hasCement || hasSteel) {
          // Get quarterly averages for this bill's quarter - use zone-based steel city prices
          const dedicatedIndicesNames = getIndicesNamesForBill(bill.zone, bill.fuelPriceType);
          
          let billQuarterlyAverages: any[] = [];
          try {
            billQuarterlyAverages = await quarterlyAverages(bill.quarter, dedicatedIndicesNames, bill.contract.baseMonth, 'auto');
          } catch (error) {
            console.error(`Error getting quarterly averages for bill ${bill.billNo}:`, error);
            billQuarterlyAverages = [];
          }
          
          // CEMENT CALCULATION SECTION (before steel as per user request)
          if (hasCement && bill.cementAmount) {
            checkNewPage(80);
            
            // Section header
            pdf.setFontSize(17);
            pdf.setFont("helvetica", "bold");
            pdf.text(`CEMENT CALCULATION`, marginLeft, yPosition);
            yPosition += 10;
            
            // Get detailed cement calculation
            const cementDetails = calculateDedicatedCementPvcWithSteps(bill.cementAmount, billQuarterlyAverages);
            
            if (cementDetails) {
              const cementPvc = cementDetails.finalPvc;
              const cementFormula = `${bill.cementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Ã— [(${cementDetails.averageIndex.toFixed(2)} - ${cementDetails.baseIndex.toFixed(2)}) Ã· ${cementDetails.baseIndex.toFixed(2)}] Ã— 85%`;
              
              const cementTableData = [
                [
                  'Cement (85%)',
                  cementFormula,
                  cementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                ]
              ];
              
              pdf.autoTable({
                startY: yPosition,
                head: [['Component', 'Calculation', 'PVC Amount']],
                body: cementTableData,
                theme: 'grid',
                headStyles: { 
                  fontStyle: 'bold',
                  fontSize: 13,
                  halign: 'center',
                  fillColor: [41, 128, 185]
                },
                styles: { 
                  fontSize: 13, 
                  cellPadding: 6,
                  lineColor: [0, 0, 0],
                  lineWidth: 0.8
                },
                margin: { left: marginLeft, right: marginRight },
                tableWidth: contentWidth,
                columnStyles: {
                  0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
                  1: { cellWidth: contentWidth * 0.50, halign: 'center' },
                  2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
                }
              });
              
              yPosition = pdf.lastAutoTable.finalY + 15;
            }
          }
          
          // STEEL CALCULATIONS SECTION (after cement as per user request)
          if (hasSteel) {
            // Steel Component mapping
            const steelComponents = [
              { 
                name: 'TMT Bars', 
                displayName: 'TMT Steel',
                amount: bill.steelTmtBarsAmount || 0, 
                pvc: bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0,
                indexName: 'Steel TMT Bars'
              },
              { 
                name: 'Angle/Channel', 
                displayName: 'Structural Steel',
                amount: bill.steelAngleChannelAmount || 0, 
                pvc: bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0,
                indexName: 'Steel Angle/Channel'
              },
              { 
                name: 'Plates', 
                displayName: 'MS Steel',
                amount: bill.steelPlatesAmount || 0, 
                pvc: bill.pvcCalculation.dedicatedSteelPlatesPvc || 0,
                indexName: 'Steel Plates'
              },
              { 
                name: 'Other Sections', 
                displayName: 'Other Section',
                amount: bill.steelOtherSectionsAmount || 0, 
                pvc: bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0,
                indexName: 'Steel Other Sections'
              }
            ];
            
            // Create a separate section for each steel component type
            for (const component of steelComponents) {
              if (component.amount > 0) {
                checkNewPage(80);
                
                // Section header
                pdf.setFontSize(17);
                pdf.setFont("helvetica", "bold");
                pdf.text(`${component.displayName.toUpperCase()} CALCULATION`, marginLeft, yPosition);
                yPosition += 10;
                
                // Get steel calculation details
                const steelDetails = calculateDedicatedSteelPvcWithSteps(
                  component.amount, 
                  billQuarterlyAverages, 
                  component.indexName
                );
                
                if (steelDetails) {
                  const steelPvc = steelDetails.finalPvc;
                  const steelFormula = `${component.amount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Ã— [(${steelDetails.averageIndex.toFixed(2)} - ${steelDetails.baseIndex.toFixed(2)}) Ã· ${steelDetails.baseIndex.toFixed(2)}] Ã— 85%`;
                  
                  const steelTableData = [
                    [
                      `${component.displayName} (85%)`,
                      steelFormula,
                      steelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                    ]
                  ];
                  
                  pdf.autoTable({
                    startY: yPosition,
                    head: [['Component', 'Calculation', 'PVC Amount']],
                    body: steelTableData,
                    theme: 'grid',
                    headStyles: { 
                      fontStyle: 'bold',
                      fontSize: 13,
                      halign: 'center',
                      fillColor: [41, 128, 185]
                    },
                    styles: { 
                      fontSize: 13, 
                      cellPadding: 6,
                      lineColor: [0, 0, 0],
                      lineWidth: 0.8
                    },
                    margin: { left: marginLeft, right: marginRight },
                    tableWidth: contentWidth,
                    columnStyles: {
                      0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
                      1: { cellWidth: contentWidth * 0.50, halign: 'center' },
                      2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
                    }
                  });
                  
                  yPosition = pdf.lastAutoTable.finalY + 15;
                }
              }
            }
          }
        }
      }

      // ============================================================================
      // OTHER COMPONENTS CALCULATION (PVC BY CLASSIFICATION)
      // ============================================================================

      // Track running total of all classification subtotals for accurate PVC summary
      let billClassificationPvcTotal = 0;
      
      // PVC CALCULATION BY CLASSIFICATION (same structure as single bill PDF)
      if (bill.pvcCalculation && bill.classificationEntries && bill.classificationEntries.length > 0) {
        // Get quarterly averages for this bill using the same function as single bill PDF
        // Use zone-based steel city prices
        const allIndicesNames = getIndicesNamesForBill(bill.zone, bill.fuelPriceType);
        
        // Get base indices
        const baseIndexData: { [key: string]: number } = {};
        for (const indexName of allIndicesNames) {
          const baseValue = getBaseIndexValue(indices, indexName, baseMonth);
          if (baseValue) {
            baseIndexData[indexName] = baseValue;
          }
        }
        
        // IMPORTANT: Use getQuarterlyAverages for each bill (same as single bill PDF)
        // This ensures we get the correct indices for the bill's specific quarter
        let quarterlyAverageIndices: { [key: string]: number } = {};
        
        try {
          logger.log(`\n=====  BULK PDF: Fetching quarterly averages for ${bill.billNo} =====`);
          logger.log(`Quarter: ${bill.quarter}`);
          logger.log(`Base Month: ${format(new Date(bill.contract.baseMonth), 'MMM yyyy')}`);
          
          const quarterlyAvgs = await quarterlyAverages(
            bill.quarter, 
            allIndicesNames, 
            bill.contract.baseMonth, 
            'auto'
          );
          
          for (const avg of quarterlyAvgs) {
            quarterlyAverageIndices[avg.indexName] = avg.average;
          }
          
          logger.log(`Quarterly averages fetched:`);
          for (const indexName of allIndicesNames) {
            if (quarterlyAverageIndices[indexName]) {
              logger.log(`  ${indexName}: ${quarterlyAverageIndices[indexName].toFixed(2)}`);
            } else {
              logger.log(`  ${indexName}: NOT FOUND`);
            }
          }
          logger.log('=====  End quarterly averages =====\n');
        } catch (error) {
          console.error(`ERROR: Failed to get quarterly averages for ${bill.billNo}:`, error);
          // Try fallback to consolidated data if available
          const billQuarterData = consolidatedQuarterlyData.find(qData => qData.quarter === bill.quarter);
          if (billQuarterData) {
            logger.log(`Using fallback: consolidated quarterly data`);
            for (const indexName of allIndicesNames) {
              if (billQuarterData.averages[indexName]) {
                quarterlyAverageIndices[indexName] = billQuarterData.averages[indexName];
              }
            }
          }
        }
        
        // Alias city-specific steel indices under base names for classification lookups
        const classifSteelCity = getSteelCityForZone(bill.zone);
        if (classifSteelCity) {
          const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
          for (const baseName of steelBaseNames) {
            const cityName = `${baseName} - ${classifSteelCity}`;
            if (baseIndexData[cityName] !== undefined) {
              baseIndexData[baseName] = baseIndexData[cityName];
            }
            if (quarterlyAverageIndices[cityName] !== undefined) {
              quarterlyAverageIndices[baseName] = quarterlyAverageIndices[cityName];
            }
          }
        }
        
        checkNewPage(100);
        
        // Classification section header
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text("PVC CALCULATION BY CLASSIFICATION", marginLeft, yPosition);
        
        const classTitle = "PVC CALCULATION BY CLASSIFICATION";
        const classTitleWidth = pdf.getTextWidth(classTitle);
        pdf.setLineWidth(0.5);
        pdf.line(marginLeft, yPosition + 2, marginLeft + classTitleWidth, yPosition + 2);
        
        yPosition += 12;
        
        // Helper function to map component to index name (zone-aware for fuel)
        const getIndexNameForComponent = (component: string, billForMapping?: any): string => {
          const fuelIdx = billForMapping ? getFuelIndexNameForBill(billForMapping.zone, billForMapping.fuelPriceType) : 'MPNG Fuel';
          const mapping: {[key: string]: string} = {
            'labour': 'Labour',
            'plantMachinery': 'RBI Plant Machinery',
            'fuel': fuelIdx,
            'otherMaterials': 'RBI Other Materials',
            'cement': 'RBI Cement',
            'explosives': 'RBI Explosives'
          };
          return mapping[component] || '';
        };
        
        // Helper function to get component display name
        const getComponentDisplayName = (component: string): string => {
          const mapping: {[key: string]: string} = {
            'fixed': 'Fixed Component',
            'labour': 'Labour',
            'plantMachinery': 'Plant Machinery & Spares',
            'fuel': 'Fuel & Lubricants',
            'otherMaterials': 'Other Materials',
            'cement': 'Cement Component',
            'steel': 'Steel Component',
            'explosives': 'Explosives'
          };
          return mapping[component] || component;
        };
        

        // Loop through each classification entry
        for (let classIdx = 0; classIdx < bill.classificationEntries.length; classIdx++) {
          const entry = bill.classificationEntries[classIdx];
          const entryAmount = parseFloat(String(entry.amount)) || 0;
          
          if (entryAmount <= 0) continue;
          
          const classificationComponents = entry.subClassification || entry.classification;
          if (!classificationComponents) continue;
          
          const classCode = classificationComponents.code;
          const className = classificationComponents.name;
          
          checkNewPage(80);
          
          // Classification header
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "bold");
          pdf.text(`Classification ${classIdx + 1}: ${classCode} - ${className}`, marginLeft, yPosition);
          yPosition += 7;
          
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "normal");
          pdf.text(`Amount: ${entryAmount.toLocaleString('en-IN')}`, marginLeft, yPosition);
          yPosition += 10;
          
          // Build component table for this classification
          const componentData = [];
          
          // Define components in order
          const components = [
            { key: 'fixed', percent: classificationComponents.fixed || 0 },
            { key: 'labour', percent: classificationComponents.labour || 0 },
            { key: 'plantMachinery', percent: classificationComponents.plantMachinery || 0 },
            { key: 'fuel', percent: classificationComponents.fuel || 0 },
            { key: 'otherMaterials', percent: classificationComponents.otherMaterials || 0 },
            { key: 'cement', percent: classificationComponents.cement || 0 },
            { key: 'steel', percent: classificationComponents.steel || 0 },
            { key: 'explosives', percent: classificationComponents.explosives || 0 }
          ];
          
          // Calculate PVC for each component using the same function as single bill PDF
          for (const component of components) {
            if (component.percent <= 0) continue;
            
            const displayName = getComponentDisplayName(component.key);
            const percentText = `${component.percent.toFixed(1)}%`;
            
            // Fixed component
            if (component.key === 'fixed') {
              componentData.push([
                `${displayName} (${percentText})`,
                'Not subject to price variation',
                '0.00'
              ]);
              continue;
            }
            
            // For steel, use selected steel types from bill (same logic as single bill PDF)
            if (component.key === 'steel') {
              logger.log(`\n=== STEEL COMPONENT DEBUG for ${classCode} ===`);
              logger.log(`Steel %: ${component.percent}`);
              logger.log(`Raw bill.steelTypes:`, bill.steelTypes);
              
              // Map steel type enum to index names (same as single PDF)
              const steelTypeMap: { [key: string]: string } = {
                'TMT': 'Steel TMT Bars',
                'ANGLE_CHANNEL': 'Steel Angle/Channel',
                'PLATES': 'Steel Plates',
                'OTHER_SECTIONS': 'Steel Other Sections'
              };
              
              // All possible steel index names
              const allSteelIndexNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
              let steelIndexNamesToUse = allSteelIndexNames;
              
              // If bill has steelTypes field and it's not empty, convert enums to index names
              if (bill.steelTypes && Array.isArray(bill.steelTypes) && bill.steelTypes.length > 0) {
                const billSteelTypes = bill.steelTypes as string[];
                steelIndexNamesToUse = billSteelTypes
                  .map((enumType: string) => steelTypeMap[enumType])
                  .filter((indexName: string) => indexName !== undefined);
                
                logger.log(`Bill has steel type selection: [${billSteelTypes.join(', ')}]`);
                logger.log(`Converted to index names: [${steelIndexNamesToUse.join(', ')}]`);
              } else {
                logger.log(`Using all steel types (no selection in bill)`);
              }
              
              // Debug: Show available indices
              logger.log(`\nAvailable steel indices:`);
              for (const indexName of allSteelIndexNames) {
                logger.log(`  ${indexName}: Base=${baseIndexData[indexName] || 'N/A'}, Current=${quarterlyAverageIndices[indexName] || 'N/A'}`);
              }
              
              logger.log(`\nSteel index names to use for averaging: [${steelIndexNamesToUse.join(', ')}]`);
              
              // Average the selected steel type indices for both base and current
              const steelBaseValues = steelIndexNamesToUse
                .map((indexName: string) => baseIndexData[indexName])
                .filter((val: number) => val && val > 0);
              
              const steelCurrentValues = steelIndexNamesToUse
                .map((indexName: string) => quarterlyAverageIndices[indexName])
                .filter((val: number) => val && val > 0);
              
              logger.log(`Base values found: ${steelBaseValues.length}, Current values found: ${steelCurrentValues.length}`);
              
              const steelBaseIndex = steelBaseValues.length > 0
                ? steelBaseValues.reduce((sum: number, val: number) => sum + val, 0) / steelBaseValues.length
                : 0;
              
              const steelCurrentIndex = steelCurrentValues.length > 0
                ? steelCurrentValues.reduce((sum: number, val: number) => sum + val, 0) / steelCurrentValues.length
                : 0;
              
              logger.log(`Averaged Base Index: ${steelBaseIndex}, Averaged Current Index: ${steelCurrentIndex}`);
              
              if (steelBaseIndex > 0 && steelCurrentIndex > 0) {
                // Use the same calculation function as single bill PDF
                const calcResult = calculatePvcComponentWithSteps(
                  entryAmount,
                  steelCurrentIndex,
                  steelBaseIndex,
                  component.percent,
                  displayName
                );
                
                const pvcAmount = calcResult.finalPvc;
                
                // Build formula with steel type names for clarity
                let formula: string;
                if (steelIndexNamesToUse.length === 1) {
                  // Single steel type - show the type name
                  formula = `${entryAmount.toLocaleString('en-IN')} Ã— [(${steelCurrentIndex.toFixed(2)} - ${steelBaseIndex.toFixed(2)}) Ã· ${steelBaseIndex.toFixed(2)}] Ã— ${percentText} (${steelIndexNamesToUse[0]})`;
                } else {
                  // Multiple steel types - show averaging
                  const steelTypeNames = steelIndexNamesToUse.join(', ');
                  formula = `${entryAmount.toLocaleString('en-IN')} Ã— [(${steelCurrentIndex.toFixed(2)} - ${steelBaseIndex.toFixed(2)}) Ã· ${steelBaseIndex.toFixed(2)}] Ã— ${percentText} (Avg of: ${steelTypeNames})`;
                }
                
                componentData.push([
                  `${displayName} (${percentText})`,
                  formula,
                  pvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                ]);
                logger.log(`âœ“ Steel component added to PDF with formula: ${formula}`);
              } else {
                logger.log(`âœ— Steel component NOT added - indices missing or zero`);
                logger.log(`   Base values: ${steelBaseValues.length}, Current values: ${steelCurrentValues.length}`);
                logger.log(`   steelBaseIndex: ${steelBaseIndex}, steelCurrentIndex: ${steelCurrentIndex}`);
                
                // Add a placeholder row showing that steel indices are missing
                componentData.push([
                  `${displayName} (${percentText})`,
                  `Steel indices not available (Requested: ${steelIndexNamesToUse.join(', ')})`,
                  '0.00'
                ]);
              }
              logger.log(`=== END STEEL DEBUG ===\n`);
              continue;
            }
            
            // For other components, use the same calculation function as single bill PDF
            const indexName = getIndexNameForComponent(component.key, bill);
            if (!indexName) continue;
            
            const baseIndex = baseIndexData[indexName] || 0;
            const currentIndex = quarterlyAverageIndices[indexName] || 0;
            
            if (baseIndex > 0 && currentIndex > 0) {
              // Use the standardized calculation function (same as single bill PDF)
              const calcResult = calculatePvcComponentWithSteps(
                entryAmount,
                currentIndex,
                baseIndex,
                component.percent,
                displayName
              );
              
              const pvcAmount = calcResult.finalPvc;
              const formula = `${entryAmount.toLocaleString('en-IN')} Ã— [(${currentIndex.toFixed(2)} - ${baseIndex.toFixed(2)}) Ã· ${baseIndex.toFixed(2)}] Ã— ${percentText}`;
              componentData.push([
                `${displayName} (${percentText})`,
                formula,
                pvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
              ]);
            }
          }
          
          // Calculate subtotal for this classification
          let classificationSubtotal = 0;
          for (const row of componentData) {
            const amountStr = row[2] as string;
            const amount = parseFloat(amountStr.replace(/,/g, ''));
            if (!isNaN(amount)) {
              classificationSubtotal += amount;
            }
          }
          
          // Accumulate into bill-level total
          billClassificationPvcTotal += classificationSubtotal;
          
          // Add component rows
          componentData.push([
            { content: `SUBTOTAL PVC FOR ${classCode}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
            { content: '', styles: { fillColor: [240, 240, 240] } },
            { content: classificationSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
          ]);
          
          // Render the table
          pdf.autoTable({
            startY: yPosition,
            head: [['Component', 'Formula', 'PVC Amount']],
            body: componentData,
            theme: 'grid',
            headStyles: {
              fontStyle: 'bold',
              fontSize: 10,
              halign: 'center',
              fillColor: [41, 128, 185]
            },
            styles: {
              fontSize: 9,
              cellPadding: 3,
              lineColor: [0, 0, 0],
              lineWidth: 0.5
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold' },
              1: { cellWidth: contentWidth * 0.55, fontSize: 8 },
              2: { cellWidth: contentWidth * 0.20, halign: 'right', fontStyle: 'bold' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 15;
        }
      } else {
        // No PVC calculation available
        checkNewPage(60);
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "italic");
        pdf.text("PVC calculation not available for this bill.", marginLeft + 10, yPosition);
        yPosition += 20;
      }

      if (bill.pvcCalculation) {
        // TOTAL PVC SUMMARY
        checkNewPage(60);
        
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text(`BILL ${i + 1} - PVC SUMMARY`, marginLeft, yPosition);
        
        // Underline the section header
        const billPvcSummaryTitle = `BILL ${i + 1} - PVC SUMMARY`;
        const billPvcSummaryWidth = pdf.getTextWidth(billPvcSummaryTitle);
        pdf.setLineWidth(0.5);
        pdf.line(marginLeft, yPosition + 2, marginLeft + billPvcSummaryWidth, yPosition + 2);
        
        yPosition += 12;
        
        // Use the accumulated classification subtotals (recalculated from indices above)
        // plus dedicated cement/steel PVC for accurate total that matches the tables shown
        const dedicatedCementPvcForSummary = bill.pvcCalculation.dedicatedCementPvc || 0;
        const dedicatedSteelPvcForSummary = 
          (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0) +
          (bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0) +
          (bill.pvcCalculation.dedicatedSteelPlatesPvc || 0) +
          (bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0);
        const calculatedTotal = billClassificationPvcTotal + dedicatedCementPvcForSummary + dedicatedSteelPvcForSummary;
        
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text("Total PVC Amount:", marginLeft, yPosition);
        pdf.text(calculatedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }), marginLeft + 80, yPosition);
        
        yPosition += 15;
      }

      // Add separator between bills (except for the last one)
      if (i < bills.length - 1) {
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(1);
        pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
        yPosition += 15;
      }
    }

    // ============================================================================

    // Add page numbers and footer to all pages
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      
      // Footer line
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, pageHeight - 10, pageWidth - marginRight, pageHeight - 10);
      
      // Page number
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100, 100, 100);
      const pageNumText = `Page ${i} of ${totalPages}`;
      const pageNumWidth = pdf.getTextWidth(pageNumText);
      pdf.text(pageNumText, pageWidth - marginRight - pageNumWidth, pageHeight - 6);
      
      // Report footer text (if any)
      if (brandingSettings.reportFooterText) {
        pdf.setFontSize(8);
        pdf.text(brandingSettings.reportFooterText, marginLeft, pageHeight - 6);
      }
      
      // Generation date
      pdf.setFontSize(8);
      const istNow = toISTDate(new Date());
      const genDateText = `Generated: ${format(istNow, 'dd MMM yyyy, HH:mm')} IST`;
      pdf.text(genDateText, marginLeft + (contentWidth / 2) - (pdf.getTextWidth(genDateText) / 2), pageHeight - 6);
      
      // Reset text color
      pdf.setTextColor(0, 0, 0);
    }

    // Generate initial PDF buffer
    let initialPdfBytes = new Uint8Array(pdf.output('arraybuffer'));

    // The abstract, after the statements it summarises and before the index documents.
    // Only the IR format used to do this, so asking for an abstract with the detailed
    // format returned a file without one and no explanation.
    if (includeAbstract) {
      const appended = await appendContractAbstract(initialPdfBytes, uniqueContractIds as string[]);
      initialPdfBytes = appended.bytes;
      abstractStatus = appended.status;
    }

    // Embed component index documents covering earliest base month → latest measurement date
    if (bills.length > 0) {
      const firstBill = bills[0];

      // Use the EARLIEST base month across all bills so all index years are covered
      const componentIndexStartDate = bills.reduce((earliest, bill) => {
        const bm = bill.contract.baseMonth
          ? new Date(bill.contract.baseMonth)
          : addMonths(new Date(bill.contract.dateOfOpening), -1);
        return bm < earliest ? bm : earliest;
      }, firstBill.contract.baseMonth
        ? new Date(firstBill.contract.baseMonth)
        : addMonths(new Date(firstBill.contract.dateOfOpening), -1));

      // Find the latest measurement date among all bills
      const componentIndexEndDate = bills.reduce((latest, bill) => {
        const measurementDate = new Date(bill.dateOfMeasurement);
        return measurementDate > latest ? measurementDate : latest;
      }, new Date(firstBill.dateOfMeasurement));

      // The JPC sheets are a paid annex (Rs 500 once per bill, charged on the single
      // report). A batch must not be the free way around that: steel sheets go in only
      // when every steel bill in the batch has paid — or its owner is on a free
      // account, the same exemption the single route applies. Admins are exempt.
      let bulkJpcAllowed = isAdminRequester;
      if (!bulkJpcAllowed) {
        const steelBills = bills.filter((b: any) => (b.steelAmount || 0) > 0 || (Array.isArray(b.steelTypes) && (b.steelTypes as any[]).length > 0));
        let paidIds = new Set<string>();
        let jpcColumnReady = true;
        try {
          const ids = steelBills.map((x: any) => x.id);
          const rows = ids.length
            ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(
                `SELECT id FROM ${await (await import('@/lib/db-schema')).schemaQualified('bills')} WHERE id = ANY($1) AND "jpcDocsPurchasedAt" IS NOT NULL`, ids,
              )
            : [];
          paidIds = new Set(rows.map(r => r.id));
        } catch { jpcColumnReady = false; }
        const unpaid = jpcColumnReady ? steelBills.filter((b: any) => !paidIds.has(b.id)) : [];
        if (unpaid.length === 0) {
          bulkJpcAllowed = true;
        } else {
          const ownerIds = [...new Set(unpaid.map((b: any) => b.contract?.userId).filter(Boolean))] as string[];
          const owners = await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, role: true, isFreeAccount: true, customProcessingFee: true },
          });
          const freeOwner = (id: string) => {
            const o = owners.find(u => u.id === id);
            return !!o && (o.isFreeAccount || o.customProcessingFee === 0
              || ['admin', 'superadmin', 'railway_official', 'accounts_official'].includes(o.role || ''));
          };
          bulkJpcAllowed = unpaid.every((b: any) => freeOwner(b.contract?.userId));
        }
      }
      const bulkComponentTypes = anyBillHasSteel(bills) && bulkJpcAllowed ? undefined : NON_STEEL_COMPONENT_TYPES;
      // Same rule as the IR-format path above: the shared sheet is marked only when
      // every bill in the batch reads the same city.
      const bulkJpcCities = new Set(bills.map((b: any) => getSteelCityForZone(b.zone)));
      const finalPdfBytes = includeIndexDocs
        ? await embedComponentIndicesRange(initialPdfBytes, {
            startDate: componentIndexStartDate,
            endDate: componentIndexEndDate,
            componentTypes: bulkComponentTypes,
            jpcCity: bulkJpcCities.size === 1 ? [...bulkJpcCities][0] : undefined,
            jpcCaption: `${firstBill.contract.agreementNo} — ${bills.length} bill(s)`,
          })
        : initialPdfBytes;

      const stampedFinal = bulkNeedsWatermark
        ? await (await import('@/lib/pdf/utils/watermark')).applyTrialWatermark(finalPdfBytes)
        : finalPdfBytes;
      const pdfBuffer = Buffer.from(stampedFinal);

      return new Response(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Bulk_PVC_Report_${bills.length}_Bills_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf"`,
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-Abstract-Status': abstractStatus,
        }
      });
    } else {
      // If no bills, return without labour index
      const stampedInitial = bulkNeedsWatermark
        ? await (await import('@/lib/pdf/utils/watermark')).applyTrialWatermark(initialPdfBytes)
        : initialPdfBytes;
      const pdfBuffer = Buffer.from(stampedInitial);
      return new Response(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Bulk_PVC_Report_${bills.length}_Bills_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf"`,
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-Abstract-Status': abstractStatus,
        }
      });
    }
      })(),
      TIMEOUT_DEFAULTS.BULK_PDF,
      'bulk-pdf-generation'
    );

  } catch (error) {
    console.error('Error generating bulk PDF report:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return NextResponse.json(
      { error: 'Failed to generate bulk PDF report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

