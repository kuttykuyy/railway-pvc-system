
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('[GST Excel Export] Starting export...');
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      console.log('[GST Excel Export] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user by email first
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      console.log('[GST Excel Export] User not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      console.log('[GST Excel Export] Access denied - not admin');
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month'); // Format: YYYY-MM
    const year = searchParams.get('year'); // Format: YYYY

    console.log('[GST Excel Export] Filters - month:', month, 'year:', year);

    // Build filter query
    let dateFilter: any = {};
    
    if (month) {
      // Filter by specific month (YYYY-MM)
      const [filterYear, filterMonth] = month.split('-');
      const startDate = new Date(parseInt(filterYear), parseInt(filterMonth) - 1, 1);
      const endDate = new Date(parseInt(filterYear), parseInt(filterMonth), 0, 23, 59, 59);
      
      dateFilter = {
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      };
    } else if (year) {
      // Filter by year
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59);
      
      dateFilter = {
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      };
    }

    // Fetch all GST invoices with filters
    const invoices = await prisma.gstInvoice.findMany({
      where: dateFilter,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        invoiceDate: 'asc',
      },
    });

    console.log('[GST Excel Export] Found invoices:', invoices.length);

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: 'No invoices found for the selected period' },
        { status: 404 }
      );
    }

    // Prepare data for Excel
    const excelData = invoices.map((invoice: any, index: number) => ({
      'Sr. No.': index + 1,
      'Invoice Number': invoice.invoiceNumber,
      'Invoice Date': new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      'Customer Name': invoice.customerName,
      'Customer Email': invoice.customerEmail,
      'Customer Phone': invoice.customerPhone || 'N/A',
      'Customer GSTIN': invoice.customerGstin || 'Unregistered',
      'Place of Supply': invoice.isInterstate ? 'Other State' : 'Tamil Nadu (33)',
      'Transaction Type': invoice.isInterstate ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)',
      'Taxable Value (₹)': invoice.subtotal.toFixed(2),
      'CGST Rate (%)': invoice.isInterstate ? '0' : '9',
      'CGST Amount (₹)': invoice.cgst.toFixed(2),
      'SGST Rate (%)': invoice.isInterstate ? '0' : '9',
      'SGST Amount (₹)': invoice.sgst.toFixed(2),
      'IGST Rate (%)': invoice.isInterstate ? '18' : '0',
      'IGST Amount (₹)': invoice.igst.toFixed(2),
      'Total Tax (₹)': invoice.totalGst.toFixed(2),
      'Total Invoice Value (₹)': invoice.totalAmount.toFixed(2),
      'Description': invoice.description,
      'Status': invoice.status,
      'System User': invoice.user.name || invoice.user.email,
    }));

    // Add summary row
    const totalTaxableValue = invoices.reduce((sum: number, inv: any) => sum + inv.subtotal, 0);
    const totalCGST = invoices.reduce((sum: number, inv: any) => sum + inv.cgst, 0);
    const totalSGST = invoices.reduce((sum: number, inv: any) => sum + inv.sgst, 0);
    const totalIGST = invoices.reduce((sum: number, inv: any) => sum + inv.igst, 0);
    const totalTax = invoices.reduce((sum: number, inv: any) => sum + inv.totalGst, 0);
    const totalInvoiceValue = invoices.reduce((sum: number, inv: any) => sum + inv.totalAmount, 0);

    excelData.push({
      'Sr. No.': '' as any,
      'Invoice Number': '',
      'Invoice Date': '',
      'Customer Name': '',
      'Customer Email': '',
      'Customer Phone': '',
      'Customer GSTIN': '',
      'Place of Supply': '',
      'Transaction Type': 'TOTAL',
      'Taxable Value (₹)': totalTaxableValue.toFixed(2),
      'CGST Rate (%)': '',
      'CGST Amount (₹)': totalCGST.toFixed(2),
      'SGST Rate (%)': '',
      'SGST Amount (₹)': totalSGST.toFixed(2),
      'IGST Rate (%)': '',
      'IGST Amount (₹)': totalIGST.toFixed(2),
      'Total Tax (₹)': totalTax.toFixed(2),
      'Total Invoice Value (₹)': totalInvoiceValue.toFixed(2),
      'Description': '',
      'Status': '',
      'System User': '',
    });

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 8 },  // Sr. No.
      { wch: 20 }, // Invoice Number
      { wch: 15 }, // Invoice Date
      { wch: 25 }, // Customer Name
      { wch: 30 }, // Customer Email
      { wch: 15 }, // Customer Phone
      { wch: 20 }, // Customer GSTIN
      { wch: 20 }, // Place of Supply
      { wch: 25 }, // Transaction Type
      { wch: 18 }, // Taxable Value
      { wch: 12 }, // CGST Rate
      { wch: 15 }, // CGST Amount
      { wch: 12 }, // SGST Rate
      { wch: 15 }, // SGST Amount
      { wch: 12 }, // IGST Rate
      { wch: 15 }, // IGST Amount
      { wch: 15 }, // Total Tax
      { wch: 20 }, // Total Invoice Value
      { wch: 30 }, // Description
      { wch: 12 }, // Status
      { wch: 25 }, // System User
    ] as any;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'GST Invoices');

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Create filename
    const periodText = month ? month : year ? year : 'All';
    const filename = `GST_Report_${periodText}_${new Date().toISOString().split('T')[0]}.xlsx`;

    console.log('[GST Excel Export] Export successful, filename:', filename);

    // Return file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[GST Excel Export] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export GST invoices' },
      { status: 500 }
    );
  }
}
