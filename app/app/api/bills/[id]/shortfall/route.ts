import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkUserBillAccess } from '@/lib/permissions';
import { computeShortfall } from '@/lib/shortfall';

const COMPONENT_FIELDS = [
  'railwayLabour', 'railwayPlantMachinery', 'railwayFuelPower', 'railwayCement',
  'railwaySteel', 'railwayOtherMaterials', 'railwayExplosives',
] as const;

async function authorize(billId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Unauthorized', status: 401 as const };
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return { error: 'User not found', status: 404 as const };
  const access = await checkUserBillAccess(user.id, billId);
  if (!access) return { error: 'Bill not found', status: 404 as const };
  return { userId: user.id };
}

// GET: the bill's entitlement (app-computed) vs Railway-paid figures + the shortfall.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { pvcCalculation: true, shortfallAudit: true, contract: { select: { agreementNo: true, contractorName: true, workDescription: true } } },
  });
  if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  if (!bill.pvcCalculation) {
    return NextResponse.json({ error: 'This bill has no PVC calculation yet, so there is nothing to audit.' }, { status: 400 });
  }

  return NextResponse.json({
    billNo: bill.billNo,
    audit: bill.shortfallAudit,
    result: computeShortfall(bill.pvcCalculation, bill.shortfallAudit),
  });
}

// POST: save/update the Railway PVC figures for this bill.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const bill = await prisma.bill.findUnique({ where: { id }, include: { pvcCalculation: true } });
  if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  if (!bill.pvcCalculation) {
    return NextResponse.json({ error: 'This bill has no PVC calculation yet, so there is nothing to audit.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const toNum = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const toNullNum = (v: unknown): number | null =>
    v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

  const data: Record<string, unknown> = {
    railwayTotal: toNum(body.railwayTotal),
    railwayReference: typeof body.railwayReference === 'string' ? body.railwayReference.slice(0, 200) : null,
    remarks: typeof body.remarks === 'string' ? body.remarks.slice(0, 1000) : null,
  };
  for (const field of COMPONENT_FIELDS) data[field] = toNullNum(body[field]);

  const audit = await prisma.shortfallAudit.upsert({
    where: { billId: id },
    create: { billId: id, ...(data as any) },
    update: data as any,
  });

  return NextResponse.json({ audit, result: computeShortfall(bill.pvcCalculation, audit) });
}

// DELETE: clear the audit for this bill.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await prisma.shortfallAudit.deleteMany({ where: { billId: id } });
  return NextResponse.json({ ok: true });
}
