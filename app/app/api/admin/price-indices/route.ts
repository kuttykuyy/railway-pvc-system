
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

// DELETE /api/admin/price-indices?name=WPI+Steel+Composite — delete by name
export async function DELETE(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const name = request.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name parameter required' }, { status: 400 });
  }

  const index = await prisma.priceIndex.findFirst({ where: { name } });
  if (!index) {
    return NextResponse.json({ error: `Price index "${name}" not found` }, { status: 404 });
  }

  // Delete monthly values first (cascade not guaranteed)
  const deleted = await prisma.monthlyIndexValue.deleteMany({
    where: { priceIndexId: index.id }
  });

  await prisma.priceIndex.delete({ where: { id: index.id } });

  return NextResponse.json({
    success: true,
    deletedIndex: name,
    deletedMonthlyValues: deleted.count
  });
}
