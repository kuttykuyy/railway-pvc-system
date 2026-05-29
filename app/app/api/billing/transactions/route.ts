
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

// Billing transactions API - REMOVED
// All bill processing is now free, no transactions needed

export async function GET(request: NextRequest) {
  return NextResponse.json({
    transactions: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 20,
      pages: 0
    },
    message: 'All bill processing is now free!'
  });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'Payment processing has been removed - all bills are free!'
  });
}
