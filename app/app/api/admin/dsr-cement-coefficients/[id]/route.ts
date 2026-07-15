import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const { authorized, user, message } = await validateApiAccess(request);
  if (!authorized || !user) return { ok: false as const, res: NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 }) };
  if (!['admin', 'superadmin'].includes(String(user.role || '').toLowerCase())) {
    return { ok: false as const, res: NextResponse.json({ error: 'Only an administrator can manage the shared DSR coefficient library.' }, { status: 403 }) };
  }
  return { ok: true as const };
}

/**
 * Edits one cement coefficient. The DSR code itself is NOT editable — it is the key
 * items are matched on, so changing it would silently detach existing usage. Delete
 * and re-add instead.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.res;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (body.description !== undefined) {
      const description = String(body.description || '').trim().slice(0, 500);
      if (!description) return NextResponse.json({ error: 'Description cannot be empty.' }, { status: 400 });
      data.description = description;
    }
    if (body.workUnit !== undefined) {
      const workUnit = String(body.workUnit || '').trim().slice(0, 30);
      if (!workUnit) return NextResponse.json({ error: 'Work unit cannot be empty.' }, { status: 400 });
      data.workUnit = workUnit;
    }
    if (body.cementQuantityPerUnit !== undefined) {
      const n = Number(body.cementQuantityPerUnit);
      if (!Number.isFinite(n) || n <= 0 || n > 1000) {
        return NextResponse.json({ error: 'Coefficient must be greater than 0 and entered in MT per item unit.' }, { status: 400 });
      }
      data.cementQuantityPerUnit = n;
    }
    if (body.notes !== undefined) data.notes = String(body.notes || '').trim().slice(0, 500);
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const coefficient = await prisma.dsrCementCoefficient.update({ where: { id }, data });
    return NextResponse.json({ success: true, coefficient });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Coefficient not found.' }, { status: 404 });
    console.error('[dsr-cement-coefficients] Update failed:', error);
    return NextResponse.json({ error: 'Failed to update the coefficient.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.res;

    const { id } = await params;
    await prisma.dsrCementCoefficient.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Coefficient not found.' }, { status: 404 });
    console.error('[dsr-cement-coefficients] Delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete the coefficient.' }, { status: 500 });
  }
}
