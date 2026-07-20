
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { advancedCache } from '@/lib/advanced-cache';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

/**
 * Force clear all caches related to price indices and bills
 * POST /api/indices/clear-cache
 */
export async function POST(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

    // Revalidate all relevant paths
    revalidatePath('/api/bills');
    revalidatePath('/api/indices');
    revalidatePath('/api/contracts');
    revalidatePath('/bills');
    revalidatePath('/indices');
    
    // Clear any tagged caches
    revalidateTag('bills');
    revalidateTag('indices');
    revalidateTag('pvc-calculations');
    
    // Clear advanced memory caches
    advancedCache.invalidateByTag('indices');
    advancedCache.invalidateByTag('bills');
    advancedCache.invalidateByTag('classifications');
    advancedCache.invalidateByTag('dashboard');
    
    return NextResponse.json({
      success: true,
      message: 'All caches cleared successfully',
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error: any) {
    console.error('Cache clear error:', error);
    return NextResponse.json({
      error: 'Failed to clear cache',
      details: error.message
    }, { status: 500 });
  }
}
