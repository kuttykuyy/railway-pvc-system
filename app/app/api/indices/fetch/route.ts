
// Auto-fetch functionality has been removed
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ 
    error: 'Auto-fetch functionality has been removed' 
  }, { status: 501 });
}
