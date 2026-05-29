
// Auto-fetch functionality has been removed
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    error: 'Auto-fetch functionality has been removed' 
  }, { status: 501 });
}
