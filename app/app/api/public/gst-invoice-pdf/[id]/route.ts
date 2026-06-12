
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/gst-invoice-pdf/[id]
 * Public endpoint for GST invoice PDF (used for WhatsApp sharing)
 * No authentication required - invoice ID serves as the access token
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Get invoice
    const invoice = await prisma.gstInvoice.findUnique({
      where: { id: id },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: invoice.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate PDF HTML
    const html = generateGstInvoiceHtml(invoice, user);

    // Return HTML that can be printed as PDF
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('Error generating public GST invoice PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

function generateGstInvoiceHtml(invoice: any, user: any): string {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };

  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero';
    if (num < 10) return ones[num];
    if (num >= 10 && num < 20) return teens[num - 10];
    if (num >= 20 && num < 100) {
      return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
    }
    if (num >= 100 && num < 1000) {
      return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + numberToWords(num % 100) : '');
    }
    if (num >= 1000 && num < 100000) {
      return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + numberToWords(num % 1000) : '');
    }
    if (num >= 100000) {
      return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 !== 0 ? ' ' + numberToWords(num % 100000) : '');
    }
    return '';
  };

  const amountInWords = () => {
    const rupees = Math.floor(invoice.totalAmount);
    const paise = Math.round((invoice.totalAmount - rupees) * 100);
    
    let words = 'Rupees ' + numberToWords(rupees);
    if (paise > 0) {
      words += ' and ' + numberToWords(paise) + ' Paise';
    }
    words += ' Only';
    return words;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GST Invoice - ${invoice.invoiceNumber}</title>
  <style>
    /* A4 Page Sizing */
    @page {
      size: A4;
      margin: 10mm;
    }
    
    @media print {
      body { 
        margin: 0; 
        padding: 0;
        width: 210mm;
        height: 297mm;
      }
      .no-print { display: none; }
      .invoice-container {
        box-shadow: none;
        padding: 15mm 10mm;
        margin: 0;
        height: 100%;
      }
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      background: #f5f5f5;
      padding: 10px;
    }
    
    .invoice-container {
      max-width: 210mm;
      margin: 0 auto;
      background: white;
      padding: 15mm 10mm;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    
    /* Compact Header */
    .header {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 8px;
    }
    
    .header h1 {
      color: #1e40af;
      font-size: 22px;
      margin-bottom: 3px;
      font-weight: bold;
    }
    
    .header .subtitle {
      color: #64748b;
      font-size: 11px;
      margin-bottom: 4px;
    }
    
    .company-details {
      font-size: 10px;
      color: #475569;
      line-height: 1.4;
    }
    
    /* Invoice Title */
    .invoice-title {
      background: #2563eb;
      color: white;
      padding: 6px 15px;
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      margin: 10px 0;
    }
    
    /* Info Section - Compact Layout */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 10px 0;
    }
    
    .info-box {
      padding: 8px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
    }
    
    .info-box h3 {
      color: #1e40af;
      font-size: 11px;
      margin-bottom: 5px;
      font-weight: 600;
      border-bottom: 1px solid #2563eb;
      padding-bottom: 3px;
    }
    
    .info-box p {
      font-size: 10px;
      line-height: 1.5;
      color: #334155;
      margin: 2px 0;
    }
    
    .info-box strong {
      color: #0f172a;
      font-weight: 600;
    }
    
    /* Compact Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 10px;
    }
    
    th {
      background: #2563eb;
      color: white;
      padding: 7px 8px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
    }
    
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10px;
      color: #334155;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    .subtotal-row {
      background: #f8fafc;
      font-weight: 600;
    }
    
    .total-row {
      background: #dbeafe;
      font-weight: bold;
      font-size: 11px;
    }
    
    .total-row td {
      border-bottom: 2px solid #2563eb;
      padding: 8px;
    }
    
    /* Amount in Words - Compact */
    .amount-words {
      background: #f1f5f9;
      padding: 8px;
      margin: 10px 0;
      border-left: 3px solid #2563eb;
      font-size: 10px;
      color: #334155;
    }
    
    .amount-words strong {
      color: #1e40af;
    }
    
    /* Compact Terms */
    .terms {
      margin-top: 10px;
      padding: 8px;
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 3px;
    }
    
    .terms h4 {
      color: #92400e;
      font-size: 11px;
      margin-bottom: 4px;
      font-weight: 600;
    }
    
    .terms ul {
      margin-left: 15px;
      font-size: 9px;
      color: #78350f;
      line-height: 1.5;
    }
    
    .terms li {
      margin: 2px 0;
    }
    
    /* Signature and Footer - Compact */
    .bottom-section {
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .signature {
      text-align: right;
    }
    
    .signature p {
      font-size: 10px;
      font-weight: 600;
      margin-bottom: 30px;
    }
    
    .signature-line {
      border-top: 1px solid #334155;
      width: 150px;
      padding-top: 3px;
      font-size: 9px;
      color: #64748b;
    }
    
    .footer {
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      margin-top: 15px;
    }
    
    .footer p {
      font-size: 9px;
      color: #64748b;
      line-height: 1.4;
    }
    
    .print-button {
      position: fixed;
      top: 15px;
      right: 15px;
      padding: 10px 20px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    
    .print-button:hover {
      background: #1e40af;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">
    🖨️ Print / Download PDF
  </button>
  
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <h1>IR-PVC System</h1>
      <p class="subtitle">Price Variation Clause Calculation & Management</p>
      <div class="company-details">
        No 1/5 Kamraj Road, Mela Kalkandar Kottai, Tiruchirapalli, Tamil Nadu 620011, India<br>
        <strong>GSTIN:</strong> 33AAKFI5174P2ZS | <strong>Phone:</strong> 9944776689 | <strong>Email:</strong> admin@irpvc.in
      </div>
    </div>
    
    <!-- Invoice Title -->
    <div class="invoice-title">TAX INVOICE</div>
    
    <!-- Info Section -->
    <div class="info-grid">
      <div class="info-box">
        <h3>Bill To:</h3>
        <p><strong>${invoice.customerName}</strong></p>
        <p>${invoice.customerEmail}</p>
        ${invoice.customerPhone ? `<p>Phone: ${invoice.customerPhone}</p>` : ''}
        ${invoice.customerAddress ? `<p>${invoice.customerAddress}</p>` : ''}
        ${invoice.customerGstin ? `<p><strong>GSTIN:</strong> ${invoice.customerGstin}</p>` : ''}
      </div>
      
      <div class="info-box">
        <h3>Invoice Details:</h3>
        <p><strong>Invoice No:</strong> ${invoice.invoiceNumber}</p>
        <p><strong>Date:</strong> ${formatDate(invoice.invoiceDate)}</p>
        <p><strong>Payment Method:</strong> Razorpay</p>
        <p><strong>Transaction ID:</strong><br>${invoice.razorpayTransactionId.substring(0, 25)}...</p>
      </div>
    </div>
    
    <!-- Items Table -->
    <table>
      <thead>
        <tr>
          <th style="width: 8%">S.No</th>
          <th style="width: 15%">HSN/SAC</th>
          <th style="width: 47%">Description</th>
          <th class="text-center" style="width: 10%">Qty</th>
          <th class="text-right" style="width: 20%">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="text-center">1</td>
          <td>${invoice.hsn || '998314'}</td>
          <td>${invoice.description}</td>
          <td class="text-center">1</td>
          <td class="text-right">${formatCurrency(invoice.subtotal)}</td>
        </tr>
        <tr class="subtotal-row">
          <td colspan="4" class="text-right"><strong>Subtotal:</strong></td>
          <td class="text-right"><strong>${formatCurrency(invoice.subtotal)}</strong></td>
        </tr>
        ${!invoice.isInterstate ? `
        <tr>
          <td colspan="4" class="text-right">CGST @ 9%:</td>
          <td class="text-right">${formatCurrency(invoice.cgst)}</td>
        </tr>
        <tr>
          <td colspan="4" class="text-right">SGST @ 9%:</td>
          <td class="text-right">${formatCurrency(invoice.sgst)}</td>
        </tr>
        ` : `
        <tr>
          <td colspan="4" class="text-right">IGST @ 18%:</td>
          <td class="text-right">${formatCurrency(invoice.igst)}</td>
        </tr>
        `}
        <tr class="total-row">
          <td colspan="4" class="text-right"><strong>TOTAL AMOUNT:</strong></td>
          <td class="text-right"><strong>${formatCurrency(invoice.totalAmount)}</strong></td>
        </tr>
      </tbody>
    </table>
    
    <!-- Amount in Words -->
    <div class="amount-words">
      <strong>Amount in Words:</strong> ${amountInWords()}
    </div>
    
    <!-- Terms & Conditions -->
    <div class="terms">
      <h4>📋 Terms & Conditions:</h4>
      <ul>
        <li>This is a computer-generated invoice and does not require a physical signature.</li>
        <li>Payment has been received and verified through Razorpay payment gateway.</li>
        <li>Credits are non-refundable and valid for use within the Railway PVC System.</li>
        <li>For queries, contact support with invoice number. Invoice issued as per GST regulations in India.</li>
      </ul>
    </div>
    
    <!-- Signature and Footer -->
    <div class="bottom-section">
      <div style="font-size: 9px; color: #64748b; flex: 1;">
        Thank you for using IR-PVC!<br>
        Support: admin@irpvc.in
      </div>
      <div class="signature">
        <p><strong>For IR-PVC System</strong></p>
        <div class="signature-line">
          Authorized Signatory
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
