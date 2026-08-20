import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { advancedCache } from '@/lib/advanced-cache';
import { validateAdminAccess } from '@/lib/role-auth';
import { reapplyWpiProvisionalRule } from '@/lib/wpi-fetcher';

export const dynamic = "force-dynamic";

/**
 * The month the request NAMES, not the month its timestamp happens to land in. A
 * date string carrying an offset — March 1st IST serialises as Feb 28th 18:30 UTC —
 * used to be normalised in server-local time, quietly filing the value under the
 * previous month. The year-month prefix of the string is the admin's intent; it is
 * read directly whenever present.
 */
function normalizeMonthInput(month: unknown): Date {
  const s = String(month ?? '');
  const m = s.match(/^([0-9]{4})-([0-9]{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const d = new Date(s);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// POST /api/indices/monthly - Add monthly index value(s)
export async function POST(request: NextRequest) {
  try {
    // These values are what every PVC in the app is computed from, so writing them is an
    // admin act. POST and PUT had no role check at all — any signed-in contractor could
    // overwrite a published index, and the cache flush below made it take effect at once.
    // Every sibling route under indices/ was already guarded this way.
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    
    // Handle both single entry and bulk import
    if (body.monthlyData && Array.isArray(body.monthlyData)) {
      // Bulk import from manual-import page
      const { monthlyData } = body;
      const results = [];
      
      for (const item of monthlyData) {
        const { priceIndexId, month, value, isProvisional = false } = item;
        
        const parsedValue = parseFloat(value);
        if (isNaN(parsedValue) || parsedValue <= 0) {
          return NextResponse.json(
            { error: `Invalid index value for index ID ${priceIndexId}. Value must be a valid positive number.` },
            { status: 400 }
          );
        }
        
        const monthDate = normalizeMonthInput(month);
        
        const monthlyValue = await prisma.monthlyIndexValue.upsert({
          where: {
            priceIndexId_month: {
              priceIndexId,
              month: monthDate
            }
          },
          update: { 
            value: parsedValue,
            isProvisional: Boolean(isProvisional)
          },
          create: {
            priceIndexId,
            month: monthDate,
            value: parsedValue,
            isProvisional: Boolean(isProvisional)
          }
        });
        
        results.push(monthlyValue);
      }

      // A bulk write here can add a newer month directly as final, leaving an older
      // month stuck showing "provisional" forever — see reapplyWpiProvisionalRule.
      // Nothing here previously invalidated the cache either, so the fix could sit
      // behind the cache for however long it takes to expire.
      await reapplyWpiProvisionalRule().catch((error) => {
        console.error('Failed to re-sync WPI provisional status after bulk import:', error);
      });
      advancedCache.invalidateByTag('indices');

      return NextResponse.json({
        success: true,
        count: results.length,
        data: results
      });
    } else {
      // Single entry
      const { priceIndexId, month, value, isProvisional = false } = body;
      
      if (!priceIndexId || !month || value === undefined) {
        return NextResponse.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue) || parsedValue <= 0) {
        return NextResponse.json(
          { error: 'Invalid index value. Value must be a valid positive number.' },
          { status: 400 }
        );
      }

      const monthDate = normalizeMonthInput(month);
      
      const monthlyValue = await prisma.monthlyIndexValue.upsert({
        where: {
          priceIndexId_month: {
            priceIndexId,
            month: monthDate
          }
        },
        update: { 
          value: parsedValue,
          isProvisional: Boolean(isProvisional)
        },
        create: {
          priceIndexId,
          month: monthDate,
          value: parsedValue,
          isProvisional: Boolean(isProvisional)
        }
      });
      
      // Re-sync the provisional rule — this single write can be the one that adds a
      // newer month as final and strands an older one as provisional.
      await reapplyWpiProvisionalRule().catch((error) => {
        console.error('Failed to re-sync WPI provisional status after single entry:', error);
      });

      // Invalidate cached indices
      advancedCache.invalidateByTag('indices');

      return NextResponse.json(monthlyValue);
    }
  } catch (error) {
    console.error('Error adding monthly index value:', error);
    return NextResponse.json(
      { error: 'Failed to add monthly index value' },
      { status: 500 }
    );
  }
}

// PUT /api/indices/monthly - Update multiple monthly values
export async function PUT(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { values } = body; // Array of { priceIndexId, month, value }
    
    if (!Array.isArray(values)) {
      return NextResponse.json(
        { error: 'Values must be an array' },
        { status: 400 }
      );
    }

    const results = [];
    for (const item of values) {
      const { priceIndexId, month, value, isProvisional = false } = item;
      
      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue) || parsedValue <= 0) {
        return NextResponse.json(
          { error: `Invalid index value for index ID ${priceIndexId}. Value must be a valid positive number.` },
          { status: 400 }
        );
      }
      
      const monthDate = normalizeMonthInput(month);
      
      const monthlyValue = await prisma.monthlyIndexValue.upsert({
        where: {
          priceIndexId_month: {
            priceIndexId,
            month: monthDate
          }
        },
        update: { 
          value: parsedValue,
          isProvisional: Boolean(isProvisional)
        },
        create: {
          priceIndexId,
          month: monthDate,
          value: parsedValue,
          isProvisional: Boolean(isProvisional)
        }
      });
      
      results.push(monthlyValue);
    }

    await reapplyWpiProvisionalRule().catch((error) => {
      console.error('Failed to re-sync WPI provisional status after bulk update:', error);
    });

    // Invalidate cached indices
    advancedCache.invalidateByTag('indices');

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error updating monthly values:', error);
    return NextResponse.json(
      { error: 'Failed to update monthly values' },
      { status: 500 }
    );
  }
}

// DELETE /api/indices/monthly - Delete monthly index value(s)
export async function DELETE(request: NextRequest) {
  try {
    // Deleting a published index value is an admin act too — this asked only whether
    // you were signed in.
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { priceIndexId, month, deleteEntireRow } = body;
    
    if (!month) {
      return NextResponse.json(
        { error: 'Month is required' },
        { status: 400 }
      );
    }

    const monthDate = normalizeMonthInput(month);

    if (deleteEntireRow) {
      // Delete all index values for this month
      const result = await prisma.monthlyIndexValue.deleteMany({
        where: {
          month: monthDate
        }
      });
      
      // Deleting the latest month can promote an older one to "latest" and it should
      // become provisional again — same rule, same reason as on every write.
      await reapplyWpiProvisionalRule().catch((error) => {
        console.error('Failed to re-sync WPI provisional status after row delete:', error);
      });

      // Invalidate cached indices
      advancedCache.invalidateByTag('indices');

      return NextResponse.json({
        success: true,
        deletedCount: result.count,
        message: `Successfully deleted all ${result.count} values for ${month}`
      });
    } else {
      // Delete a single index value for this index and month
      if (!priceIndexId) {
        return NextResponse.json(
          { error: 'Price index ID is required for single record deletion' },
          { status: 400 }
        );
      }

      const result = await prisma.monthlyIndexValue.deleteMany({
        where: {
          priceIndexId,
          month: monthDate
        }
      });

      await reapplyWpiProvisionalRule().catch((error) => {
        console.error('Failed to re-sync WPI provisional status after value delete:', error);
      });

      // Invalidate cached indices
      advancedCache.invalidateByTag('indices');

      return NextResponse.json({
        success: true,
        deletedCount: result.count,
        message: `Successfully deleted value for index ID ${priceIndexId} in ${month}`
      });
    }
  } catch (error) {
    console.error('Error deleting monthly index value:', error);
    return NextResponse.json(
      { error: 'Failed to delete monthly index value' },
      { status: 500 }
    );
  }
}
