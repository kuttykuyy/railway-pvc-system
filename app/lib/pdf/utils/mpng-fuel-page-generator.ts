import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { format, parse } from 'date-fns';

interface MPNGFuelAverageData {
  average: number;
  monthlyValues: Array<{ 
    month: string; 
    value: number;
    dailyPrices: Array<{ 
      date: string; 
      delhi: number;
      mumbai: number;
      chennai: number;
      kolkata: number;
      average: number;
    }>;
  }>;
  totalMonths: number;
  sum: number;
  startDate: Date;
  endDate: Date;
  billNo: string;
  contractNo: string;
  dataSource?: 'ppac' | 'index';
  fuelBasis?: 'four_city_avg' | 'zone_city';
  cityName?: string;
}

/**
 * Generate a PDF with MPNG Fuel average calculations
 * Shows monthly index values and references attached MPNG Fuel Component Index documents for city-wise details
 */
export async function generateMPNGFuelAveragePage(
  mainPdfBytes: Uint8Array,
  data: MPNGFuelAverageData
): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(mainPdfBytes);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Define colors
    const headerColor = rgb(0.2, 0.4, 0.6);
    const textColor = rgb(0, 0, 0);
    const tableHeaderColor = rgb(0.9, 0.9, 0.95);
    const tableBorderColor = rgb(0.7, 0.7, 0.7);
    const alternateRowColor = rgb(0.98, 0.98, 0.98);
    const highlightColor = rgb(0.95, 0.97, 1);
    const referenceBoxColor = rgb(0.98, 0.95, 0.88);
    const referenceTextColor = rgb(0.5, 0.35, 0.1);

    // Add page
    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    let yPosition = page.getHeight() - 50;

    // Title - reflect fuel basis
    const isZoneCity = data.fuelBasis === 'zone_city' && data.cityName;
    const titleText = isZoneCity
      ? `MPNG FUEL PRICE INDEX (${data.cityName!.toUpperCase()}) - AVERAGE CALCULATION`
      : 'MPNG FUEL PRICE INDEX - AVERAGE CALCULATION';
    page.drawText(titleText, {
      x: 50,
      y: yPosition,
      size: isZoneCity ? 15 : 18,
      font: boldFont,
      color: headerColor,
    });

    yPosition -= 30;

    // Bill and Contract Information
    page.drawText(`Bill No: ${data.billNo}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: textColor,
    });

    page.drawText(`Contract No: ${data.contractNo}`, {
      x: 300,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: textColor,
    });

    yPosition -= 20;

    // Period
    page.drawText(
      `Period: ${format(data.startDate, 'MMM yyyy')} to ${format(data.endDate, 'MMM yyyy')}`,
      {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: textColor,
      }
    );

    yPosition -= 35;

    // Reference box for MPNG Fuel Component Index Documents
    const refBoxHeight = 55;
    page.drawRectangle({
      x: 50,
      y: yPosition - refBoxHeight,
      width: 495,
      height: refBoxHeight,
      color: referenceBoxColor,
      borderColor: rgb(0.7, 0.55, 0.25),
      borderWidth: 1.5,
    });

    page.drawText('REFERENCE: MPNG Fuel Component Index Documents', {
      x: 60,
      y: yPosition - 18,
      size: 11,
      font: boldFont,
      color: referenceTextColor,
    });

    const refDetailText = isZoneCity
      ? `Diesel prices for ${data.cityName} (zone city basis) are available in the`
      : 'City-wise daily petrol prices (Delhi, Mumbai, Chennai, Kolkata) are available in the';
    page.drawText(refDetailText, {
      x: 60,
      y: yPosition - 33,
      size: 9,
      font: regularFont,
      color: referenceTextColor,
    });

    page.drawText('MPNG Fuel Component Index documents attached at the end of this report.', {
      x: 60,
      y: yPosition - 46,
      size: 9,
      font: boldFont,
      color: referenceTextColor,
    });

    yPosition -= refBoxHeight + 25;

    // Overall Average Box
    const boxWidth = 495;
    const boxHeight = 80;
    const boxX = 50;
    const boxY = yPosition - boxHeight;

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: highlightColor,
      borderColor: headerColor,
      borderWidth: 2,
    });

    const overallLabel = isZoneCity
      ? `MPNG FUEL INDEX AVERAGE (${data.cityName!.toUpperCase()}):`
      : 'OVERALL MPNG FUEL INDEX AVERAGE:';
    page.drawText(overallLabel, {
      x: boxX + 20,
      y: boxY + boxHeight - 25,
      size: 12,
      font: boldFont,
      color: textColor,
    });

    page.drawText(`${data.average.toFixed(2)}`, {
      x: boxX + 20,
      y: boxY + boxHeight - 52,
      size: 28,
      font: boldFont,
      color: headerColor,
    });

    page.drawText(`Based on ${data.totalMonths} month${data.totalMonths > 1 ? 's' : ''} of index data`, {
      x: boxX + 20,
      y: boxY + 12,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });

    yPosition = boxY - 30;

    // Monthly Index Values Table
    page.drawText('MONTHLY MPNG FUEL INDEX VALUES', {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: headerColor,
    });

    yPosition -= 20;

    // Table setup
    const tableX = 50;
    const tableWidth = 350;
    const colWidths = [60, 150, 140]; // S.No, Month, Index Value
    const rowHeight = 22;

    // Table header
    page.drawRectangle({
      x: tableX,
      y: yPosition - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: tableHeaderColor,
    });

    page.drawLine({
      start: { x: tableX, y: yPosition },
      end: { x: tableX + tableWidth, y: yPosition },
      thickness: 1.5,
      color: tableBorderColor,
    });

    // Header text
    const headers = ['S.No', 'Month', 'Index Value'];
    let headerX = tableX;
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: headerX + 10,
        y: yPosition - 15,
        size: 10,
        font: boldFont,
        color: textColor,
      });
      if (i < headers.length - 1) {
        page.drawLine({
          start: { x: headerX + colWidths[i], y: yPosition },
          end: { x: headerX + colWidths[i], y: yPosition - rowHeight },
          thickness: 0.5,
          color: tableBorderColor,
        });
      }
      headerX += colWidths[i];
    }

    yPosition -= rowHeight;

    page.drawLine({
      start: { x: tableX, y: yPosition },
      end: { x: tableX + tableWidth, y: yPosition },
      thickness: 1.5,
      color: tableBorderColor,
    });

    // Data rows
    for (let i = 0; i < data.monthlyValues.length; i++) {
      const monthData = data.monthlyValues[i];
      const monthDate = parse(monthData.month, 'yyyy-MM', new Date());
      const formattedMonth = format(monthDate, 'MMMM yyyy');

      // Check for page break
      if (yPosition < 150) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPosition = page.getHeight() - 50;

        page.drawText('MONTHLY MPNG FUEL INDEX VALUES (Continued)', {
          x: 50,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: headerColor,
        });
        yPosition -= 25;
      }

      // Alternate row background
      if (i % 2 === 0) {
        page.drawRectangle({
          x: tableX,
          y: yPosition - rowHeight,
          width: tableWidth,
          height: rowHeight,
          color: alternateRowColor,
        });
      }

      // Row data
      let cellX = tableX;
      const values = [
        (i + 1).toString(),
        formattedMonth,
        monthData.value.toFixed(2),
      ];

      for (let j = 0; j < values.length; j++) {
        page.drawText(values[j], {
          x: cellX + 10,
          y: yPosition - 15,
          size: j === 2 ? 11 : 10, // Larger font for index value
          font: j === 2 ? boldFont : regularFont,
          color: textColor,
        });
        if (j < values.length - 1) {
          page.drawLine({
            start: { x: cellX + colWidths[j], y: yPosition },
            end: { x: cellX + colWidths[j], y: yPosition - rowHeight },
            thickness: 0.5,
            color: tableBorderColor,
          });
        }
        cellX += colWidths[j];
      }

      // Horizontal line
      page.drawLine({
        start: { x: tableX, y: yPosition - rowHeight },
        end: { x: tableX + tableWidth, y: yPosition - rowHeight },
        thickness: 0.5,
        color: tableBorderColor,
      });

      yPosition -= rowHeight;
    }

    // Table border
    page.drawRectangle({
      x: tableX,
      y: yPosition,
      width: tableWidth,
      height: (data.monthlyValues.length + 1) * rowHeight,
      borderColor: tableBorderColor,
      borderWidth: 1.5,
    });

    yPosition -= 35;

    // Calculation Section
    page.drawText('CALCULATION', {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: headerColor,
    });

    yPosition -= 22;

    page.drawText('Formula: Average = Sum of all monthly index values / Number of months', {
      x: 50,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: textColor,
    });

    yPosition -= 25;

    // Sum of monthly values
    const monthlyValuesStr = data.monthlyValues.map(m => m.value.toFixed(2)).join(' + ');
    
    page.drawText('Sum of Monthly Index Values:', {
      x: 50,
      y: yPosition,
      size: 10,
      font: boldFont,
      color: textColor,
    });

    yPosition -= 16;

    // If too many months, show abbreviated version
    if (data.monthlyValues.length > 6) {
      const firstThree = data.monthlyValues.slice(0, 3).map(m => m.value.toFixed(2)).join(' + ');
      const lastThree = data.monthlyValues.slice(-3).map(m => m.value.toFixed(2)).join(' + ');
      page.drawText(`${firstThree} + ... + ${lastThree} = ${data.sum.toFixed(2)}`, {
        x: 70,
        y: yPosition,
        size: 10,
        font: regularFont,
        color: textColor,
      });
    } else {
      page.drawText(`${monthlyValuesStr} = ${data.sum.toFixed(2)}`, {
        x: 70,
        y: yPosition,
        size: 10,
        font: regularFont,
        color: textColor,
      });
    }

    yPosition -= 22;

    page.drawText('Number of Months:', {
      x: 50,
      y: yPosition,
      size: 10,
      font: boldFont,
      color: textColor,
    });

    page.drawText(`${data.totalMonths}`, {
      x: 180,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: textColor,
    });

    yPosition -= 22;

    // Divider
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: 350, y: yPosition },
      thickness: 1,
      color: tableBorderColor,
    });

    yPosition -= 18;

    // Final calculation
    const finalCalcLabel = isZoneCity
      ? `MPNG Fuel Index Average (${data.cityName}):`
      : 'MPNG Fuel Index Average:';
    page.drawText(finalCalcLabel, {
      x: 50,
      y: yPosition,
      size: 11,
      font: boldFont,
      color: textColor,
    });

    yPosition -= 18;

    page.drawText(`${data.sum.toFixed(2)} / ${data.totalMonths} = `, {
      x: 70,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: textColor,
    });

    page.drawText(`${data.average.toFixed(2)}`, {
      x: 200,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: headerColor,
    });

    yPosition -= 45;

    // Methodology note
    page.drawText('Methodology Note:', {
      x: 50,
      y: yPosition,
      size: 10,
      font: boldFont,
      color: textColor,
    });

    yPosition -= 15;

    const notes = isZoneCity
      ? [
          `- The MPNG Fuel Index values shown above are for ${data.cityName} (zone city basis).`,
          `- Daily diesel prices for ${data.cityName} from PPAC are available`,
          '  in the attached MPNG Fuel Component Index documents at the end of this report.',
          '- The monthly average is calculated as per the Railway Board\'s PVC clause methodology.',
          '- Overall average = Sum of monthly index values / Number of months in the period.',
        ]
      : [
          '- The MPNG Fuel Index values shown above are sourced from the MPNG Fuel Component Index.',
          '- City-wise daily petrol prices (Delhi, Mumbai, Chennai, Kolkata) from PPAC are available',
          '  in the attached MPNG Fuel Component Index documents at the end of this report.',
          '- The monthly average is calculated as per the Railway Board\'s PVC clause methodology.',
          '- Overall average = Sum of monthly index values / Number of months in the period.',
        ];

    for (const note of notes) {
      page.drawText(note, {
        x: 50,
        y: yPosition,
        size: 8,
        font: regularFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= 12;
    }

    return await pdfDoc.save();
  } catch (error) {
    console.error('Error generating MPNG Fuel average page:', error);
    return mainPdfBytes;
  }
}
