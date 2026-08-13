import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQuarterMonths, getQuarterFromDate, calculateDedicatedCementPvcWithSteps, calculateDedicatedSteelPvcWithSteps, calculateWeightedComponents, calculatePvcComponentWithSteps } from '@/lib/pvc-calculations';
import { format, startOfMonth } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getBillIndicesStatus } from '@/lib/index-status';
import * as XLSX from 'xlsx';
import type { WorkSheet } from 'xlsx';

export const dynamic = "force-dynamic";

// Helper function to apply cell styling
function applyCellStyle(ws: WorkSheet, cellRef: string, style: any) {
  if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
  ws[cellRef].s = style;
}

// Helper function to set column widths
function setColumnWidths(ws: WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

// Helper function to merge cells
function mergeCells(ws: WorkSheet, range: string) {
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push(XLSX.utils.decode_range(range));
}

// Styling configurations
const styles = {
  header: {
    font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1F4788" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    }
  },
  subHeader: {
    font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "4472C4" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    }
  },
  title: {
    font: { bold: true, sz: 16, color: { rgb: "1F4788" } },
    alignment: { horizontal: "center", vertical: "center" }
  },
  sectionHeader: {
    font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "70AD47" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    }
  },
  label: {
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right", vertical: "center" }
  },
  value: {
    font: { sz: 10 },
    alignment: { horizontal: "left", vertical: "center" }
  },
  currency: {
    font: { sz: 10 },
    numFmt: '₹#,##0.00',
    alignment: { horizontal: "right", vertical: "center" }
  },
  percentage: {
    font: { sz: 10 },
    numFmt: '0.00%',
    alignment: { horizontal: "right", vertical: "center" }
  },
  number: {
    font: { sz: 10 },
    numFmt: '#,##0.00',
    alignment: { horizontal: "right", vertical: "center" }
  },
  total: {
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "E26B0A" } },
    numFmt: '₹#,##0.00',
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "double", color: { rgb: "000000" } },
      bottom: { style: "double", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    }
  },
  provisional: {
    font: { sz: 10, color: { rgb: "FF0000" } },
    fill: { fgColor: { rgb: "FFE699" } },
    numFmt: '#,##0.00',
    alignment: { horizontal: "right", vertical: "center" }
  },
  baseMonth: {
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "70AD47" } },
    numFmt: '#,##0.00',
    alignment: { horizontal: "right", vertical: "center" }
  }
};

// Helper function to convert number to words (Indian numbering system)
function numberToWordsIndian(num: number): string {
  if (num === 0) return 'Zero Only';
  
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  
  function convertLessThanThousand(n: number): string {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
    }
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + convertLessThanThousand(remainder) : '');
  }
  
  const mainAmount = Math.floor(absNum);
  const decimal = Math.round((absNum - mainAmount) * 100);
  
  let result = '';
  
  if (mainAmount > 0) {
    const crore = Math.floor(mainAmount / 10000000);
    const lakh = Math.floor((mainAmount % 10000000) / 100000);
    const thousand = Math.floor((mainAmount % 100000) / 1000);
    const remainder = mainAmount % 1000;
    
    if (crore > 0) {
      result += convertLessThanThousand(crore) + ' Crore ';
    }
    if (lakh > 0) {
      result += convertLessThanThousand(lakh) + ' Lakh ';
    }
    if (thousand > 0) {
      result += convertLessThanThousand(thousand) + ' Thousand ';
    }
    if (remainder > 0) {
      result += convertLessThanThousand(remainder);
    }
    
    result = result.trim();
  }
  
  if (decimal > 0) {
    result += ' and ' + convertLessThanThousand(decimal);
  }
  
  result = result.trim();
  
  if (isNegative) {
    result = 'Minus ' + result;
  }
  
  return result + ' Only';
}

// GET /api/bills/[id]/excel-report - Generate comprehensive PVC Excel report with professional formatting
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const billId = id;

    // Whose bill this is, checked before anything is fetched. The session imports sat
    // at the top of this file, never called — any signed-in user could pull any bill's
    // complete workbook by id.
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const requester = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    const { checkUserBillAccess } = await import('@/lib/permissions');
    const access = requester ? await checkUserBillAccess(requester.id, billId) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    // The Excel cannot carry the PDF's trial watermark, so for an unwaived trial bill it
    // was the clean copy: same figures, no stamp. Until the owner tops up, the workbook
    // is refused and the (watermarked) PDF is the trial format.
    const stamp = await prisma.bill.findUnique({
      where: { id: billId },
      select: {
        billTransaction: { select: { discountType: true } },
        contract: { select: { userId: true } },
      },
    });
    if (stamp?.billTransaction?.discountType === 'trial' && stamp.contract?.userId) {
      const topups = await prisma.creditTransaction.count({
        where: { userId: stamp.contract.userId, type: 'add' },
      });
      if (topups === 0) {
        return NextResponse.json(
          { error: 'The Excel report is not available for free-trial bills. Download the PDF report, or top up once to unlock every format.' },
          { status: 403 },
        );
      }
    }

    // Get the main bill with all related data
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: {
          include: {
            user: {
              select: {
                reportHeaderText: true,
              }
            },
            extensions: {
              orderBy: { extensionDuration: 'desc' },
              take: 1
            }
          }
        },
        workClassification: true,
        pvcCalculation: true,
        classificationEntries: {
          include: {
            subClassification: true,
            classification: true
          }
        }
      }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Get the provisional/final indices status for this bill
    const indicesStatus = await getBillIndicesStatus(
      bill.quarter,
      new Date(bill.contract.baseMonth)
    );

    // Get ALL bills for this contract
    const allContractBills = await prisma.bill.findMany({
      where: { 
        contractId: bill.contractId
      },
      include: {
        pvcCalculation: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany({
      orderBy: { name: 'asc' }
    });

    // Calculate date ranges
    const baseMonth = new Date(bill.contract.baseMonth);
    const measurementDate = new Date(bill.dateOfMeasurement);
    const measurementMonthEnd = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);

    // Get all monthly index values
    const allMonthlyIndicesData = await prisma.monthlyIndexValue.findMany({
      where: {
        month: {
          gte: startOfMonth(baseMonth),
          lte: startOfMonth(measurementMonthEnd)
        }
      },
      include: {
        priceIndex: true
      },
      orderBy: { month: 'asc' }
    });

    // Organize indices by name and month
    const indicesByName: { [key: string]: { [monthKey: string]: { value: number; isProvisional: boolean } } } = {};
    allIndices.forEach((index: any) => {
      indicesByName[index.name] = {};
    });

    allMonthlyIndicesData.forEach((data: any) => {
      const indexName = data.priceIndex.name;
      const monthKey = format(data.month, 'yyyy-MM');
      indicesByName[indexName][monthKey] = {
        value: data.value,
        isProvisional: data.isProvisional || false
      };
    });

    // Fill in base values for missing months
    allIndices.forEach((index: any) => {
      const currentMonth = new Date(baseMonth);
      while (currentMonth <= measurementMonthEnd) {
        const monthKey = format(currentMonth, 'yyyy-MM');
        if (!indicesByName[index.name][monthKey]) {
          indicesByName[index.name][monthKey] = {
            value: index.baseValue,
            isProvisional: false
          };
        }
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }
    });

    // Get quarterly averages
    const allIndicesNames = allIndices.map(index => index.name);
    const quarterlyAveragesData: { [quarter: string]: { [indexName: string]: number } } = {};
    
    const currentMonth = new Date(baseMonth);
    currentMonth.setMonth(currentMonth.getMonth() + 1); // Start from month after base
    
    while (currentMonth <= measurementMonthEnd) {
      const quarter = getQuarterFromDate(new Date(currentMonth), baseMonth);
      if (!quarterlyAveragesData[quarter]) {
        try {
          const averages = await getQuarterlyAverages(quarter, allIndicesNames, baseMonth, 'auto');
          quarterlyAveragesData[quarter] = {};
          averages.forEach((avg: any) => {
            quarterlyAveragesData[quarter][avg.indexName] = avg.average;
          });
        } catch (error) {
          console.error(`Error getting quarterly averages for Q${quarter}:`, error);
          quarterlyAveragesData[quarter] = {};
        }
      }
      currentMonth.setMonth(currentMonth.getMonth() + 3);
    }

    const hasDedicatedCement = bill.cementAmount && Number(bill.cementAmount) > 0;
    const hasDedicatedSteel = 
      (bill.steelTmtBarsAmount && Number(bill.steelTmtBarsAmount) > 0) ||
      (bill.steelAngleChannelAmount && Number(bill.steelAngleChannelAmount) > 0) ||
      (bill.steelPlatesAmount && Number(bill.steelPlatesAmount) > 0) ||
      (bill.steelOtherSectionsAmount && Number(bill.steelOtherSectionsAmount) > 0);

    // Get weighted components
    const weightedComponents = await calculateWeightedComponents(
      (bill.classificationEntries || []).map(entry => ({
        subClassificationId: entry.subClassificationId || undefined,
        classificationId: entry.classificationId || undefined,
        amount: entry.amount
      })),
      {
        hasDedicatedSteel,
        hasDedicatedCement
      }
    );

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // ===== SINGLE COMPREHENSIVE SHEET =====
    const reportData: any[] = [];
    const reportTitle = bill.contract.user?.reportHeaderText || 'INDIAN RAILWAY';
    
    // ========== HEADER SECTION ==========
    reportData.push([reportTitle, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['PRICE VARIATION CLAUSE (PVC) VERIFICATION REPORT', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const istNowExcel = toISTDate(new Date());
    reportData.push([`Bill No: ${bill.billNo}`, '', '', `Generated: ${format(istNowExcel, 'dd-MM-yyyy HH:mm:ss')} IST`, '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    
    // ========== VERIFICATION CHECKLIST ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['PVC CALCULATION VERIFICATION CHECKLIST', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['Sr.', 'Verification Item', 'Details / Value', 'Status', 'Verified By', 'Date', 'Remarks', '', '', '', '', '', '', '', '']);
    reportData.push(['───', '────────────────────────────────────────', '──────────────────────────────────────────', '───────', '────────────', '──────────', '─────────────────', '', '', '', '', '', '', '', '']);
    reportData.push(['1', 'Contract Details Verified', `LOA: ${bill.contract.loaNo || 'N/A'}`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['2', 'Base Month Verification', format(baseMonth, 'MMMM yyyy'), '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['3', 'Measurement Date & Quarter', `${format(measurementDate, 'dd-MM-yyyy')} (Q${bill.quarter})`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['4', 'Gross Bill Amount Verification', `₹ ${bill.grossBillAmount.toLocaleString('en-IN')}`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['5', 'Classification Breakdown Verified', `${bill.classificationEntries?.length || 0} entries`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['6', 'Monthly Indices Verified', indicesStatus.isProvisional ? `Some Provisional Indices` : 'All Final Indices', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['7', 'Quarterly Averages Calculated', `Q${bill.quarter} averages verified`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['8', 'PVC Calculations Verified', 'All component calculations checked', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['9', '17B Capping Verification', bill.pvcCalculation?.isIndexCapped ? 'Applied & Verified' : 'Not Applicable', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['10', 'Final PVC Amount Verified', `₹ ${(bill.pvcCalculation?.totalPvc || 0).toLocaleString('en-IN')}`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['11', 'Net Payable Amount Verified', `₹ ${(bill.grossBillAmount + (bill.pvcCalculation?.totalPvc || 0)).toLocaleString('en-IN')}`, '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['───', '────────────────────────────────────────', '──────────────────────────────────────────', '───────', '────────────', '──────────', '─────────────────', '', '', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['Note: Status Options: ✓ Verified | ✗ Issue Found | ○ Pending', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    
    // ========== SECTION 1: CONTRACT INFORMATION ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['1. CONTRACT INFORMATION', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    reportData.push(['LOA Number:', bill.contract.loaNo || 'N/A', '', 'Agreement No:', bill.contract.agreementNo || 'N/A', '', '']);
    reportData.push(['Contractor Name:', bill.contract.contractorName || 'N/A', '', '', '', '', '']);
    reportData.push(['Work Description:', bill.contract.workDescription || 'N/A', '', '', '', '', '']);
    reportData.push(['Date of Opening:', format(new Date(bill.contract.dateOfOpening), 'dd-MM-yyyy'), '', 'Base Month:', format(baseMonth, 'MMM yyyy'), '', '']);
    
    if (bill.contract.isExtended) {
      reportData.push(['Contract Extended:', 'Yes', '', 'Extension Type:', bill.contract.extensionType || 'N/A', '', '']);
      if (bill.contract.originalCompletionDate) {
        reportData.push(['Original Completion:', format(new Date(bill.contract.originalCompletionDate), 'dd-MM-yyyy'), '', '', '', '', '']);
      }
      if (bill.contract.currentCompletionDate) {
        reportData.push(['Current Completion:', format(new Date(bill.contract.currentCompletionDate), 'dd-MM-yyyy'), '', '', '', '', '']);
      }
    }
    
    reportData.push(['', '', '', '', '', '', '']);
    
    // ========== SECTION 2: BILL INFORMATION ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['2. BILL INFORMATION', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    reportData.push(['Bill Number:', bill.billNo, '', 'PVC Number:', bill.pvcNumber || 'N/A', '', '']);
    reportData.push(['Zone:', bill.zone || 'N/A', '', 'Is Final PVC:', bill.isFinalPvc ? 'Yes' : 'No', '', '']);
    reportData.push(['Measurement Date:', format(measurementDate, 'dd-MM-yyyy'), '', 'Quarter:', `Q${bill.quarter}`, '', '']);
    reportData.push(['Gross Bill Amount:', bill.grossBillAmount, '', 'Indices Status:', indicesStatus.isProvisional ? 'Provisional' : 'Final', '', '']);
    
    if (indicesStatus.isProvisional) {
      const provisionalCount = indicesStatus.provisionalIndices?.length || 0;
      const totalCount = (indicesStatus.provisionalIndices?.length || 0) + (indicesStatus.finalIndices?.length || 0);
      reportData.push(['', '', '', `${provisionalCount} of ${totalCount} indices are provisional`, '', '', '']);
    }
    
    reportData.push(['', '', '', '', '', '', '']);
    
    // ========== SECTION 3: FINANCIAL SUMMARY ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['3. FINANCIAL SUMMARY', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    reportData.push(['Gross Bill Amount:', bill.grossBillAmount, '', '', '', '', '']);
    reportData.push(['Total PVC Amount:', bill.pvcCalculation?.totalPvc || 0, '', '', '', '', '']);
    
    if (bill.pvcCalculation?.isIndexCapped) {
      reportData.push(['17B Capping Applied:', 'Yes', '', '', '', '', '']);
      reportData.push(['Original PVC (Before 17B):', bill.pvcCalculation?.originalPvcAmount || 0, '', '', '', '', '']);
      reportData.push(['Restricted PVC (After 17B):', bill.pvcCalculation?.restrictedPvcAmount || 0, '', '', '', '', '']);
    }
    
    reportData.push(['Net Payable Amount:', (bill.grossBillAmount + (bill.pvcCalculation?.totalPvc || 0)), '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    reportData.push(['Amount in Words:', numberToWordsIndian(bill.pvcCalculation?.totalPvc || 0), '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    // ========== SECTION 4: COMPONENT-WISE PVC BREAKDOWN ==========
    if (bill.pvcCalculation) {
      reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
      reportData.push(['4. COMPONENT-WISE PVC BREAKDOWN', '', '', '', '', '', '']);
      reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '']);
      
      reportData.push(['Component', 'Amount (₹)', '% of Total PVC', '', '', '', '']);
      reportData.push(['─────────────────────────────────────────────────', '────────────────', '─────────────────', '', '', '', '']);
      
      const totalPvc = bill.pvcCalculation.totalPvc || 0;
      const components = [
        { name: 'Dedicated Cement', amount: bill.pvcCalculation.dedicatedCementPvc || 0 },
        { name: 'Dedicated Steel', amount: bill.pvcCalculation.dedicatedSteelPvc || 0 },
        { name: 'Weighted Cement', amount: bill.pvcCalculation.cementPvc || 0 },
        { name: 'Weighted Steel', amount: bill.pvcCalculation.steelPvc || 0 },
        { name: 'Other Materials', amount: bill.pvcCalculation.otherMaterialsPvc || 0 },
        { name: 'Labour', amount: bill.pvcCalculation.labourPvc || 0 },
        { name: 'Plant & Machinery', amount: bill.pvcCalculation.plantMachineryPvc || 0 },
        { name: 'Fuel & Power', amount: bill.pvcCalculation.fuelPowerPvc || 0 },
        { name: 'Explosives', amount: bill.pvcCalculation.explosivesPvc || 0 }
      ].filter(c => c.amount !== 0);
      
      components.forEach(comp => {
        const percentage = totalPvc > 0 ? (comp.amount / totalPvc) : 0;
        reportData.push([comp.name, comp.amount, percentage, '', '', '', '']);
      });
      
      reportData.push(['─────────────────────────────────────────────────', '────────────────', '─────────────────', '', '', '', '']);
      reportData.push(['TOTAL PVC', totalPvc, 1.0, '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '']);
    }
    
    // ========== SECTION 5: WORK CLASSIFICATION ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['5. WORK CLASSIFICATION DETAILS', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);

    if (bill.classificationEntries && bill.classificationEntries.length > 0) {
      reportData.push(['Classification', 'Sub-Classification', 'Description', 'Amount (₹)', 'Cement %', 'Steel %', 'Other Mat %', 'Labour %', 'P&M %', 'Fuel %', 'Explosives %']);
      reportData.push(['─────────────', '──────────────────', '──────────────────────', '──────────', '────────', '────────', '──────────', '────────', '──────', '──────', '───────────']);
      
      let totalAmount = 0;
      bill.classificationEntries.forEach((entry: any) => {
        const subClass = entry.subClassification;
        const classification = entry.classification;
        totalAmount += entry.amount || 0;
        
        reportData.push([
          classification?.code || 'N/A',
          subClass?.name || 'N/A',
          subClass?.description || '',
          entry.amount || 0,
          (subClass?.cementPercentage || 0) / 100,
          (subClass?.steelPercentage || 0) / 100,
          (subClass?.otherMaterialsPercentage || 0) / 100,
          (subClass?.labourPercentage || 0) / 100,
          (subClass?.plantMachineryPercentage || 0) / 100,
          (subClass?.fuelPowerPercentage || 0) / 100,
          (subClass?.explosivesPercentage || 0) / 100
        ]);
      });
      
      reportData.push(['─────────────', '──────────────────', '──────────────────────', '──────────', '────────', '────────', '──────────', '────────', '──────', '──────', '───────────']);
      reportData.push(['TOTAL', '', '', totalAmount, '', '', '', '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '', '', '', '', '']);
      
      reportData.push(['WEIGHTED AVERAGE COMPONENTS', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['─────────────────────────────', '──────────────────', '──────────────────', '', '', '', '', '', '', '', '']);
      reportData.push(['Component', 'Weighted Amount (₹)', '% of Gross Amount', '', '', '', '', '', '', '', '']);
      reportData.push(['Cement', weightedComponents.cement, weightedComponents.cement / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      reportData.push(['Steel', weightedComponents.steel, weightedComponents.steel / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      reportData.push(['Other Materials', weightedComponents.otherMaterials, weightedComponents.otherMaterials / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      reportData.push(['Labour', weightedComponents.labour, weightedComponents.labour / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      reportData.push(['Plant & Machinery', weightedComponents.plantMachinery, weightedComponents.plantMachinery / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      reportData.push(['Fuel & Power', weightedComponents.fuel, weightedComponents.fuel / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      reportData.push(['Explosives', weightedComponents.explosives, weightedComponents.explosives / bill.grossBillAmount, '', '', '', '', '', '', '', '']);
      
    } else if (bill.workClassification) {
      const wc = bill.workClassification;
      reportData.push(['Classification Code:', wc.code || 'N/A', '', '', '', '', '']);
      reportData.push(['Classification Name:', wc.name || 'N/A', '', '', '', '', '']);
      reportData.push(['Description:', wc.description || 'N/A', '', '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '']);
      reportData.push(['Component Percentages:', '', '', '', '', '', '']);
      reportData.push(['Cement:', (wc.cement || 0) / 100, '', 'Steel:', (wc.steel || 0) / 100, '', '']);
      reportData.push(['Other Materials:', (wc.otherMaterials || 0) / 100, '', 'Labour:', (wc.labour || 0) / 100, '', '']);
    } else {
      reportData.push(['No classification data available', '', '', '', '', '', '']);
    }
    
    reportData.push(['', '', '', '', '', '', '']);
    
    // ========== SECTION 6: DETAILED PVC CALCULATION VERIFICATION TABLE ==========
    if (bill.pvcCalculation) {
      const pvcCalc = bill.pvcCalculation;
      const currentQuarterAvg = quarterlyAveragesData[bill.quarter] || {};
      
      reportData.push(['═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['6. PVC CALCULATION VERIFICATION TABLE', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['Formula: PVC = Component Amount × (Index Ratio - 1) × Weightage', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['Index Ratio = Current Quarter Average ÷ Base Month Value', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      
      // Create comprehensive calculation table
      reportData.push(['Component', 'Type', 'Component Amount (₹)', 'Index Name', 'Base Value', 'Current Qtr Avg', 'Index Ratio', 'Variation', 'Weightage %', 'Calculation', 'PVC Amount (₹)', 'Verified ✓', '', '', '']);
      reportData.push(['─────────────────────', '──────────', '──────────────────', '───────────────────────────', '───────────', '───────────────', '──────────', '──────────', '──────────', '─────────────────────────────────', '──────────────────', '───────────', '', '', '']);
      
      const calcRows: any[] = [];
      
      // Dedicated Steel
      if (bill.steelAmount && bill.steelAmount > 0) {
        const steelIndexName = bill.selectedSteelComponent || 'Steel TMT Bars';
        const steelBaseValue = allIndices.find((i: any) => i.name === steelIndexName)?.baseValue || 0;
        const steelCurrentAvg = currentQuarterAvg[steelIndexName] || 0;
        const steelRatio = steelBaseValue > 0 ? steelCurrentAvg / steelBaseValue : 0;
        const variation = steelRatio - 1;
        const pvcAmount = pvcCalc.dedicatedSteelPvc || 0;
        
        calcRows.push([
          'Steel (Dedicated)',
          'Dedicated',
          bill.steelAmount,
          steelIndexName,
          steelBaseValue,
          steelCurrentAvg,
          steelRatio,
          variation,
          0.50,
          `${bill.steelAmount.toFixed(2)} × ${variation.toFixed(6)} × 0.50`,
          pvcAmount,
          ''
        ]);
      }
      
      // Dedicated Cement
      if (bill.cementAmount && bill.cementAmount > 0) {
        const cementIndexName = 'All India Average Retail Price of Cement';
        const cementBaseValue = allIndices.find((i: any) => i.name === cementIndexName)?.baseValue || 0;
        const cementCurrentAvg = currentQuarterAvg[cementIndexName] || 0;
        const cementRatio = cementBaseValue > 0 ? cementCurrentAvg / cementBaseValue : 0;
        const variation = cementRatio - 1;
        const pvcAmount = pvcCalc.dedicatedCementPvc || 0;
        
        calcRows.push([
          'Cement (Dedicated)',
          'Dedicated',
          bill.cementAmount,
          cementIndexName,
          cementBaseValue,
          cementCurrentAvg,
          cementRatio,
          variation,
          0.50,
          `${bill.cementAmount.toFixed(2)} × ${variation.toFixed(6)} × 0.50`,
          pvcAmount,
          ''
        ]);
      }
      
      // Weighted Components
      const components = [
        { name: 'Cement', type: 'Weighted', amount: weightedComponents.cement, index: 'All India Average Retail Price of Cement', weight: 0.5, pvc: pvcCalc.cementPvc || 0 },
        { name: 'Steel', type: 'Weighted', amount: weightedComponents.steel, index: bill.selectedSteelComponent || 'Steel TMT Bars', weight: 0.5, pvc: pvcCalc.steelPvc || 0 },
        { name: 'Other Materials', type: 'Weighted', amount: weightedComponents.otherMaterials, index: 'RBI Other Materials', weight: 0.1, pvc: pvcCalc.otherMaterialsPvc || 0 },
        { name: 'Labour', type: 'Weighted', amount: weightedComponents.labour, index: 'Labour', weight: 0.4, pvc: pvcCalc.labourPvc || 0 },
        { name: 'Plant & Machinery', type: 'Weighted', amount: weightedComponents.plantMachinery, index: 'Plant & Machinery', weight: 0.05, pvc: pvcCalc.plantMachineryPvc || 0 },
        { name: 'Fuel & Power', type: 'Weighted', amount: weightedComponents.fuel, index: 'MPNG Fuel', weight: 0.05, pvc: pvcCalc.fuelPowerPvc || 0 },
        { name: 'Explosives', type: 'Weighted', amount: weightedComponents.explosives, index: 'Explosives', weight: 0.05, pvc: pvcCalc.explosivesPvc || 0 }
      ];
      
      components.forEach(comp => {
        if (comp.amount > 0) {
          const indexObj = allIndices.find((i: any) => i.name === comp.index);
          const baseValue = indexObj?.baseValue || 0;
          const currentAvg = currentQuarterAvg[comp.index] || 0;
          const ratio = baseValue > 0 ? currentAvg / baseValue : 0;
          const variation = ratio - 1;
          
          calcRows.push([
            comp.name,
            comp.type,
            comp.amount,
            comp.index,
            baseValue,
            currentAvg,
            ratio,
            variation,
            comp.weight,
            `${comp.amount.toFixed(2)} × ${variation.toFixed(6)} × ${comp.weight}`,
            comp.pvc,
            ''
          ]);
        }
      });
      
      // Add all calculation rows
      calcRows.forEach(row => {
        reportData.push(row.concat(['', '', ''])); // Pad to 15 columns
      });
      
      // Summary rows
      reportData.push(['─────────────────────', '──────────', '──────────────────', '───────────────────────────', '───────────', '───────────────', '──────────', '──────────', '──────────', '─────────────────────────────────', '──────────────────', '───────────', '', '', '']);
      reportData.push(['SUBTOTAL PVC', '', '', '', '', '', '', '', '', '', pvcCalc.originalPvcAmount || pvcCalc.totalPvc || 0, '', '', '', '']);
      
      if (pvcCalc.isIndexCapped) {
        reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        reportData.push(['17B CAPPING DETAILS', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        reportData.push(['─────────────────────', '──────────', '──────────────────', '───────────────────────────', '───────────', '───────────────', '──────────', '──────────', '──────────', '─────────────────────────────────', '──────────────────', '───────────', '', '', '']);
        reportData.push(['Original PVC', '', '', '', '', '', '', '', '', '', pvcCalc.originalPvcAmount || 0, '', '', '', '']);
        reportData.push(['Restricted (17B)', '', '', '', '', '', '', '', '', '', pvcCalc.restrictedPvcAmount || 0, '', '', '', '']);
        reportData.push(['─────────────────────', '──────────', '──────────────────', '───────────────────────────', '───────────', '───────────────', '──────────', '──────────', '──────────', '─────────────────────────────────', '──────────────────', '───────────', '', '', '']);
      }
      
      reportData.push(['FINAL TOTAL PVC', '', '', '', '', '', '', '', '', '', pvcCalc.totalPvc || 0, '', '', '', '']);
      reportData.push(['═════════════════════', '══════════', '══════════════════', '═══════════════════════════', '═══════════', '═══════════════', '══════════', '══════════', '══════════', '═════════════════════════════════', '══════════════════', '═══════════', '', '', '']);
      
      reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['BILL FINANCIAL SUMMARY', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['─────────────────────────────────', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['Gross Bill Amount:', bill.grossBillAmount, '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['Total PVC Amount:', pvcCalc.totalPvc || 0, '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['Net Payable Amount:', bill.grossBillAmount + (pvcCalc.totalPvc || 0), '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['Amount in Words:', numberToWordsIndian(bill.grossBillAmount + (pvcCalc.totalPvc || 0)), '', '', '', '', '', '', '', '', '', '', '', '', '']);
      reportData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    
    // ========== SECTION 7: MONTHLY INDICES ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['7. MONTHLY PRICE INDICES', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push([`Base Month: ${format(baseMonth, 'MMM yyyy')}`, '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    // Build header row for indices
    const headerRow = ['Index Name'];
    const monthsList: Date[] = [];
    const currentMonthIter = new Date(baseMonth);
    
    while (currentMonthIter <= measurementMonthEnd) {
      headerRow.push(format(currentMonthIter, 'MMM yyyy'));
      monthsList.push(new Date(currentMonthIter));
      currentMonthIter.setMonth(currentMonthIter.getMonth() + 1);
    }
    
    // Add quarterly average columns
    Object.keys(quarterlyAveragesData).sort().forEach(q => {
      headerRow.push(`Q${q} Avg`);
    });
    
    reportData.push(headerRow);
    
    // Add data rows for each index
    allIndices.forEach((index: any) => {
      const row: any[] = [index.name];
      
      monthsList.forEach((month) => {
        const monthKey = format(month, 'yyyy-MM');
        const indexData = indicesByName[index.name][monthKey];
        if (indexData) {
          row.push(indexData.value);
        } else {
          row.push('N/A');
        }
      });
      
      // Add quarterly averages
      Object.keys(quarterlyAveragesData).sort().forEach(q => {
        const avg = quarterlyAveragesData[q][index.name];
        row.push(avg !== undefined ? avg : 'N/A');
      });
      
      reportData.push(row);
    });
    
    reportData.push(['', '', '', '', '', '', '']);
    
    // ========== SECTION 8: ALL CONTRACT BILLS ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['8. ALL BILLS FOR THIS CONTRACT', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    reportData.push(['Bill No.', 'Date of Measurement', 'Quarter', 'Gross Amount (₹)', 'PVC Amount (₹)', 'Net Payable (₹)', 'Status']);
    reportData.push(['──────────', '──────────────────', '────────', '────────────────', '───────────────', '────────────────', '──────']);

    allContractBills.forEach((b: any) => {
      const pvcAmount = b.pvcCalculation?.totalPvc || 0;
      const netPayable = b.grossBillAmount + pvcAmount;
      const status = b.id === billId ? '← Current' : '';
      
      reportData.push([
        b.billNo,
        format(new Date(b.dateOfMeasurement), 'dd-MM-yyyy'),
        `Q${b.quarter}`,
        b.grossBillAmount,
        pvcAmount,
        netPayable,
        status
      ]);
    });

    reportData.push(['──────────', '──────────────────', '────────', '────────────────', '───────────────', '────────────────', '──────']);
    reportData.push([
      'TOTALS',
      '',
      '',
      allContractBills.reduce((sum: number, b: any) => sum + b.grossBillAmount, 0),
      allContractBills.reduce((sum: number, b: any) => sum + (b.pvcCalculation?.totalPvc || 0), 0),
      allContractBills.reduce((sum: number, b: any) => sum + b.grossBillAmount + (b.pvcCalculation?.totalPvc || 0), 0),
      ''
    ]);
    
    reportData.push(['', '', '', '', '', '', '']);
    
    // ========== SECTION 9: QUARTERLY COMPARISON ==========
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['9. QUARTERLY INDEX COMPARISON', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['', '', '', '', '', '', '']);
    
    const quarters = Object.keys(quarterlyAveragesData).sort((a, b) => parseInt(a) - parseInt(b));
    
    if (quarters.length > 0) {
      const qHeaderRow = ['Index Name', 'Base Value'];
      quarters.forEach(q => qHeaderRow.push(`Q${q}`));
      qHeaderRow.push('% Change (Base to Current)');
      
      // Pad the header row to match 7 columns
      while (qHeaderRow.length < 7) {
        qHeaderRow.push('');
      }
      reportData.push(qHeaderRow);
      
      allIndices.forEach((index: any) => {
        const row: any[] = [index.name, index.baseValue];
        
        quarters.forEach(q => {
          const avg = quarterlyAveragesData[q][index.name];
          row.push(avg !== undefined ? avg : 'N/A');
        });
        
        const currentQAvg = quarterlyAveragesData[bill.quarter][index.name] || 0;
        const percentChange = index.baseValue > 0 ? ((currentQAvg / index.baseValue) - 1) : 0;
        row.push(percentChange);
        
        // Pad to 7 columns
        while (row.length < 7) {
          row.push('');
        }
        reportData.push(row);
      });
    } else {
      reportData.push(['No quarterly data available', '', '', '', '', '', '']);
    }
    
    reportData.push(['', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);
    reportData.push(['END OF REPORT', '', '', '', '', '', '']);
    reportData.push(['═══════════════════════════════════════════════════════════════════════', '', '', '', '', '', '']);

    const mainSheet = XLSX.utils.aoa_to_sheet(reportData);
    // Set column widths for better readability - wider columns for the verification table
    setColumnWidths(mainSheet, [25, 12, 18, 30, 12, 15, 12, 12, 12, 35, 18, 12, 15, 15, 15]);
    XLSX.utils.book_append_sheet(workbook, mainSheet, 'PVC Verification Report');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Create response with proper headers
    const fileName = `PVC_Report_${bill.billNo.replace(/\//g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.xlsx`;
    
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Error generating Excel report:', error);
    return NextResponse.json(
      { error: 'Failed to generate Excel report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
