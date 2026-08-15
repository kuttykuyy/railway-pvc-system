

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterMonths } from '@/lib/pvc-calculations';
import { getWpiLinkingFactors, bridgeWpiValue } from '@/lib/wpi-series';
import { format } from 'date-fns';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { checkUserContractAccess } from '@/lib/permissions';

export const dynamic = "force-dynamic";

// GET /api/contracts/[id]/quarterly-averages - Get quarterly averages for all quarters
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const contractId = id;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    const access = requester ? await checkUserContractAccess(requester.id, contractId) : null;
    if (!access?.canView) return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });

    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });
    
    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Get all bills for this contract
    const bills = await prisma.bill.findMany({
      where: { contractId },
      orderBy: { dateOfMeasurement: 'asc' },
      include: {
        pvcCalculation: true,
        classificationEntries: { select: { subClassification: { select: { code: true, labour: true, plantMachinery: true, fuel: true, otherMaterials: true } } } },
      }
    });

    if (bills.length === 0) {
      return NextResponse.json({ quarterlyData: [] });
    }

    // Get unique quarters
    const quarters = [...new Set(bills.map((bill: any) => bill.quarter))].sort();

    // Which clause governs decides both the quarter months and the fuel series. This
    // screen used to assume the 2022 rule and classification 7A for every contract.
    const { resolvePre2022Setup } = await import('@/lib/pre2022-contract');
    const clauseSetup = resolvePre2022Setup(contract as any);
    const isPre2022 = clauseSetup.isPre2022 && !!contract.dateOfOpening;
    const { pre2022QuarterMonths } = await import('@/lib/pvc-pre2022');
    const { getFuelIndexNameForBill } = await import('@/lib/zone-steel-city-mapping');

    const wpiFactors = await getWpiLinkingFactors();
    const quarterlyData = [];

    for (const quarter of quarters) {
      const billsInQuarter = bills.filter((b: any) => b.quarter === quarter);
      const firstBill: any = billsInQuarter[0];

      const quarterMonths = isPre2022
        ? pre2022QuarterMonths(quarter as string, new Date(contract.dateOfOpening as any))
        : getQuarterMonths(quarter as string, new Date(contract.baseMonth));

      // The fuel series is the contract's own: the old clause uses the WPI Fuel &
      // Power group, and a 2022 contract uses the four-city average or its zone city
      // depending on what was agreed — never a fixed 'MPNG Fuel' for everyone.
      const fuelSeries = isPre2022
        ? 'WPI Fuel & Power'
        : getFuelIndexNameForBill(firstBill?.zone, firstBill?.fuelPriceType);

      const classificationIndices = ['Labour', 'RBI Plant Machinery', fuelSeries, 'RBI Other Materials'];

      // Percentages as this contract's own classifications state them. When the bills
      // in a quarter carry several different classifications there is no single
      // percentage to show, so none is claimed.
      const pctKeyFor = (indexName: string): 'labour' | 'plantMachinery' | 'fuel' | 'otherMaterials' | null =>
        indexName === 'Labour' ? 'labour'
        : indexName === 'RBI Plant Machinery' ? 'plantMachinery'
        : indexName === fuelSeries ? 'fuel'
        : indexName === 'RBI Other Materials' ? 'otherMaterials'
        : null;
      const subsUsed = billsInQuarter
        .flatMap((b: any) => b.classificationEntries || [])
        .map((e: any) => e.subClassification)
        .filter(Boolean);
      const distinctCodes = [...new Set(subsUsed.map((s: any) => s.code))];
      const percentageFor = (indexName: string): number | null => {
        const key = pctKeyFor(indexName);
        if (!key) return null;
        const values = [...new Set(subsUsed.map((s: any) => Number(s[key] ?? 0)))];
        return values.length === 1 ? values[0] : null;
      };

      // Money comes from the calculation the engine already stored for these bills —
      // never recomputed here. The screen used to multiply a HARDCODED bill value
      // (Rs 1,49,38,881.76) by 7A's percentages and print the result under the heading
      // "FORMULA FOR PVC CALCULATION", for every contract.
      const storedPvcFor = (indexName: string): number | null => {
        const key = pctKeyFor(indexName);
        if (!key) return null;
        const field = key === 'labour' ? 'labourPvc'
          : key === 'plantMachinery' ? 'plantMachineryPvc'
          : key === 'fuel' ? 'fuelPowerPvc'
          : 'otherMaterialsPvc';
        const withCalc = billsInQuarter.filter((b: any) => b.pvcCalculation);
        if (withCalc.length === 0) return null;
        return withCalc.reduce((sum: number, b: any) => sum + (b.pvcCalculation?.[field] ?? 0), 0);
      };

      const quarterData = {
        quarter,
        quarterMonths: quarterMonths.map(month => format(month, 'MMMM yyyy')),
        clause: isPre2022 ? 'pre-2022' : 'gcc-2022',
        billNos: billsInQuarter.map((b: any) => b.billNo),
        // The bills' own gross value in this quarter, for context beside the indices.
        billAmount: billsInQuarter.reduce((sum: number, b: any) => sum + (b.grossBillAmount ?? b.billAmount ?? 0), 0),
        classificationCodes: distinctCodes,
        mixedClassifications: distinctCodes.length > 1,
        totalPvc: billsInQuarter.some((b: any) => b.pvcCalculation)
          ? billsInQuarter.reduce((sum: number, b: any) => sum + (b.pvcCalculation?.totalPvc ?? 0), 0)
          : null,
        components: [] as any[]
      };

      // Get quarterly averages for each index
      for (const indexName of classificationIndices) {
        const priceIndex = await prisma.priceIndex.findUnique({
          where: { name: indexName }
        });

        if (!priceIndex) continue;

        // Get base value from actual monthly data for the base month
        const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: priceIndex.id,
            month: {
              gte: contract.baseMonth,
              lt: new Date(contract.baseMonth.getFullYear(), contract.baseMonth.getMonth() + 1, 1)
            }
          }
        });

        // If no base month data found, skip this index
        if (!baseMonthValue) continue;

        const monthlyValues = await prisma.monthlyIndexValue.findMany({
          where: {
            priceIndexId: priceIndex.id,
            month: {
              in: quarterMonths
            }
          }
        });

        // The WPI series changed base in May 2026: values from then on must cross the
        // same bridge the bill calculations use before comparison with the old-series
        // base month — without it this view showed a phantom ~30% fall.
        const bridgedValues = monthlyValues.map(mv => ({
          ...mv,
          value: bridgeWpiValue(indexName, contract.baseMonth, new Date(mv.month), mv.value, wpiFactors),
        }));
        // Only calculate average if there are at least 3 months of data for a valid quarter
        const average = bridgedValues.length >= 3
          ? bridgedValues.reduce((sum: number, val: any) => sum + val.value, 0) / bridgedValues.length
          : null;

        quarterData.components.push({
          indexName,
          baseValue: baseMonthValue.value, // Use actual base month value
          averageValue: average,
          componentPercentage: percentageFor(indexName),
          // What the engine actually computed for this component across the quarter's
          // bills — the figure the reports and the contract page show.
          storedPvc: storedPvcFor(indexName),
          monthlyValues: bridgedValues.map(mv => ({
            month: format(mv.month, 'MMMM yyyy'),
            value: mv.value
          }))
        });
      }

      quarterlyData.push(quarterData);
    }

    return NextResponse.json({
      contract: {
        agreementNo: contract.agreementNo,
        contractorName: contract.contractorName,
        baseMonth: format(new Date(contract.baseMonth), 'MMMM yyyy')
      },
      quarterlyData
    });
  } catch (error) {
    console.error('Error fetching quarterly averages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quarterly averages' },
      { status: 500 }
    );
  }
}
