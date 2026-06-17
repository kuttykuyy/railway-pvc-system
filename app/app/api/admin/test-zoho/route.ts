import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { createZohoInvoice } from '@/lib/zoho-books';

export const dynamic = 'force-dynamic';

// GET /api/admin/test-zoho — create a test invoice in Zoho Books
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  try {
    const result = await createZohoInvoice({
      customerName: 'Test Customer',
      customerEmail: '30prasath93@gmail.com',
      creditAmount: 199,
      gstAmount: 35.82,
      totalAmount: 234.82,
      razorpayOrderId: 'TEST_ORDER_001',
      razorpayPaymentId: 'TEST_PAY_001',
    });

    return NextResponse.json({ success: true, invoice: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
