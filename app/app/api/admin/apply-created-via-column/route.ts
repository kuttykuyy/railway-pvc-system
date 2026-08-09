import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Adds the createdVia columns to bills and contracts.
 *
 * The column must exist BEFORE any code mentions it: Prisma selects every scalar its
 * schema declares, so shipping the field first took the whole contracts list down with
 * "column does not exist" — the code and the database have to move in that order, never
 * the reverse.
 *
 * Both statements are IF NOT EXISTS, so pressing this twice is harmless.
 */
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }
  const present = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_name IN ('bills', 'contracts') AND column_name = 'createdVia'
  `;
  return NextResponse.json({
    applied: present.length === 2,
    tables: present.map(p => p.table_name),
    note: present.length === 2
      ? 'Both columns exist. The origin badges will appear on records created from now on.'
      : 'Not applied yet. Press Apply to add the columns.',
  });
}

export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "createdVia" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "createdVia" TEXT');
    return NextResponse.json({
      success: true,
      message: 'Columns added to bills and contracts. Records created from now on will carry how they were made.',
    });
  } catch (error: any) {
    console.error('[apply createdVia] failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not add the columns' }, { status: 500 });
  }
}
