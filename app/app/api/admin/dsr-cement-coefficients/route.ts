import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { normalizeDsrCode } from '@/lib/dsr-cement-calculation';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }
    if (!['admin', 'superadmin'].includes(String(user.role || '').toLowerCase())) {
      return NextResponse.json({ error: 'Only an administrator can update the shared DSR coefficient library.' }, { status: 403 });
    }

    const body = await request.json();
    const dsrCode = normalizeDsrCode(String(body?.dsrCode || ''));
    const description = String(body?.description || '').trim().slice(0, 500);
    const workUnit = String(body?.workUnit || '').trim().slice(0, 30);
    const cementQuantityPerUnit = Number(body?.cementQuantityPerUnit);

    if (!dsrCode || !/^[A-Z0-9.:-]{1,50}$/.test(dsrCode)) {
      return NextResponse.json({ error: 'A valid DSR item number is required.' }, { status: 400 });
    }
    if (!description || !workUnit) {
      return NextResponse.json({ error: 'Description and work unit are required.' }, { status: 400 });
    }
    if (!Number.isFinite(cementQuantityPerUnit) || cementQuantityPerUnit <= 0 || cementQuantityPerUnit > 1000) {
      return NextResponse.json({ error: 'Coefficient must be greater than 0 and entered in MT per item unit.' }, { status: 400 });
    }

    const coefficient = await prisma.dsrCementCoefficient.upsert({
      where: { dsrCode },
      create: {
        dsrCode,
        description,
        workUnit,
        cementQuantityPerUnit,
        cementUnit: 'MT',
        source: 'DSR 2021 Analysis of Rates - admin verified',
        notes: 'Saved from Automatic PDF Bill Extraction.',
      },
      update: {
        description,
        workUnit,
        cementQuantityPerUnit,
        cementUnit: 'MT',
        source: 'DSR 2021 Analysis of Rates - admin verified',
        notes: 'Updated from Automatic PDF Bill Extraction.',
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, coefficient });
  } catch (error) {
    console.error('[dsr-cement-coefficients] Save failed:', error);
    return NextResponse.json({ error: 'Failed to save the DSR cement coefficient.' }, { status: 500 });
  }
}
