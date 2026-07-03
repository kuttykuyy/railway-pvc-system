
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

    // TABLE 1: General Classifications (Labour, Fuel, Materials, Plant & Machinery + Non-TMT Steel)
    const generalTableData: any[] = [];
    billDataArray.forEach(billData => {
      const generalTotal = billData.labour + billData.material + billData.fuel + billData.plantMachinery + 
                          billData.steelAngleChannel + billData.steelPlates + billData.steelOtherSections;
      generalTableData.push([
        billData.quarter,
        billData.billNo,
        billData.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.labour.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.material.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.fuel.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.plantMachinery.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.steelAngleChannel.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.steelPlates.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        billData.steelOtherSections.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        generalTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })
      ]);
    });

    // Add column totals for general table
    const totalForGeneralClassifications = totalForLabourFuelMaterialsPlant + totalForSteelAngleChannel + totalForSteelPlates + totalForSteelOtherSections;
    generalTableData.push([
      'COLUMN TOTALS',
      '',
      billDataArray.reduce((sum, row) => sum + row.billAmount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      billDataArray.reduce((sum, row) => sum + row.labour, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      billDataArray.reduce((sum, row) => sum + row.material, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      billDataArray.reduce((sum, row) => sum + row.fuel, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      billDataArray.reduce((sum, row) => sum + row.plantMachinery, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      totalForSteelAngleChannel.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      totalForSteelPlates.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      totalForSteelOtherSections.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      totalForGeneralClassifications.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    // Section header for General Classifications
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('GENERAL CLASSIFICATIONS', marginLeft, yPosition);
    yPosition += 15;

    // Table 1: General Classifications
    autoTable(pdf, {
      head: [['Quarter', 'Bill No', 'Bill Amount', 'Labour', 'Material', 'Fuel', 'Plant Machinery', 'Angle/Channel', 'Plates', 'Other Sections', 'Total']],
      body: generalTableData,
      startY: yPosition,
      theme: 'grid',
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      headStyles: { 
        fillColor: [33, 150, 243], // Blue background
        textColor: [255, 255, 255], // White text
        fontSize: 8,
        fontStyle: 'bold',
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        cellPadding: 3,
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 7,
        textColor: [0, 0, 0],
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 'auto', overflow: 'linebreak', halign: 'left', minCellWidth: 35 }, // Quarter
        1: { cellWidth: 'auto', overflow: 'linebreak', halign: 'left', minCellWidth: 65 }, // Bill No
        2: { halign: 'right', cellWidth: 'auto', minCellWidth: 55 }, // Bill Amount
        3: { halign: 'right', cellWidth: 'auto', minCellWidth: 50 }, // Labour
        4: { halign: 'right', cellWidth: 'auto', minCellWidth: 50 }, // Material
        5: { halign: 'right', cellWidth: 'auto', minCellWidth: 45 }, // Fuel
        6: { halign: 'right', cellWidth: 'auto', minCellWidth: 55 }, // Plant Machinery
        7: { halign: 'right', cellWidth: 'auto', minCellWidth: 50 }, // Angle/Channel
        8: { halign: 'right', cellWidth: 'auto', minCellWidth: 45 }, // Plates
        9: { halign: 'right', cellWidth: 'auto', minCellWidth: 50 }, // Other Sections
        10: { halign: 'right', fontStyle: 'bold', cellWidth: 'auto', minCellWidth: 55 } // Total
      },
      didParseCell: function(data: any) {
        // Highlight total row
        if (data.row.index === generalTableData.length - 1) {
          data.cell.styles.fillColor = [187, 222, 251]; // Light blue
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.lineWidth = 1;
        }
      }
    });

    yPosition = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 25 : yPosition + 200;

    // TABLE 2: Cement Components
    const cementTableData: any[] = [];
    billDataArray.forEach(billData => {
      cementTableData.push([
        billData.quarter,
        billData.billNo,
        billData.cement.toLocaleString('en-IN', { maximumFractionDigits: 2 })
      ]);
    });

    // Add total row for cement
    cementTableData.push([
      'TOTAL FOR CEMENT',
      '',
      totalForCement.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    // Section header for Cement Components
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CEMENT COMPONENTS', marginLeft, yPosition);
    yPosition += 15;

    // Table 2: Cement Components
    autoTable(pdf, {
      head: [['Quarter', 'Bill No', 'Cement PVC']],
      body: cementTableData,
      startY: yPosition,
      theme: 'grid',
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      headStyles: { 
        fillColor: [255, 152, 0], // Orange background
        textColor: [255, 255, 255], // White text
        fontSize: 9,
        fontStyle: 'bold',
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        cellPadding: 4,
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 8,
        textColor: [0, 0, 0],
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 'auto', overflow: 'linebreak', halign: 'left', minCellWidth: 60 }, // Quarter
        1: { cellWidth: 'auto', overflow: 'linebreak', halign: 'left', minCellWidth: 120 }, // Bill No
        2: { halign: 'right', cellWidth: 'auto', minCellWidth: 80 } // Cement PVC
      },
      didParseCell: function(data: any) {
        // Highlight total row
        if (data.row.index === cementTableData.length - 1) {
          data.cell.styles.fillColor = [255, 224, 178]; // Light orange
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.lineWidth = 1;
        }
      }
    });

    yPosition = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 25 : yPosition + 200;

    // TABLE 3: TMT Steel Components
    const steelTableData: any[] = [];
    billDataArray.forEach(billData => {
      steelTableData.push([
        billData.quarter,
        billData.billNo,
        billData.steelTmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })
      ]);
    });

    // Add total row for TMT steel
    steelTableData.push([
      'TOTAL FOR TMT STEEL',
      '',
      totalForSteelTmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    // Section header for TMT Steel Components
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TMT STEEL COMPONENTS', marginLeft, yPosition);
    yPosition += 15;

    // Table 3: TMT Steel Components
    autoTable(pdf, {
      head: [['Quarter', 'Bill No', 'TMT Bars PVC']],
      body: steelTableData,
      startY: yPosition,
      theme: 'grid',
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      headStyles: { 
        fillColor: [96, 125, 139], // Grey background
        textColor: [255, 255, 255], // White text
        fontSize: 9,
        fontStyle: 'bold',
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        cellPadding: 4,
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 8,
        textColor: [0, 0, 0],
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 'auto', overflow: 'linebreak', halign: 'left', minCellWidth: 60 }, // Quarter
        1: { cellWidth: 'auto', overflow: 'linebreak', halign: 'left', minCellWidth: 120 }, // Bill No
        2: { halign: 'right', cellWidth: 'auto', minCellWidth: 80 } // TMT Bars PVC
      },
      didParseCell: function(data: any) {
        // Highlight total row
        if (data.row.index === steelTableData.length - 1) {
          data.cell.styles.fillColor = [207, 216, 220]; // Light grey
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.lineWidth = 1;
        }
      }
    });

    yPosition = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 30 : yPosition + 200;

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
