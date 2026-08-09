
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateTotalPvc, calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { validateApiAccess } from '@/lib/payment-validation';
import { checkUserContractAccess } from '@/lib/permissions';
import { handleApiError, AppError } from '@/lib/error-handler';
import { recalculateCumulativePvcForContract } from '@/lib/recalculateCumulativePvc';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { getBillingSettings } from '@/lib/admin-settings';
import { resolveBillClassificationPolicy } from '@/lib/bill-classification-policy';

export const dynamic = "force-dynamic";

interface BillInput {
  billNo: string;
  fuelPriceType?: string;
  dateOfMeasurement: string;
  zone?: string;
  isAiUploaded?: boolean;
  grossBillAmount?: number;
  billAmount?: number;
  steelTmtBarsAmount?: number;
  steelAngleChannelAmount?: number;
  steelPlatesAmount?: number;
  steelOtherSectionsAmount?: number;
  cementAmount?: number;
  classificationEntries: Array<{
    subClassificationId: string;
    amount: number;
    description?: string;
    classificationJustification?: string;
    itemNumber?: string;
    quantity?: number;
    agreementRate?: number;
    steelTypes?: string[];
  }>;
  processingFee: number;
}

interface BulkCreateRequest {
  contractId: string;
  bills: BillInput[];
}

export async function POST(request: NextRequest) {
  try {
    // Validate API access
    const { authorized, user, message: authMessage } = await validateApiAccess(request);
    
    if (!authorized || !user) {
      return NextResponse.json(
        { error: authMessage || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body: BulkCreateRequest = await request.json();
    const { contractId, bills } = body;

    // Validate input
    if (!contractId || !bills || !Array.isArray(bills) || bills.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: contractId and bills array required' },
        { status: 400 }
      );
    }

    // Check contract access
    const contractAccess = await checkUserContractAccess(user.id, contractId);
    if (!contractAccess?.canEdit) {
      return NextResponse.json(
        { error: 'Access denied to this contract' },
        { status: 403 }
      );
    }

    // Get contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Get base month
    const baseMonth = new Date(contract.baseMonth);

    // Get user with account info
    const userWithAccount = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        customerAccount: true
      }
    });

    if (!userWithAccount) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has a free account or sufficient balance
    const isFreeAccount = userWithAccount.customProcessingFee === 0 || userWithAccount.isFreeAccount || userWithAccount.role === 'superadmin' || userWithAccount.role === 'admin' || userWithAccount.role === 'railway_official';
    const billingSettings = await getBillingSettings();
    // Per-bill fee matches single-bill pricing: AI-extracted bills use the AI rate,
    // manually entered bills use the manual rate.
    const aiBillCost = billingSettings.aiBillCost || 499;
    const manualBillCost = billingSettings.billCost || 199;
    const feeForBill = (bill: BillInput) => isFreeAccount ? 0 : (bill.isAiUploaded ? aiBillCost : manualBillCost);
    const totalProcessingFee = bills.reduce((sum, bill) => sum + feeForBill(bill), 0);
    
    if (!isFreeAccount) {
      const currentBalance = userWithAccount.customerAccount?.creditBalance || 0;
      
      if (currentBalance < totalProcessingFee) {
        return NextResponse.json(
          { 
            error: 'Insufficient credit balance',
            details: `You need ${totalProcessingFee} credits to create ${bills.length} bills, but your balance is ${currentBalance} credits.`,
            required: totalProcessingFee,
            available: currentBalance,
            shortfall: totalProcessingFee - currentBalance
          },
          { status: 402 } // Payment Required
        );
      }
    }

    // STEP 1: Validate all bills upfront before creating any
    const validationErrors: string[] = [];
    const duplicateBillNumbers: string[] = [];

    for (const billInput of bills) {
      // Validate bill data
      if (!billInput.billNo || !billInput.dateOfMeasurement || !billInput.classificationEntries || billInput.classificationEntries.length === 0) {
        validationErrors.push(`Bill ${billInput.billNo || 'Unknown'}: Missing required data (billNo, dateOfMeasurement, or classificationEntries)`);
        continue;
      }

      const classificationPolicy = await resolveBillClassificationPolicy(
        contract.workDescription,
        billInput.classificationEntries,
        billInput,
      );
      billInput.cementAmount = classificationPolicy.cementAmount;
      billInput.steelTmtBarsAmount = classificationPolicy.steelTmtBarsAmount;
      billInput.steelAngleChannelAmount = classificationPolicy.steelAngleChannelAmount;
      billInput.steelPlatesAmount = classificationPolicy.steelPlatesAmount;
      billInput.steelOtherSectionsAmount = classificationPolicy.steelOtherSectionsAmount;

      // Check for duplicate bill number in database
      const existingBill = await prisma.bill.findFirst({
        where: {
          contractId,
          billNo: { equals: billInput.billNo.trim(), mode: 'insensitive' },
        },
      });

      if (existingBill) {
        duplicateBillNumbers.push(billInput.billNo);
      }

      // Validate measurement date
      const measurementDate = new Date(billInput.dateOfMeasurement);
      if (isNaN(measurementDate.getTime())) {
        validationErrors.push(`Bill ${billInput.billNo}: Invalid measurement date (${billInput.dateOfMeasurement})`);
      } else if (measurementDate <= baseMonth) {
        validationErrors.push(`Bill ${billInput.billNo}: Measurement date must be after the contract base month`);
      }

      const classificationTotal = billInput.classificationEntries.reduce(
        (sum, entry) => sum + (Number(entry.amount) || 0),
        0
      );
      const declaredBillAmount = Number(billInput.grossBillAmount || billInput.billAmount || 0);

      if (declaredBillAmount <= 0) {
        validationErrors.push(`Bill ${billInput.billNo}: Bill amount is required`);
      } else if (Math.abs(declaredBillAmount - classificationTotal) > 0.01) {
        validationErrors.push(
          `Bill ${billInput.billNo}: Classification total (${classificationTotal.toFixed(2)}) must match bill amount (${declaredBillAmount.toFixed(2)})`
        );
      }
    }

    // If there are any validation errors or duplicates, return them all at once
    if (validationErrors.length > 0 || duplicateBillNumbers.length > 0) {
      const errorMessage = [];
      
      if (duplicateBillNumbers.length > 0) {
        errorMessage.push(`The following bill numbers already exist for this contract: ${duplicateBillNumbers.join(', ')}`);
      }
      
      if (validationErrors.length > 0) {
        errorMessage.push(`Validation errors:\n${validationErrors.join('\n')}`);
      }

      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessage.join('\n\n'),
          duplicateBills: duplicateBillNumbers,
          validationErrors: validationErrors
        },
        { status: 400 }
      );
    }

    // STEP 2: Generate unique batch ID and name for this bulk creation
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const billNumbers = bills.map(b => b.billNo).join(', ');
    const batchName = bills.length > 3 
      ? `Batch: ${bills[0].billNo} to ${bills[bills.length - 1].billNo} (${bills.length} bills)` 
      : `Batch: ${billNumbers}`;

    // STEP 3: Create all bills (validation already passed)
    const createdBills = [];

    // Get current bill count for contract to generate sequential PVC numbers
    // Get all existing bills for contract to calculate next sequential PVC numbers safely
    const contractBills = await prisma.bill.findMany({
      where: { contractId },
      select: { pvcNumber: true }
    });
    let maxSequence = 0;
    for (const b of contractBills) {
      if (b.pvcNumber) {
        const parts = b.pvcNumber.split('/');
        const lastPart = parts[parts.length - 1];
        const seq = parseInt(lastPart, 10);
        if (!isNaN(seq) && seq > maxSequence) {
          maxSequence = seq;
        }
      }
    }

    for (let i = 0; i < bills.length; i++) {
      const billInput = bills[i];
      const measurementDate = new Date(billInput.dateOfMeasurement);
      const quarter = getQuarterFromDate(measurementDate, baseMonth);

      // Validate declared amount above, then preserve it for the bill total.
      const classificationTotal = billInput.classificationEntries.reduce(
        (sum, entry) => sum + Number(entry.amount),
        0
      );
      const grossBillAmount = Number(billInput.grossBillAmount || billInput.billAmount || classificationTotal);

      // Generate PVC auto-number
      const sequenceNumber = String(maxSequence + i + 1).padStart(3, '0');
      const autoPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;

      // Get quarterly averages for PVC calculation
      // Use zone-based steel city prices instead of default Chennai rates
      const steelIndexNames = getSteelIndexNamesForZone(billInput.zone);
      const fuelIndexName = getFuelIndexNameForBill(billInput.zone, billInput.fuelPriceType);
      const allIndices = [
        'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
        'RBI Cement', 'RBI Explosives',
        ...steelIndexNames
      ];
      
      const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, baseMonth, 'auto');
      
      if (!quarterlyAverages || quarterlyAverages.length === 0) {
        throw new AppError(
          `Indices not found for quarter: ${quarter}. Please ensure indices are available for ${billInput.dateOfMeasurement}`,
          'INDICES_NOT_FOUND',
          400
        );
      }

      // Calculate per-entry PVC calculations to match single-bill logic exactly
      const { calculateClassificationEntryPvc } = await import('@/lib/pvc-calculations');
      const { extractSteelTypesFromEntries } = await import('@/lib/steel-type-handler');
      
      const extractedSteelTypes = await extractSteelTypesFromEntries(billInput.classificationEntries);

      const classificationEntriesData = [];
      let totalLabourPvc = 0;
      let totalPlantMachineryPvc = 0;
      let totalFuelPowerPvc = 0;
      let totalOtherMaterialsPvc = 0;
      let totalCementPvc = 0;
      let totalExplosivesPvc = 0;
      let totalSteelPvc = 0;

      for (const entry of billInput.classificationEntries) {
        let hasSteelComponent = false;
        if (entry.subClassificationId) {
          const subClass = await prisma.subClassification.findUnique({
            where: { id: entry.subClassificationId },
            select: { steel: true }
          });
          hasSteelComponent = (subClass?.steel ?? 0) > 0;
        }

        const entrySteelTypes = entry.steelTypes && entry.steelTypes.length > 0 
          ? entry.steelTypes 
          : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);

        const hasDedicatedCement = billInput.cementAmount && Number(billInput.cementAmount) > 0;
        const hasDedicatedSteel = 
          (billInput.steelTmtBarsAmount && Number(billInput.steelTmtBarsAmount) > 0) ||
          (billInput.steelAngleChannelAmount && Number(billInput.steelAngleChannelAmount) > 0) ||
          (billInput.steelPlatesAmount && Number(billInput.steelPlatesAmount) > 0) ||
          (billInput.steelOtherSectionsAmount && Number(billInput.steelOtherSectionsAmount) > 0);

        const entryPvc = await calculateClassificationEntryPvc(
          {
            subClassificationId: entry.subClassificationId,
            amount: Number(entry.amount),
            steelTypes: entrySteelTypes
          },
          quarterlyAverages,
          {
            hasDedicatedSteel,
            hasDedicatedCement
          }
        );

        totalLabourPvc += entryPvc.labourPvc;
        totalPlantMachineryPvc += entryPvc.plantMachineryPvc;
        totalFuelPowerPvc += entryPvc.fuelPowerPvc;
        totalOtherMaterialsPvc += entryPvc.otherMaterialsPvc;
        totalCementPvc += entryPvc.cementPvc;
        totalSteelPvc += entryPvc.steelPvc;
        totalExplosivesPvc += entryPvc.explosivesPvc;

        classificationEntriesData.push({
          subClassificationId: entry.subClassificationId,
          amount: Number(entry.amount),
          description: entry.description || '',
          classificationJustification: entry.classificationJustification || null,
          itemNumber: entry.itemNumber || null,
          quantity: entry.quantity || null,
          agreementRate: entry.agreementRate || null,
          steelTypes: entrySteelTypes,
          labourPvc: entryPvc.labourPvc,
          plantMachineryPvc: entryPvc.plantMachineryPvc,
          fuelPowerPvc: entryPvc.fuelPowerPvc,
          otherMaterialsPvc: entryPvc.otherMaterialsPvc,
          cementPvc: entryPvc.cementPvc,
          steelPvc: entryPvc.steelPvc,
          explosivesPvc: entryPvc.explosivesPvc,
          totalPvc: entryPvc.totalPvc
        });
      }

      // Create bill with classification entries including their calculated PVC values
      const bill = await prisma.bill.create({
        data: {
          contractId,
          billNo: billInput.billNo.trim(),
          // Per bill: a batch can mix typed and uploaded, and each was priced on its own flag.
          createdVia: billInput.isAiUploaded ? 'pdf' : 'manual',
          grossBillAmount,
          billAmount: grossBillAmount, // No non-schedule items for now
          dateOfMeasurement: measurementDate,
          quarter,
          pvcNumber: autoPvcNumber, // Add PVC auto-number
          zone: billInput.zone || null,
          fuelPriceType: billInput.fuelPriceType || 'four_city_avg',
          processingFee: feeForBill(billInput),
          isChargeable: true,
          batchId, // Assign batch ID for grouping
          batchName, // Assign batch name for display
          // Include cement and steel amounts
          cementAmount: billInput.cementAmount || 0,
          steelTmtBarsAmount: billInput.steelTmtBarsAmount || 0,
          steelAngleChannelAmount: billInput.steelAngleChannelAmount || 0,
          steelPlatesAmount: billInput.steelPlatesAmount || 0,
          steelOtherSectionsAmount: billInput.steelOtherSectionsAmount || 0,
          steelTypes: extractedSteelTypes,
          classificationEntries: {
            create: classificationEntriesData
          },
        },
        include: {
          classificationEntries: {
            include: {
              subClassification: true,
            },
          },
        },
      });

      // Calculate dedicated cement and steel PVC (if provided)
      let dedicatedCementPvc = 0;
      let dedicatedSteelTmtBarsPvc = 0;
      let dedicatedSteelAngleChannelPvc = 0;
      let dedicatedSteelPlatesPvc = 0;
      let dedicatedSteelOtherSectionsPvc = 0;

      if (billInput.cementAmount && billInput.cementAmount > 0) {
        dedicatedCementPvc = calculateDedicatedCementPvc(billInput.cementAmount, quarterlyAverages);
      }

      if (billInput.steelTmtBarsAmount && billInput.steelTmtBarsAmount > 0) {
        dedicatedSteelTmtBarsPvc = calculateDedicatedSteelPvc(
          billInput.steelTmtBarsAmount,
          quarterlyAverages,
          'Steel TMT Bars'
        );
      }

      if (billInput.steelAngleChannelAmount && billInput.steelAngleChannelAmount > 0) {
        dedicatedSteelAngleChannelPvc = calculateDedicatedSteelPvc(
          billInput.steelAngleChannelAmount,
          quarterlyAverages,
          'Steel Angle/Channel'
        );
      }

      if (billInput.steelPlatesAmount && billInput.steelPlatesAmount > 0) {
        dedicatedSteelPlatesPvc = calculateDedicatedSteelPvc(
          billInput.steelPlatesAmount,
          quarterlyAverages,
          'Steel Plates'
        );
      }

      if (billInput.steelOtherSectionsAmount && billInput.steelOtherSectionsAmount > 0) {
        dedicatedSteelOtherSectionsPvc = calculateDedicatedSteelPvc(
          billInput.steelOtherSectionsAmount,
          quarterlyAverages,
          'Steel Other Sections'
        );
      }

      // Calculate total PVC from classification-based components
      const classificationBasedPvc =
        totalLabourPvc +
        totalPlantMachineryPvc +
        totalFuelPowerPvc +
        totalOtherMaterialsPvc +
        totalCementPvc +
        totalExplosivesPvc +
        totalSteelPvc;

      // CRITICAL: SUMMATION LOGIC - Add both classification AND dedicated components together
      const totalPvc =
        totalLabourPvc +
        totalPlantMachineryPvc +
        totalFuelPowerPvc +
        totalOtherMaterialsPvc +
        totalCementPvc +                       // Classification cement (always included)
        totalExplosivesPvc +
        totalSteelPvc +                        // Classification steel (always included)
        dedicatedCementPvc +                   // Dedicated cement (added on top)
        dedicatedSteelTmtBarsPvc +             // Dedicated steel TMT (added on top)
        dedicatedSteelAngleChannelPvc +        // Dedicated steel angle/channel (added on top)
        dedicatedSteelPlatesPvc +              // Dedicated steel plates (added on top)
        dedicatedSteelOtherSectionsPvc;        // Dedicated steel other (added on top)

      // Get previous cumulative PVC
      const previousBills = await prisma.bill.findMany({
        where: {
          contractId,
          dateOfMeasurement: {
            lt: measurementDate,
          },
        },
        include: {
          pvcCalculation: true,
        },
        orderBy: {
          dateOfMeasurement: 'desc',
        },
      });

      const previousPvcTotal = previousBills.length > 0 && previousBills[0].pvcCalculation
        ? previousBills[0].pvcCalculation.cumulativePvc
        : 0;

      const cumulativePvc = previousPvcTotal + totalPvc;

      // Create PVC calculation
      await prisma.pvcCalculation.create({
        data: {
          contractId,
          billId: bill.id,
          labourPvc: totalLabourPvc,
          plantMachineryPvc: totalPlantMachineryPvc,
          fuelPowerPvc: totalFuelPowerPvc,
          otherMaterialsPvc: totalOtherMaterialsPvc,
          cementPvc: totalCementPvc,
          explosivesPvc: totalExplosivesPvc,
          steelPvc: totalSteelPvc,
          // Dedicated cement and steel PVC (85% calculations)
          dedicatedCementPvc,
          dedicatedSteelTmtBarsPvc,
          dedicatedSteelAngleChannelPvc,
          dedicatedSteelPlatesPvc,
          dedicatedSteelOtherSectionsPvc,
          totalPvc,
          previousPvcTotal,
          cumulativePvc,
        },
      });

      createdBills.push(bill);
    }

    // Recalculate cumulative PVC for all bills in this contract
    // This ensures correct cumulative values even when bills are created in bulk
    await recalculateCumulativePvcForContract(contractId);

    // Deduct processing fee and create transaction records
    let creditInfo = { cost: 0, remainingBalance: 0 };
    
    if (isFreeAccount) {
      // Free account - no charge
      creditInfo = { cost: 0, remainingBalance: -1 }; // -1 indicates free account
      
      // Create bill transaction records for each bill (free)
      for (const bill of createdBills) {
        await prisma.billTransaction.create({
          data: {
            billId: bill.id,
            userId: user.id,
            amount: 0,
            originalAmount: bill.processingFee || 0,
            discount: bill.processingFee || 0,
            status: 'paid',
            isFree: true
          }
        });
      }
    } else {
      // Deduct total processing fee and record the transaction atomically, reading the
      // balance inside the transaction so balanceBefore/After match the actual DB value
      // even if the balance changed concurrently (e.g. a top-up or a second submission).
      const remainingBalance = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { totalBillsProcessed: { increment: createdBills.length } }
        });
        const account = await tx.customerAccount.findUnique({
          where: { userId: user.id },
          select: { creditBalance: true }
        });
        const balanceBefore = account?.creditBalance ?? 0;
        const balanceAfter = balanceBefore - totalProcessingFee;
        await tx.customerAccount.update({
          where: { userId: user.id },
          data: { creditBalance: { decrement: totalProcessingFee } }
        });
        await tx.creditTransaction.create({
          data: {
            userId: user.id,
            amount: -totalProcessingFee,
            type: 'bill_usage',
            reason: `Bulk bill processing: ${createdBills.length} bills`,
            balanceBefore,
            balanceAfter
          }
        });
        return balanceAfter;
      });

      // Create bill transaction records for each bill
      for (const bill of createdBills) {
        await prisma.billTransaction.create({
          data: {
            billId: bill.id,
            userId: user.id,
            amount: bill.processingFee || 0,
            originalAmount: bill.processingFee || 0,
            discount: 0,
            status: 'paid',
            isFree: false
          }
        });
      }

      creditInfo = {
        cost: totalProcessingFee,
        remainingBalance
      };
    }

    return NextResponse.json({
      success: true,
      count: createdBills.length,
      bills: createdBills.map((b) => ({ id: b.id, billNo: b.billNo })),
      creditInfo,
      message: isFreeAccount 
        ? `Successfully created ${createdBills.length} bills (free account)` 
        : `Successfully created ${createdBills.length} bills - ${totalProcessingFee} credits deducted`
    });
  } catch (error: any) {
    const errorResponse = handleApiError(error);
    return NextResponse.json(
      { error: errorResponse.message, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
