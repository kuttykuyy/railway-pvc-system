import { logger } from '@/lib/logger';

import { jsPDF } from 'jspdf';

interface CoveringLetterData {
  // TO Section
  toDesignation: string;
  toOrganization: string;
  toDivision: string;
  
  // Subject
  workDescription: string;
  
  // Reference
  loaNumber: string;
  loaDate: string;
  agreementNumber: string;
  
  // Bill details
  billNumber: string;
  billAmount: string;
  
  // Company details
  companyName: string;
  companyGSTIN: string;
  
  // Additional
  date?: string;
  signatory?: string;
  bodyText?: string;
  /** Base month (T0) and the quarter(s) covered. The first two things an accounts
   *  office checks, and the letter never stated either. */
  baseMonth?: string;
  quarters?: string;
  /** Signed amount. billAmount is a formatted string, so the sign cannot be read back
   *  from it — a recovery must not be submitted "for early payment". */
  netPvcAmount?: number;
}

/**
 * Helper function for proper text justification
 * jsPDF's built-in justify doesn't work well, so we implement our own
 */
function justifyText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, isLastLine: boolean = false): number {
  // If it's the last line or text is too short, just align left
  if (isLastLine || text.trim().length < maxWidth / 3) {
    doc.text(text, x, y);
    return y;
  }

  const words = text.trim().split(' ');
  if (words.length === 1) {
    doc.text(text, x, y);
    return y;
  }

  // Calculate the width of all text without spaces
  const textWidth = doc.getTextWidth(words.join(''));
  
  // Calculate how much space we need to distribute
  const spaceToDistribute = maxWidth - textWidth;
  const spaceWidth = spaceToDistribute / (words.length - 1);
  
  // Only justify if the space distribution is reasonable (not too stretched)
  if (spaceWidth < 0 || spaceWidth > 10) {
    doc.text(text, x, y);
    return y;
  }

  // Draw each word with calculated spacing
  let currentX = x;
  words.forEach((word, index) => {
    doc.text(word, currentX, y);
    if (index < words.length - 1) {
      currentX += doc.getTextWidth(word) + spaceWidth;
    }
  });

  return y;
}

export async function generateCoveringLetter(data: CoveringLetterData): Promise<Buffer> {
  try {
    logger.log('PDF Generator: Starting PDF generation');
    logger.log('PDF Generator: Data received:', {
      companyName: data.companyName,
      billNumber: data.billNumber,
      billAmount: data.billAmount
    });

    // Validate required data
    if (!data.companyName || data.companyName === 'Company Name') {
      logger.warn('⚠ PDF Generator: Company name is missing or default');
    }
    if (!data.billNumber) {
      logger.warn('⚠ PDF Generator: Bill number is missing');
    }
    if (!data.billAmount) {
      logger.warn('⚠ PDF Generator: Bill amount is missing');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    logger.log('✓ PDF Generator: jsPDF instance created');

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    const lineHeight = 6; // Consistent line height
    // A variation can fall as well as rise, and the wording differs throughout —
    // subject line included. Decided once, up front.
    const isRecovery = typeof data.netPvcAmount === 'number' && data.netPvcAmount < 0;

    // Increased top spacing for letterhead printing (70mm from top)
    // Date (top right, aligned properly)
    const currentDate = data.date || new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    const dateText = `Date: ${currentDate}`;
    const dateWidth = doc.getTextWidth(dateText);
    doc.text(dateText, pageWidth - margin - dateWidth, 70);

    let yPos = 82;

    // TO Section with better formatting
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('To:', margin, yPos);
    
    // Underline "To:"
    const toWidth = doc.getTextWidth('To:');
    doc.setLineWidth(0.3);
    doc.line(margin, yPos + 0.5, margin + toWidth, yPos + 0.5);
    
    yPos += lineHeight + 1;
    doc.setFont('helvetica', 'normal');
    
    // Recipient details with proper indentation
    const indent = 5;
    doc.text(data.toDesignation, margin + indent, yPos);
    yPos += lineHeight;
    
    doc.text(data.toOrganization, margin + indent, yPos);
    yPos += lineHeight;
    
    doc.text(data.toDivision, margin + indent, yPos);
    yPos += lineHeight + 6; // Extra space after TO section

    // Subject Section with underline
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    
    // Subject label with underline
    const subLabel = 'Sub:';
    doc.text(subLabel, margin, yPos);
    const subLabelWidth = doc.getTextWidth(subLabel);
    doc.line(margin, yPos + 0.5, margin + subLabelWidth, yPos + 0.5);
    
    yPos += lineHeight;
    
    // Subject content with proper wrapping and justification
    doc.setFont('helvetica', 'normal');
    const subjectText = `${data.workDescription} - ${isRecovery ? 'Recovery of Price Variation' : 'Payment for PVC Bill'}-Reg`;
    const subjectLines = doc.splitTextToSize(subjectText, contentWidth - indent);
    
    subjectLines.forEach((line: string, index: number) => {
      const isLastLine = index === subjectLines.length - 1;
      justifyText(doc, line, margin + indent, yPos, contentWidth - indent, isLastLine);
      yPos += lineHeight;
    });
    
    yPos += 4; // Space after subject

    // Reference Section with underline
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    
    const refLabel = 'Ref:';
    doc.text(refLabel, margin, yPos);
    const refLabelWidth = doc.getTextWidth(refLabel);
    doc.line(margin, yPos + 0.5, margin + refLabelWidth, yPos + 0.5);
    
    yPos += lineHeight + 1;
    
    // Reference items with proper formatting
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    
    // LOA reference
    const loaRef = `i)   LOA No: ${data.loaNumber} dt: ${data.loaDate}`;
    const loaLines = doc.splitTextToSize(loaRef, contentWidth - indent);
    loaLines.forEach((line: string) => {
      doc.text(line, margin + indent, yPos);
      yPos += lineHeight;
    });
    
    yPos += 1; // Small gap between reference items
    
    // Agreement reference
    const agtRef = `ii)  Agt No: ${data.agreementNumber}`;
    const agtLines = doc.splitTextToSize(agtRef, contentWidth - indent);
    agtLines.forEach((line: string) => {
      doc.text(line, margin + indent, yPos);
      yPos += lineHeight;
    });
    
    yPos += 8; // Extra space before body

    // Body Text with proper justification
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    
    // Check if multiple bills (comma-separated bill numbers)
    const billNumbers = data.billNumber.split(',').map(b => b.trim()).filter(Boolean);
    const isMultipleBills = billNumbers.length > 1;
    
    const forWhich = isMultipleBills
      ? `the following ${billNumbers.length} bills`
      : data.billNumber;
    const period = [
      data.baseMonth ? `base month ${data.baseMonth}` : '',
      data.quarters ? `quarter${data.quarters.includes(',') ? 's' : ''} ${data.quarters}` : '',
    ].filter(Boolean).join(', ');

    let bodyText: string;
    if (data.bodyText) {
      bodyText = data.bodyText;
    } else if (isRecovery) {
      bodyText = `In connection with the subject work, the price variation has been worked out under Clause 46A of the `
        + `Indian Railways General Conditions of Contract, 2022 for ${forWhich}`
        + `${period ? ` (${period})` : ''}. As the published indices for the quarter${billNumbers.length > 1 ? 's' : ''} `
        + `under consideration are below those of the base month, the variation is a net recovery of `
        + `Rs.${data.billAmount} from the contractor. The calculation sheets, the abstract statement and the `
        + `supporting index publications are enclosed for verification and for arranging the recovery at your end.`;
    } else {
      bodyText = `In connection with the subject work, the price variation has been worked out under Clause 46A of the `
        + `Indian Railways General Conditions of Contract, 2022 for ${forWhich}`
        + `${period ? ` (${period})` : ''}, and amounts to Rs.${data.billAmount}. The calculation sheets, the abstract `
        + `statement and the supporting index publications are enclosed. It is requested that the amount may kindly `
        + `be verified and passed for payment.`;
    }
    
    const bodyLines = doc.splitTextToSize(bodyText, contentWidth);
    
    bodyLines.forEach((line: string, index: number) => {
      const isLastLine = index === bodyLines.length - 1;
      justifyText(doc, line, margin, yPos, contentWidth, isLastLine);
      yPos += lineHeight;
    });
    
    // For multiple bills, render a numbered list of bill numbers below the paragraph
    if (isMultipleBills) {
      yPos += 4; // Space before bill list
      
      doc.setFont('helvetica', 'bold');
      doc.text('Bill Details:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += lineHeight + 1;
      
      billNumbers.forEach((billNo, index) => {
        // Check if we need a new page
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = 30;
        }
        const listItem = `${index + 1}.  ${billNo}`;
        const itemLines = doc.splitTextToSize(listItem, contentWidth - indent);
        itemLines.forEach((line: string, lineIdx: number) => {
          doc.text(line, margin + indent, yPos);
          yPos += lineHeight;
        });
      });
    }
    
    yPos += 8;

    // Enclosures. The body names the documents but never itemised them, so the receiving
    // office had no list to check the file against — the first thing that goes wrong when
    // a proposal is passed between hands.
    // Reserve what the enclosures, the closing and the signature block actually need.
    // Reserving more than that pushed a one-page letter onto two, leaving page two
    // carrying nothing but "Encl" and a signature.
    if (yPos > pageHeight - 88) {
      doc.addPage();
      yPos = 30;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Encl:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += lineHeight; // the heading owns its line; item 1 printed on top of it
    [
      'PVC calculation sheet(s) for the bill(s) listed above',
      'Abstract statement of price variation for the agreement',
      'Published index pages relied upon (labour, plant & machinery, fuel, cement, steel)',
    ].forEach((item, index) => {
      const lines = doc.splitTextToSize(`${index + 1}.  ${item}`, contentWidth - indent) as string[];
      lines.forEach(line => {
        doc.text(line, margin + indent, yPos);
        yPos += lineHeight;
      });
    });

    yPos += 8; // Space before closing

    // Closing
    doc.setFont('helvetica', 'normal');
    doc.text('Thanking You,', margin, yPos);
    yPos += lineHeight + 2;

    // Signature block. The letter carried the company name and signatory in its data and
    // printed neither, so it arrived with nowhere to sign and no indication of who from.
    doc.text('Yours faithfully,', pageWidth - margin - doc.getTextWidth('Yours faithfully,'), yPos);
    yPos += lineHeight + 2;
    doc.setFont('helvetica', 'bold');
    const forLine = `For ${data.companyName}`;
    doc.text(forLine, pageWidth - margin - doc.getTextWidth(forLine), yPos);
    doc.setFont('helvetica', 'normal');
    yPos += lineHeight * 2 + 4; // room to sign
    if (data.signatory) {
      doc.text(data.signatory, pageWidth - margin - doc.getTextWidth(data.signatory), yPos);
      yPos += lineHeight;
    }
    if (data.companyGSTIN && data.companyGSTIN !== 'N/A') {
      doc.setFontSize(9);
      const gstLine = `GSTIN: ${data.companyGSTIN}`;
      doc.text(gstLine, pageWidth - margin - doc.getTextWidth(gstLine), yPos);
      doc.setFontSize(11);
    }

    logger.log('✓ PDF Generator: PDF content created');

    // Convert to buffer
    logger.log('PDF Generator: Converting to buffer...');
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    logger.log('✓ PDF Generator: Buffer created, size:', pdfBuffer.length, 'bytes');
    
    return pdfBuffer;
  } catch (error) {
    console.error('❌ PDF Generator: Error generating PDF:', error);
    console.error('PDF Generator: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

