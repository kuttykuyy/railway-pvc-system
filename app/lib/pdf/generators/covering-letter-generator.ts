
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
    console.log('PDF Generator: Starting PDF generation');
    console.log('PDF Generator: Data received:', {
      companyName: data.companyName,
      billNumber: data.billNumber,
      billAmount: data.billAmount
    });

    // Validate required data
    if (!data.companyName || data.companyName === 'Company Name') {
      console.warn('⚠ PDF Generator: Company name is missing or default');
    }
    if (!data.billNumber) {
      console.warn('⚠ PDF Generator: Bill number is missing');
    }
    if (!data.billAmount) {
      console.warn('⚠ PDF Generator: Bill amount is missing');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    console.log('✓ PDF Generator: jsPDF instance created');

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    const lineHeight = 6; // Consistent line height

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
    const subjectText = `${data.workDescription} - Payment for PVC Bill-Reg`;
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
    
    let bodyText: string;
    
    if (isMultipleBills) {
      // For multiple bills, replace the inline bill numbers with a count reference
      // The detailed bill list will be rendered separately below
      bodyText = `In connection with the subject work, the price variation bill is worked out to Rs.${data.billAmount} for the following ${billNumbers.length} bills as per clause no:46A of GCC 2022 and the same is submitted for early payment please. The calculation sheets along with the indices are submitted here with this letter for the further process at your end.`;
    } else if (data.bodyText) {
      bodyText = data.bodyText;
    } else {
      bodyText = `In connection with the subject work, the price variation bill is worked out to Rs.${data.billAmount} for ${data.billNumber} as per clause no:46A of GCC 2022 and the same is submitted for early payment please. The calculation sheets along with the indices are submitted here with this letter for the further process at your end.`;
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
    
    yPos += 8; // Space before closing

    // Closing
    doc.setFont('helvetica', 'normal');
    doc.text('Thanking You,', margin, yPos);

    console.log('✓ PDF Generator: PDF content created');

    // Convert to buffer
    console.log('PDF Generator: Converting to buffer...');
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    console.log('✓ PDF Generator: Buffer created, size:', pdfBuffer.length, 'bytes');
    
    return pdfBuffer;
  } catch (error) {
    console.error('❌ PDF Generator: Error generating PDF:', error);
    console.error('PDF Generator: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
