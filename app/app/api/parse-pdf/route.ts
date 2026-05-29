
import { NextRequest, NextResponse } from 'next/server';

const pdfParse = require('pdf-parse');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse PDF
    const data = await pdfParse(buffer);
    const text = data.text;

    // Extract measurement date
    let measurementDate = '';
    const measurementDatePatterns = [
      /Measurement\s+Date(?:\s+From)?[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /Date\s+of\s+Measurement[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /Measurement\s+Date\s+To[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    ];

    for (const pattern of measurementDatePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const [day, month, year] = match[1].split('/');
        measurementDate = `${year}-${month}-${day}`;
        break;
      }
    }

    // Extract bill amount - more flexible patterns
    let billAmount = '';
    const billAmountPatterns = [
      /Bill\s+Amount.*?([\d,]+\.\d+)/i,
      /Total\s+Amount\s*\(Rs\.\).*?([\d,]+\.\d+)/i,
      /Final\s+Payable\s+Amount.*?([\d,]+\.\d+)/i,
      /Net\s+Amount\s+Payable.*?([\d,]+\.\d+)/i,
      /Gross\s+Amount.*?([\d,]+\.\d+)/i,
    ];

    for (const pattern of billAmountPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Remove commas and convert to number
        const amount = match[1].replace(/,/g, '');
        // Only accept amounts greater than 0
        if (parseFloat(amount) > 0) {
          billAmount = amount;
          break;
        }
      }
    }

    // Extract bill number
    let billNumber = '';
    const billNumberPatterns = [
      /Bill\s+No\.\s*([A-Z0-9\/\-]+)/i,
      /Bill\s+Number[:\s]+([A-Z0-9\/\-]+)/i,
      /Bill\s+No[:\s]+([A-Z0-9\/\-]+)/i,
    ];

    for (const pattern of billNumberPatterns) {
      const match = text.match(pattern);
      if (match) {
        billNumber = match[1].trim();
        break;
      }
    }

    // Extract LOA date
    let loaDate = '';
    const loaDatePatterns = [
      /LOA\s+Date[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /Date\s+of\s+LOA[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    ];

    for (const pattern of loaDatePatterns) {
      const match = text.match(pattern);
      if (match) {
        const [day, month, year] = match[1].split('/');
        loaDate = `${year}-${month}-${day}`;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        measurementDate,
        billAmount,
        billNumber,
        loaDate,
        extractedText: text.substring(0, 500) // First 500 chars for debugging
      }
    });

  } catch (error: any) {
    console.error('Error parsing PDF:', error);
    return NextResponse.json(
      { error: 'Failed to parse PDF', details: error.message },
      { status: 500 }
    );
  }
}
