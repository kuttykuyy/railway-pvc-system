import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Utility function for formatting numbers in Indian format
function formatIndianNumber(num: number, decimals: number = 2): string {
  try {
    const [integerPart, decimalPart] = num.toFixed(decimals).split('.');
    const lastThree = integerPart.slice(-3);
    const otherDigits = integerPart.slice(0, -3);
    const formattedInteger = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + 
                             (otherDigits ? ',' : '') + lastThree;
    return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  } catch (error) {
    // Fallback to simple formatting
    return num.toFixed(decimals);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { baseMonth, baseMonthDisplay, billResults, indicesData } = body;

    // Validation and logging
    console.log('[PDF Export] Received request:', {
      baseMonth,
      baseMonthDisplay,
      billResultsCount: billResults?.length,
      indicesDataCount: indicesData?.length,
      hasBillResults: !!billResults,
      hasIndicesData: !!indicesData
    });

    if (!billResults || billResults.length === 0) {
      console.error('[PDF Export] No bill results provided');
      return NextResponse.json({ error: 'No bill results to export' }, { status: 400 });
    }

    // Validate each bill result structure
    for (let i = 0; i < billResults.length; i++) {
      const bill = billResults[i];
      console.log(`[PDF Export] Validating Bill ${i}:`, {
        hasBillId: !!bill.billId,
        hasAmount: !!bill.amount,
        amountType: typeof bill.amount,
        hasMeasurementDate: !!bill.measurementDate,
        hasResults: !!bill.results,
        resultsCount: bill.results?.length
      });

      if (!bill.billId || bill.amount === undefined || bill.amount === null) {
        console.error(`[PDF Export] Invalid bill structure at index ${i}:`, bill);
        return NextResponse.json({ 
          error: `Invalid bill data at index ${i}: missing billId or amount` 
        }, { status: 400 });
      }

      if (!bill.results || !Array.isArray(bill.results)) {
        console.error(`[PDF Export] Missing or invalid results for bill ${bill.billId}`);
        return NextResponse.json({ 
          error: `No comparison results for bill ${bill.billId}` 
        }, { status: 400 });
      }
    }

    // Create a new PDF document
    console.log('[PDF Export] Creating PDF document');
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add title page
    let page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    let yPosition = height - 50;

    console.log('[PDF Export] Drawing title page');

    // Title
    page.drawText('PVC Work Classification Comparison Report', {
      x: 50,
      y: yPosition,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= 30;

    // Report info
    const baseMonthText = baseMonthDisplay || baseMonth || 'N/A';
    page.drawText(`Base Month: ${baseMonthText}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 20;

    // Use ISO format for consistency (avoids locale issues on server)
    const generatedDate = new Date().toISOString().split('T')[0] + ' ' + 
                          new Date().toISOString().split('T')[1].split('.')[0];
    page.drawText(`Generated: ${generatedDate}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 40;

    // Indices Summary
    if (indicesData && indicesData.length > 0) {
      page.drawText('Price Indices Summary', {
        x: 50,
        y: yPosition,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      yPosition -= 25;

      for (const indexData of indicesData) {
        if (yPosition < 100) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
        }

        page.drawText(`${indexData.componentName}:`, {
          x: 60,
          y: yPosition,
          size: 11,
          font: boldFont,
        });
        yPosition -= 15;

        page.drawText(`  Base: ${indexData.baseIndex.toFixed(2)} | Average: ${indexData.averageIndex.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font,
        });
        yPosition -= 20;
      }
      yPosition -= 20;
    }

    // Bill Results
    console.log('[PDF Export] Processing bill results, count:', billResults.length);
    for (let billIndex = 0; billIndex < billResults.length; billIndex++) {
      const billResult = billResults[billIndex];
      console.log(`[PDF Export] Processing bill ${billIndex + 1}/${billResults.length}:`, {
        billId: billResult.billId,
        amount: billResult.amount,
        resultsCount: billResult.results?.length
      });

      try {
        if (yPosition < 200) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
        }

        // Bill header - safe access with fallbacks
        const billIdText = billResult.billId || `Bill ${billIndex + 1}`;
        page.drawText(`Bill #${billIdText}`, {
          x: 50,
          y: yPosition,
          size: 16,
          font: boldFont,
          color: rgb(0, 0, 0.5),
        });
        yPosition -= 20;

        // Safely format amount
        const amountValue = typeof billResult.amount === 'number' 
          ? billResult.amount 
          : parseFloat(billResult.amount) || 0;
        const amountText = `₹${formatIndianNumber(amountValue)}`;
        const dateText = billResult.measurementDate || 'N/A';
        
        page.drawText(`Amount: ${amountText} | Date: ${dateText}`, {
          x: 60,
          y: yPosition,
          size: 11,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= 30;

        // Classification results
        const sortedResults = (billResult.results || []).sort((a: any, b: any) => 
          (b.totalPvc || 0) - (a.totalPvc || 0)
        );
        
        console.log(`[PDF Export] Bill ${billIdText}: Processing ${sortedResults.length} classifications`);

        for (let i = 0; i < sortedResults.length; i++) {
          const result = sortedResults[i];
          console.log(`[PDF Export] Processing classification ${i + 1}/${sortedResults.length}:`, {
            code: result.classification?.code,
            totalPvc: result.totalPvc
          });
          
          if (yPosition < 100) {
            page = pdfDoc.addPage([595, 842]);
            yPosition = height - 50;
          }

          const isBest = i === 0;
          const isWorst = i === sortedResults.length - 1;

          // Classification header - safe access
          const classificationCode = result.classification?.code || 'Unknown';
          const statusLabel = isBest ? ' [BEST]' : isWorst ? ' [WORST]' : '';
          page.drawText(`#${i + 1} - ${classificationCode}${statusLabel}`, {
            x: 70,
            y: yPosition,
            size: 12,
            font: boldFont,
            color: isBest ? rgb(0, 0.5, 0) : isWorst ? rgb(0.7, 0, 0) : rgb(0, 0, 0),
          });
          yPosition -= 15;

          // Sub-classification name
          const subClassificationName = result.classification?.subClassification || 
                                        result.classification?.name || 
                                        'Unknown';
          page.drawText(subClassificationName, {
            x: 80,
            y: yPosition,
            size: 10,
            font,
            color: rgb(0.4, 0.4, 0.4),
          });
          yPosition -= 15;

          // Total PVC - safe access
          const totalPvc = result.totalPvc || 0;
          const pvcColor = totalPvc >= 0 ? rgb(0, 0.5, 0) : rgb(0.7, 0, 0);
          const pvcText = `₹${formatIndianNumber(totalPvc)}`;
          page.drawText(`Total PVC: ${pvcText}`, {
            x: 80,
            y: yPosition,
            size: 11,
            font: boldFont,
            color: pvcColor,
          });
          yPosition -= 20;

          // Component breakdown (showing only non-zero components)
          const components = ['labour', 'steel', 'cement', 'plantMachinery', 'fuel', 'otherMaterials', 'explosives'];
          const componentLabels: Record<string, string> = {
            labour: 'Labour',
            steel: 'Steel',
            cement: 'Cement',
            plantMachinery: 'Plant & Machinery',
            fuel: 'Fuel & Power',
            otherMaterials: 'Other Materials',
            explosives: 'Explosives'
          };

          const componentPvcs = result.componentPvcs || {};
          const componentPercentages = result.classification?.componentPercentages || {};

          for (const comp of components) {
            const pvc = componentPvcs[comp] || 0;
            const percent = componentPercentages[comp] || 0;
            
            if (percent > 0) {
              if (yPosition < 50) {
                page = pdfDoc.addPage([595, 842]);
                yPosition = height - 50;
              }

              const pvcText = `₹${formatIndianNumber(pvc)}`;
              const componentText = `  ${componentLabels[comp]} (${percent}%): ${pvcText}`;
              
              page.drawText(componentText, {
                x: 90,
                y: yPosition,
                size: 9,
                font,
                color: pvc >= 0 ? rgb(0, 0.4, 0) : rgb(0.6, 0, 0),
              });
              yPosition -= 12;
            }
          }
          yPosition -= 15;
        }
        yPosition -= 20;
      } catch (billError) {
        console.error(`[PDF Export] Error processing bill ${billResult.billId}:`, billError);
        // Continue with next bill instead of failing entirely
        if (yPosition < 100) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
        }
        page.drawText(`Error processing bill ${billResult.billId || billIndex + 1}`, {
          x: 50,
          y: yPosition,
          size: 12,
          font,
          color: rgb(0.7, 0, 0),
        });
        yPosition -= 30;
      }
    }

    // Generate PDF bytes
    console.log('[PDF Export] Saving PDF document');
    const pdfBytes = await pdfDoc.save();
    console.log('[PDF Export] PDF generated successfully, size:', pdfBytes.length, 'bytes');

    // Safe filename generation
    const safeBaseMonth = (baseMonth || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `PVC_Comparison_${safeBaseMonth}.pdf`;

    // Return PDF
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('[PDF Export] Error generating PDF:', error);
    console.error('[PDF Export] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[PDF Export] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
