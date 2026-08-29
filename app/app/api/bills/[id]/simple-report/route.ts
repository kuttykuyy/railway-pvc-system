import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';
import { buildAccountsChecklist } from '@/lib/accounts-checklist';
import { generateSimpleSummaryReport } from '@/lib/pdf/generators/simple-summary-report';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

// GET /api/bills/[id]/simple-report
// A one-page, plain-language PVC summary for the department (accounts / executive) user —
// the essentials only, in place of the full detailed statement.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!requester) return NextResponse.json({ error: 'User not found' }, { status: 401 });
    const access = await checkUserBillAccess(requester.id, id);
    if (!access?.canDownloadPdf) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        pvcCalculation: true,
        classificationEntries: {
          include: {
            subClassification: {
              select: {
                code: true, name: true, labour: true, steel: true, cement: true, fuel: true,
                plantMachinery: true, otherMaterials: true, explosives: true, fixed: true,
              },
            },
          },
        },
        contract: {
          select: {
            agreementNo: true, contractorName: true, workDescription: true, baseMonth: true,
            user: { select: { reportHeaderText: true } },
          },
        },
      },
    });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    if (!bill.pvcCalculation) {
      return NextResponse.json({ error: 'This bill has no PVC calculation yet.' }, { status: 400 });
    }

    const pvc = bill.pvcCalculation;
    const checklist = (await buildAccountsChecklist(id)) || [];

    const steel = (pvc.steelPvc || 0) + (pvc.dedicatedSteelPvc || 0)
      + (pvc.dedicatedSteelTmtBarsPvc || 0) + (pvc.dedicatedSteelAngleChannelPvc || 0)
      + (pvc.dedicatedSteelPlatesPvc || 0) + (pvc.dedicatedSteelOtherSectionsPvc || 0);
    const cement = (pvc.cementPvc || 0) + (pvc.dedicatedCementPvc || 0);

    // The distinct classifications used on this bill, with their fixed component %s.
    const byCode = new Map<string, any>();
    for (const e of bill.classificationEntries) {
      const s = e.subClassification;
      if (s?.code && !byCode.has(s.code)) byCode.set(s.code, s);
    }
    const classesUsed = [...byCode.values()].map((s) => ({
      code: s.code, name: s.name,
      labour: s.labour, steel: s.steel, cement: s.cement, fuel: s.fuel,
      plantMachinery: s.plantMachinery, otherMaterials: s.otherMaterials, explosives: s.explosives, fixed: s.fixed,
    }));

    // A worked example on one real component (labour), so the method is followable once.
    let workedExample: any = undefined;
    try {
      const baseMonth = new Date(bill.contract.baseMonth);
      const [labourAvg] = await getQuarterlyAverages(bill.quarter, ['Labour'], baseMonth, 'auto');
      if (labourAvg && labourAvg.baseValue > 0) {
        workedExample = {
          component: 'Labour',
          baseMonthLabel: format(baseMonth, 'MMM yyyy'),
          baseIndex: labourAvg.baseValue,
          quarter: bill.quarter || '-',
          currentIndex: labourAvg.average,
        };
      }
    } catch (e) {
      console.error('simple-report worked example failed (non-fatal):', e);
    }

    const bytes = generateSimpleSummaryReport({
      organizationName: bill.contract.user?.reportHeaderText || 'INDIAN RAILWAY',
      workDescription: bill.contract.workDescription || '-',
      agreementNo: bill.contract.agreementNo || '-',
      contractorName: bill.contract.contractorName || '-',
      billNo: bill.billNo || '-',
      pvcNumber: bill.pvcNumber,
      dateOfMeasurement: new Date(bill.dateOfMeasurement),
      quarter: bill.quarter || '-',
      baseMonth: new Date(bill.contract.baseMonth),
      billAmount: Number(bill.grossBillAmount) || 0,
      isProvisional: !!pvc.usedProvisionalIndices,
      components: {
        labour: pvc.labourPvc || 0,
        plantMachinery: pvc.plantMachineryPvc || 0,
        fuelPower: pvc.fuelPowerPvc || 0,
        cement,
        steel,
        otherMaterials: pvc.otherMaterialsPvc || 0,
        explosives: pvc.explosivesPvc || 0,
      },
      thisBillPvc: pvc.totalPvc || 0,
      previousCumulativePvc: pvc.previousPvcTotal || 0,
      cumulativePvc: pvc.cumulativePvc || 0,
      checklist,
      classesUsed,
      workedExample,
    });

    const safeBillNo = String(bill.billNo || id).replace(/[^A-Za-z0-9-]+/g, '_');
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PVC_Summary_${safeBillNo}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('Simple report error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to generate summary' }, { status: 500 });
  }
}
