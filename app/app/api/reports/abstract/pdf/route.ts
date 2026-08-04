
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQuarterFromDate } from '@/lib/pvc-calculations';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getFileUrl } from '@/lib/s3';

export const dynamic = "force-dynamic";

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    
    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

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

    // Get contract details
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        user: {
          select: {
            logoPath: true,
            reportHeaderText: true,
            reportHeaderColor: true,
            reportFooterText: true,
            showLogoInReports: true,
          }
        }
      }
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Use contract owner's branding
    if (contract.user) {
      brandingSettings = {
        logoPath: contract.user.logoPath,
        logoUrl: null,
        reportHeaderText: contract.user.reportHeaderText || 'INDIAN RAILWAY',
        reportHeaderColor: contract.user.reportHeaderColor || '#000000',
        reportFooterText: contract.user.reportFooterText || '',
        showLogoInReports: contract.user.showLogoInReports,
      };

      // Generate signed URL for logo if it exists
      if (contract.user.logoPath && contract.user.showLogoInReports) {
        try {
          brandingSettings.logoUrl = await getFileUrl(contract.user.logoPath, 3600);
        } catch (error) {
          console.error('Error generating logo URL:', error);
        }
      }
    }

    // Get all bills for this contract with PVC calculations and classification entries
    const bills = await prisma.bill.findMany({
      where: { contractId: contractId },
      include: {
        pvcCalculation: true,
        classificationEntries: {
          include: {
            classification: true,
            subClassification: true,
          }
        }
      },
      orderBy: { dateOfMeasurement: 'asc' }
    });

    // Filter bills that have PVC calculations
    const billsWithPvc = bills.filter((bill: any) => bill.pvcCalculation);

    if (billsWithPvc.length === 0) {
      return NextResponse.json(
        { error: 'No bills with PVC calculations found for this contract' },
        { status: 404 }
      );
    }

    // Build bill data - one row per bill (same logic as the main route)
    const billDataArray: any[] = [];
    let totalForLabourFuelMaterialsPlant = 0;
    let totalForCement = 0;
    let totalForSteelTmt = 0;
    let totalForSteelAngleChannel = 0;
    let totalForSteelPlates = 0;
    let totalForSteelOtherSections = 0;
    let grandTotal = 0;

    billsWithPvc.forEach(bill => {
      const quarter = getQuarterFromDate(new Date(bill.dateOfMeasurement), new Date(contract.baseMonth));
      
      if (bill.pvcCalculation) {
        const labour = bill.pvcCalculation.labourPvc;
        const material = bill.pvcCalculation.otherMaterialsPvc;
        const fuel = bill.pvcCalculation.fuelPowerPvc;
        const plantMachinery = bill.pvcCalculation.plantMachineryPvc;
        
        // Cement: include both regular and dedicated
        const cement = bill.pvcCalculation.cementPvc + bill.pvcCalculation.dedicatedCementPvc;
        
        // Calculate steel components by checking actual steel types from classification entries
        let steelTmt = 0;
        let steelAngleChannel = 0;
        let steelPlates = 0;
        let steelOtherSections = 0;
        
        // Iterate through classification entries to distribute steel PVC correctly
        if (bill.classificationEntries && bill.classificationEntries.length > 0) {
          bill.classificationEntries.forEach(entry => {
            if (entry.steelPvc && entry.steelPvc !== 0) {
              // Get steel types for this classification entry
              let steelTypes: string[] = [];
              if (entry.steelTypes && Array.isArray(entry.steelTypes)) {
                steelTypes = entry.steelTypes.filter((type): type is string => typeof type === 'string');
              }
              
              // If no steel types specified, default to TMT for backward compatibility
              if (steelTypes.length === 0) {
                steelTmt += entry.steelPvc;
              } else {
                // Distribute steel PVC equally among selected types
                const pvcPerType = entry.steelPvc / steelTypes.length;
                steelTypes.forEach(type => {
                  switch (type) {
                    case 'TMT':
                    case 'TMT_BARS':
                      steelTmt += pvcPerType;
                      break;
                    case 'ANGLE_CHANNEL':
                    case 'ANGLES':
                    case 'CHANNELS':
                      steelAngleChannel += pvcPerType;
                      break;
                    case 'PLATES':
                      steelPlates += pvcPerType;
                      break;
                    case 'OTHER_SECTIONS':
                      steelOtherSections += pvcPerType;
                      break;
                    default:
                      // Unknown type, add to TMT for safety
                      steelTmt += pvcPerType;
                  }
                });
              }
            }
          });
          
          // ADD dedicated steel components to the classification-based steel
          steelTmt += (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0);
          steelAngleChannel += (bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0);
          steelPlates += (bill.pvcCalculation.dedicatedSteelPlatesPvc || 0);
          steelOtherSections += (bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0);
        } else {
          // Fallback: use bill-level PVC calculation fields (old logic for bills without classification entries)
          steelTmt = bill.pvcCalculation.steelPvc + (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0);
          steelAngleChannel = bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0;
          steelPlates = bill.pvcCalculation.dedicatedSteelPlatesPvc || 0;
          steelOtherSections = bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0;
        }
        
        // Main components total
        const mainTotal = labour + material + fuel + plantMachinery;
        
        // Row total including cement and all steel types
        const rowTotal = mainTotal + cement + steelTmt + steelAngleChannel + steelPlates + steelOtherSections;
        
        // Calculate bill amount as sum of all component allocations from bill creation
        const calculatedBillAmount = (bill.billAmount || 0) + 
                                      (bill.cementAmount || 0) + 
                                      (bill.steelTmtBarsAmount || 0) + 
                                      (bill.steelAngleChannelAmount || 0) + 
                                      (bill.steelPlatesAmount || 0) + 
                                      (bill.steelOtherSectionsAmount || 0);
        
        billDataArray.push({
          billNo: bill.billNo,
          quarter,
          measurementDate: format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy'),
          billAmount: calculatedBillAmount,
          labour,
          material,
          fuel,
          plantMachinery,
          cement,
          steelTmt,
          steelAngleChannel,
          steelPlates,
          steelOtherSections,
          total: rowTotal
        });
        
        // Accumulate totals
        totalForLabourFuelMaterialsPlant += mainTotal;
        totalForCement += cement;
        totalForSteelTmt += steelTmt;
        totalForSteelAngleChannel += steelAngleChannel;
        totalForSteelPlates += steelPlates;
        totalForSteelOtherSections += steelOtherSections;
        grandTotal += rowTotal;
      }
    });

    // Create PDF
    const pdf = new jsPDF('landscape', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Define margins
    const marginLeft = 50;
    const marginRight = 50;
    const marginTop = 50;
    const contentWidth = pageWidth - marginLeft - marginRight;

    // Header with Logo and Branding
    let yPosition = marginTop;
    
    // Add logo if enabled and available
    if (brandingSettings.showLogoInReports && brandingSettings.logoUrl) {
      try {
        // Fetch logo image (5s timeout so a slow storage URL can't stall report generation)
        const logoResponse = await fetch(brandingSettings.logoUrl, { signal: AbortSignal.timeout(5000) });
        const logoBlob = await logoResponse.arrayBuffer();
        const logoBase64 = Buffer.from(logoBlob).toString('base64');
        const logoDataUrl = `data:image/png;base64,${logoBase64}`;
        
        // Add logo centered at top
        const logoWidth = 50;
        const logoHeight = 20;
        const logoX = (pageWidth / 2) - (logoWidth / 2);
        pdf.addImage(logoDataUrl, 'PNG', logoX, yPosition - 5, logoWidth, logoHeight);
        yPosition += logoHeight;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
      }
    }
    
    // Convert hex color to RGB for jsPDF
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };
    
    const headerColor = hexToRgb(brandingSettings.reportHeaderColor);
    pdf.setTextColor(headerColor.r, headerColor.g, headerColor.b);
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(brandingSettings.reportHeaderText, pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 20;
    pdf.setTextColor(0, 0, 0); // Reset to black
    pdf.setFontSize(14);
    pdf.text('PRICE VARIATION CALCULATION (PVC) REPORT', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 5;
    pdf.setLineWidth(2);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);

    // Abstract subheader
    yPosition += 25;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ABSTRACT', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 5;
    pdf.setLineWidth(0.5);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);

    // Contract details with proper spacing to avoid overlap
    yPosition += 20;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    
    // Name of Work (with text wrapping for long descriptions)
    pdf.text('Name of Work:', marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    const workDescLines = pdf.splitTextToSize(contract.workDescription, contentWidth - 100);
    pdf.text(workDescLines, marginLeft + 90, yPosition);
    yPosition += (workDescLines.length * 12) + 5;
    
    // Agreement No
    pdf.setFont('helvetica', 'bold');
    pdf.text('Agreement No:', marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(contract.agreementNo, marginLeft + 90, yPosition);
    yPosition += 12;
    
    // Contractor
    pdf.setFont('helvetica', 'bold');
    pdf.text('Contractor:', marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(contract.contractorName, marginLeft + 90, yPosition);
    yPosition += 12;
    
    // Date of Opening
    pdf.setFont('helvetica', 'bold');
    pdf.text('Date of Opening:', marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(format(new Date(contract.dateOfOpening), 'dd MMM yyyy'), marginLeft + 90, yPosition);
    yPosition += 12;
    
    // Base Month
    pdf.setFont('helvetica', 'bold');
    pdf.text('Base Month:', marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(format(new Date(contract.baseMonth), 'MMM yyyy'), marginLeft + 90, yPosition);
    yPosition += 20;

    // Bill-wise abstract in the railway proforma: one row per bill, every component its
    // own column, so the sheet adds up across and down. The three tables this replaced
    // (General / Cement / TMT) kept the steel sections inside "General" while cement and
    // TMT sat apart, so no row ever showed a bill's own total.
    const money = (n: number) => (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const twoDigits = (n: number): string =>
      n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
    /** Indian numbering: crore, lakh, thousand, hundred. */
    const amountInWords = (amount: number): string => {
      const negative = amount < 0;
      let n = Math.abs(Math.round(amount));
      if (n === 0) return 'Rupees Nil';
      const parts: string[] = [];
      const units: Array<[number, string]> = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']];
      for (const [value, label] of units) {
        const count = Math.floor(n / value);
        if (count > 0) { parts.push(`${twoDigits(count)} ${label}`); n -= count * value; }
      }
      if (n > 0) parts.push(twoDigits(n));
      return `Rupees ${parts.join(' ')} only${negative ? ' (recoverable from the contractor)' : ''}`;
    };
    const abstractRows: any[] = [];
    let colLabour = 0, colPlant = 0, colFuel = 0, colMaterial = 0, colSteel = 0, colValue = 0;
    billDataArray.forEach((billData, index) => {
      const steel = billData.steelTmt + billData.steelAngleChannel + billData.steelPlates + billData.steelOtherSections;
      colValue += billData.billAmount;
      colLabour += billData.labour;
      colPlant += billData.plantMachinery;
      colFuel += billData.fuel;
      colMaterial += billData.material;
      colSteel += steel;
      abstractRows.push([
        String(index + 1),
        billData.billNo,
        billData.quarter,
        money(billData.billAmount),
        money(billData.labour),
        money(billData.plantMachinery),
        money(billData.fuel),
        money(billData.cement),
        money(steel),
        money(billData.material),
        money(billData.total),
      ]);
    });
    abstractRows.push([
      '', 'TOTAL', '',
      money(colValue),
      money(colLabour),
      money(colPlant),
      money(colFuel),
      money(totalForCement),
      money(colSteel),
      money(colMaterial),
      money(grandTotal),
    ]);

    autoTable(pdf, {
      head: [['Sl.', 'Bill No.', 'Quarter', 'Value of work (W)', 'Labour', 'P & M', 'Fuel', 'Cement', 'Steel', 'Other materials', 'Total PVC']],
      body: abstractRows,
      startY: yPosition,
      theme: 'grid',
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      headStyles: {
        fillColor: [33, 150, 243],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
        cellPadding: 4,
      },
      bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [0, 0, 0] },
      styles: { lineColor: [120, 120, 120], lineWidth: 0.5, font: 'helvetica', overflow: 'linebreak' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 24 },
        1: { halign: 'left', cellWidth: 'auto', minCellWidth: 70 },
        2: { halign: 'left', cellWidth: 'auto', minCellWidth: 46 },
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
        9: { halign: 'right' }, 10: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: function (data: any) {
        if (data.row.index === abstractRows.length - 1) {
          data.cell.styles.fillColor = [207, 216, 220];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    yPosition = ((pdf as any).lastAutoTable?.finalY ?? yPosition) + 16;

    // The four steel categories price against different JPC baskets, so the single Steel
    // column above is broken out rather than dropped.
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(70, 70, 70);
    pdf.text(
      `Steel comprises  -  TMT bars: ${money(totalForSteelTmt)}   Angle / channel: ${money(totalForSteelAngleChannel)}`
      + `   Plates: ${money(totalForSteelPlates)}   Other sections: ${money(totalForSteelOtherSections)}`,
      marginLeft, yPosition,
    );
    pdf.setTextColor(0, 0, 0);
    yPosition += 24;


    // Grand Total - already calculated above
    const totalSay = Math.round(grandTotal);

    // Add border for grand total box
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(2);
    pdf.rect(marginLeft, yPosition, contentWidth, 45, 'S');
    
    // Inner line separation
    pdf.setLineWidth(0.5);
    pdf.line(marginLeft, yPosition + 22, pageWidth - marginRight, yPosition + 22);
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Total:', marginLeft + 10, yPosition + 15);
    pdf.text(grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }), pageWidth - marginRight - 10, yPosition + 15, { align: 'right' });
    pdf.text('Say:', marginLeft + 10, yPosition + 37);
    pdf.text(totalSay.toLocaleString('en-IN'), pageWidth - marginRight - 10, yPosition + 37, { align: 'right' });
    yPosition += 45;

    // The figure in words, so it cannot be altered after signing without the two
    // disagreeing — a railway money statement always carries both.
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(amountInWords(totalSay), marginLeft, yPosition + 16);
    yPosition += 34;

    // Certification and signatures. This statement goes to an accounts office, and one
    // has already been returned to be "duly signed by the competent authority".
    pdf.setFontSize(9);
    pdf.text(
      pdf.splitTextToSize(
        'Certified that the price variation shown above has been calculated as per the conditions of the '
        + 'contract and the indices published by the competent authority.',
        contentWidth,
      ),
      marginLeft, yPosition,
    );
    yPosition += 46;

    const signWidth = contentWidth / 3;
    ['Prepared by', 'Checked by', 'Accepted by'].forEach((role, i) => {
      const x = marginLeft + i * signWidth;
      pdf.setLineWidth(0.5);
      pdf.line(x, yPosition, x + signWidth - 24, yPosition);
      pdf.setFontSize(8);
      pdf.setTextColor(90, 90, 90);
      pdf.text(role, x, yPosition + 11);
    });
    pdf.setTextColor(0, 0, 0);

    // Add footer to all pages if footer text is provided
    if (brandingSettings.reportFooterText) {
      const pageCount = pdf.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        
        // Add footer text
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont("helvetica", "normal");
        
        // Footer text centered at bottom
        const footerY = pageHeight - 20;
        const footerLines = pdf.splitTextToSize(brandingSettings.reportFooterText, contentWidth);
        pdf.text(footerLines, pageWidth / 2, footerY, { align: 'center' });
        
        // Page number at bottom right
        pdf.setFontSize(8);
        pdf.text(`Page ${i} of ${pageCount}`, pageWidth - marginRight, pageHeight - 10, { align: 'right' });
      }
    }

    // Convert to buffer
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Abstract_${contract.agreementNo}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error: any) {
    console.error('Error generating abstract PDF:', error);
    console.error('Stack trace:', error?.stack);
    return NextResponse.json(
      { 
        error: 'Failed to generate abstract PDF',
        details: error?.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}
