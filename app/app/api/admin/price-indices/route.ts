
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

// GET /api/admin/price-indices — list all price indices with data counts
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const indices = await prisma.priceIndex.findMany({
    include: {
      _count: { select: { monthlyValues: true } }
    },
    orderBy: { name: 'asc' }
  });

  return NextResponse.json({ indices });
}

// DELETE /api/admin/price-indices?name=<name> — delete entire price index record
// DELETE /api/admin/price-indices?fromYear=2018&toYear=2021 — delete monthly values in year range
export async function DELETE(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const name = request.nextUrl.searchParams.get('name');
  const fromYear = request.nextUrl.searchParams.get('fromYear');
  const toYear = request.nextUrl.searchParams.get('toYear');

  // Delete monthly values by date range
  if (fromYear && toYear) {
    const from = new Date(Date.UTC(parseInt(fromYear), 0, 1));
    const to = new Date(Date.UTC(parseInt(toYear), 11, 31));
    const deleted = await prisma.monthlyIndexValue.deleteMany({
      where: { month: { gte: from, lte: to } }
    });
    return NextResponse.json({ success: true, deletedMonthlyValues: deleted.count, fromYear, toYear });
  }

  // Delete entire price index by name
  if (!name) {
    return NextResponse.json({ error: 'name, or fromYear+toYear parameters required' }, { status: 400 });
  }

  const index = await prisma.priceIndex.findFirst({ where: { name } });
  if (!index) {
    return NextResponse.json({ error: `Price index "${name}" not found` }, { status: 404 });
  }

  const deleted = await prisma.monthlyIndexValue.deleteMany({
    where: { priceIndexId: index.id }
  });
  await prisma.priceIndex.delete({ where: { id: index.id } });

  return NextResponse.json({ success: true, deletedIndex: name, deletedMonthlyValues: deleted.count });
}
