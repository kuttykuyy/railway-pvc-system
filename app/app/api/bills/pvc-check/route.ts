import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateDedicatedCementPvc, calculateDedicatedSteelPvc } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { validateApiAccess } from '@/lib/payment-validation';
import { checkUserContractAccess } from '@/lib/permissions';
import { areFinalIndicesAvailableForBill } from '@/lib/index-status';
import { extractSteelTypesFromEntries } from '@/lib/steel-type-handler';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PVC_CHECK_FEE = 500;

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { customerAccount: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Parse request
    const body = await request.json();
    const {
      contractId,
      billNo,
      zone,
      fuelPriceType = 'four_city_avg',
      dateOfMeasurement,
      cementAmount = 0,
      steelTmtBarsAmount = 0,
      steelAngleChannelAmount = 0,
      steelPlatesAmount = 0,
      steelOtherSectionsAmount = 0,
      classificationEntries = [],
    } = body;

    if (!contractId || !dateOfMeasurement) {
      return NextResponse.json({ error: 'Missing required fields: contractId, dateOfMeasurement' }, { status: 400 });
    }

    // Check contract access
    const contractAccess = await checkUserContractAccess(user.id, contractId);
    if (!contractAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        agreementNo: true,
        baseMonth: true,
        isExtended: true,
        extensionType: true,
        originalCompletionDate: true,
      }
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Check balance (unless free account)
    const isFree = user.isFreeAccount || user.customProcessingFee === 0 || user.role === 'admin' || user.role === 'superadmin' || user.role === 'railway_official';
    if (!isFree) {
      const currentBalance = user.customerAccount?.creditBalance || 0;
      if (currentBalance < PVC_CHECK_FEE) {
        return NextResponse.json({
          error: `Insufficient balance. Required: ₹${PVC_CHECK_FEE}, Available: ₹${currentBalance}. Please add credits to continue.`,
          requiredAmount: PVC_CHECK_FEE,
          currentBalance,
        }, { status: 402 });
      }
    }

    // Validate measurement date
    const measurementDate = new Date(dateOfMeasurement);
    if (isNaN(measurementDate.getTime())) {
      return NextResponse.json({ error: 'Invalid measurement date' }, { status: 400 });
    }

    if (measurementDate <= contract.baseMonth) {
      return NextResponse.json({
        error: `Measurement date must be after contract base month (${contract.baseMonth.toDateString()})`
      }, { status: 400 });
    }

    // Check indices availability
    const indicesCheck = await areFinalIndicesAvailableForBill(measurementDate, contract.baseMonth);
    if (!indicesCheck.available) {
      return NextResponse.json({
        error: indicesCheck.message,
        missingMonths: indicesCheck.missingMonths
      }, { status: 400 });
    }

    // Calculate quarter
    let quarterDateForCalculation = measurementDate;
    if (contract.isExtended && contract.extensionType === '17B' && contract.originalCompletionDate && measurementDate > contract.originalCompletionDate) {
      quarterDateForCalculation = contract.originalCompletionDate;
    }
    const quarter = getQuarterFromDate(quarterDateForCalculation, contract.baseMonth);

    // Get quarterly averages
    const steelIndexNames = getSteelIndexNamesForZone(zone);
    const fuelIndexName = getFuelIndexNameForBill(zone, fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, 'auto');

    // Calculate PVC per classification entry
    let totalClassificationPvc = 0;
    let totalLabour = 0, totalPlant = 0, totalFuel = 0;
    let totalMaterials = 0, totalCement = 0, totalSteel = 0, totalExplosives = 0;

    const extractedSteelTypes = await extractSteelTypesFromEntries(classificationEntries);

    if (classificationEntries.length > 0) {
      const { calculateClassificationEntryPvc } = await import('@/lib/pvc-calculations');

      for (const entry of classificationEntries) {
        const hasValidAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined;
        if (!hasValidAmount || !entry.subClassificationId) continue;

        let hasSteelComponent = false;
        const subClass = await prisma.subClassification.findUnique({
          where: { id: entry.subClassificationId },
          select: { steel: true }
        });
        hasSteelComponent = (subClass?.steel ?? 0) > 0;

        const entrySteelTypes = entry.steelTypes?.length > 0
          ? entry.steelTypes
          : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);

        const entryPvc = await calculateClassificationEntryPvc(
          {
            subClassificationId: entry.subClassificationId,
            amount: parseFloat(entry.amount),
            steelTypes: entrySteelTypes
          },
          quarterlyAverages
        );

        totalLabour += entryPvc.labourPvc;
        totalPlant += entryPvc.plantMachineryPvc;
        totalFuel += entryPvc.fuelPowerPvc;
        totalMaterials += entryPvc.otherMaterialsPvc;
        totalCement += entryPvc.cementPvc;
        totalSteel += entryPvc.steelPvc;
        totalExplosives += entryPvc.explosivesPvc;
        totalClassificationPvc += entryPvc.totalPvc;
      }
    }

    // Calculate dedicated component PVCs
    const dedicatedCementPvc = calculateDedicatedCementPvc(parseFloat(cementAmount) || 0, quarterlyAverages);
    const dedicatedSteelTmtBarsPvc = calculateDedicatedSteelPvc(parseFloat(steelTmtBarsAmount) || 0, quarterlyAverages, 'Steel TMT Bars');
    const dedicatedSteelAngleChannelPvc = calculateDedicatedSteelPvc(parseFloat(steelAngleChannelAmount) || 0, quarterlyAverages, 'Steel Angle/Channel');
    const dedicatedSteelPlatesPvc = calculateDedicatedSteelPvc(parseFloat(steelPlatesAmount) || 0, quarterlyAverages, 'Steel Plates');
    const dedicatedSteelOtherSectionsPvc = calculateDedicatedSteelPvc(parseFloat(steelOtherSectionsAmount) || 0, quarterlyAverages, 'Steel Other Sections');
    const totalDedicatedSteelPvc = dedicatedSteelTmtBarsPvc + dedicatedSteelAngleChannelPvc + dedicatedSteelPlatesPvc + dedicatedSteelOtherSectionsPvc;

    const finalCementPvc = totalCement + dedicatedCementPvc;
    const finalSteelPvc = totalSteel + totalDedicatedSteelPvc;

    const totalPvc =
      totalLabour + totalPlant + totalFuel + totalMaterials +
      totalExplosives + finalCementPvc + finalSteelPvc;

    const isPositive = totalPvc >= 0;
    const chargedAmount = isFree ? 0 : PVC_CHECK_FEE;

    // Record PVC check and deduct balance in a transaction
    const [pvcCheck] = await prisma.$transaction([
      prisma.pvcCheck.create({
        data: {
          userId: user.id,
          contractId,
          billNo: billNo || null,
          zone: zone || null,
          fuelPriceType,
          dateOfMeasurement: measurementDate,
          totalPvc,
          isPositive,
          amount: chargedAmount,
          isFree,
          breakdown: {
            labour: totalLabour,
            plantMachinery: totalPlant,
            fuel: totalFuel,
            otherMaterials: totalMaterials,
            cement: finalCementPvc,
            steel: finalSteelPvc,
            explosives: totalExplosives,
            dedicatedCement: dedicatedCementPvc,
            dedicatedSteel: totalDedicatedSteelPvc,
          }
        }
      }),
      // Deduct balance if not free
      ...((!isFree && user.customerAccount) ? [
        prisma.customerAccount.update({
          where: { userId: user.id },
          data: { creditBalance: { decrement: PVC_CHECK_FEE } }
        })
      ] : [])
    ]);

    logger.log(`✅ PVC Check completed for user ${user.email}: ₹${totalPvc.toFixed(2)} (${isPositive ? 'POSITIVE' : 'NEGATIVE'}), charged ₹${chargedAmount}`);

    return NextResponse.json({
      success: true,
      totalPvc: Math.round(totalPvc * 100) / 100,
      isPositive,
      charged: chargedAmount,
      breakdown: {
        labour: Math.round(totalLabour * 100) / 100,
        plantMachinery: Math.round(totalPlant * 100) / 100,
        fuel: Math.round(totalFuel * 100) / 100,
        otherMaterials: Math.round(totalMaterials * 100) / 100,
        cement: Math.round(finalCementPvc * 100) / 100,
        steel: Math.round(finalSteelPvc * 100) / 100,
        explosives: Math.round(totalExplosives * 100) / 100,
      },
      quarter,
      contractAgreementNo: contract.agreementNo,
    });

  } catch (error: any) {
    console.error('PVC Check error:', error);
    return NextResponse.json({ error: error.message || 'PVC check failed' }, { status: 500 });
  }
}

