
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { prisma } from '@/lib/db';
import { notifyBillByWhatsApp, notifyAdminOfBillBatch } from '@/lib/bill-whatsapp';
import { getQuarterFromDate, calculateTotalPvc, calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc } from '@/lib/pvc-calculations';
import { createQuarterlyAveragesMemo } from '@/lib/db-utils';
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
  /** Cl.46A.1(a): railway-supplied material is outside the value PVC is computed on. */
  railwaySuppliedMaterialValue?: number;
  /** Cl.46A.1(b): extra items ordered under Cl.39(1)(b), likewise outside it. */
  extraItemsOutsidePvc?: number;
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
    /**
     * The per-item rows behind the entry — billed amount, description, bill page.
     * The single-bill route has always stored these; this one silently dropped them,
     * so a bulk-created bill's statement rebuilt every amount as Qty x Rate (wrong
     * wherever a special condition prices the row) and had no page numbers to print.
     */
    itemRows?: Array<Record<string, unknown>>;
  }>;
  processingFee: number;
  /** The kept copy of the PDF this row was read from, attached once the bill exists. */
  uploadedDocumentId?: number | null;
}

interface BulkCreateRequest {
  contractId: string;
  bills: BillInput[];
}

export async function POST(request: NextRequest) {
  // A batch imported together shares quarters; it also means every bill in one import is priced from one reading of the indices.
  const quarterlyAveragesFor = createQuarterlyAveragesMemo();
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

    // Check if user has a free account or sufficient balance. accounts_official is in
    // the list because payment-validation treats it as free — this route's own copy of
    // the free roles had drifted and charged them.
    const isFreeAccount = userWithAccount.customProcessingFee === 0 || userWithAccount.isFreeAccount || userWithAccount.role === 'superadmin' || userWithAccount.role === 'admin' || userWithAccount.role === 'railway_official' || userWithAccount.role === 'accounts_official';
    const billingSettings = await getBillingSettings();
    // Per-bill fee matches single-bill pricing: AI-extracted bills use the AI rate,
    // manually entered bills use the manual rate.
    const aiBillCost = billingSettings.aiBillCost || 499;
    const manualBillCost = billingSettings.billCost || 199;
    // A positive customProcessingFee is a negotiated per-bill rate. The single-bill
    // path has always honoured it; this route charged such customers the standard rate
    // on every bulk bill — the same bill priced two ways depending on the screen used.
    const negotiatedFee = userWithAccount.customProcessingFee !== null && userWithAccount.customProcessingFee > 0
      ? userWithAccount.customProcessingFee
      : null;
    const feeForBill = (bill: BillInput) =>
      isFreeAccount ? 0 : (negotiatedFee ?? (bill.isAiUploaded ? aiBillCost : manualBillCost));

    // (The free-trial claim happens AFTER validation, below — claiming here burned the
    // trial on any batch that was then rejected with nothing created.)

    // STEP 1: Validate all bills upfront before creating any
    const validationErrors: string[] = [];
    const duplicateBillNumbers: string[] = [];

    // Every bill number already on this contract, read once. This used to be a
    // findFirst per bill inside the loop below — a twenty-bill import asked the
    // database twenty separate times what one query answers. Lower-cased on both sides
    // because the check has always been case-insensitive.
    const existingBillNos = new Set(
      (await prisma.bill.findMany({ where: { contractId }, select: { billNo: true } }))
        .map(b => (b.billNo || '').trim().toLowerCase()),
    );

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

      // Check for duplicate bill number against the set read above.
      if (existingBillNos.has(billInput.billNo.trim().toLowerCase())) {
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

    // STEP 1B: Claim the free trial — after validation, so a rejected batch costs
    // nothing, and with the same agreement-number dedup the single-bill path enforces
    // (this route never consulted trialClaimedAgreement, so one agreement could farm a
    // fresh trial from any number of accounts through a batch of one).
    const { normalizeAgreementNo } = await import('@/lib/railway-division-helper');
    // Both names the agreement answers to — its own number and the LOA number a
    // contract stands on until its first bill. Claiming one and not the other let the
    // same agreement take a second free bill under its other name.
    const trialNames = Array.from(new Set(
      [contract.agreementNo, contract.loaNo]
        .map(value => normalizeAgreementNo(String(value || '')))
        .filter(Boolean) as string[],
    ));
    let trialCount = 0;
    let trialAgreementClaimed = false;
    if (!isFreeAccount) {
      const trialLimit = billingSettings.freeTrialBills || 1;
      const wanted = Math.min(bills.length, Math.max(0, trialLimit - (userWithAccount.freeTrialUsed || 0)));
      if (wanted > 0) {
        try {
          await prisma.$transaction(async (tx) => {
            const claimed = await tx.user.updateMany({
              where: { id: user.id, freeTrialUsed: { lte: trialLimit - wanted } },
              data: { freeTrialUsed: { increment: wanted } },
            });
            if (claimed.count === 0) throw new Error('TRIAL_EXHAUSTED');
            for (const normalizedAgreementNo of trialNames) {
              // Hard create: P2002 means this agreement already claimed a trial
              // (any account) — the whole transaction rolls back and the batch pays.
              await tx.trialClaimedAgreement.create({
                data: { normalizedAgreementNo, claimedByUserId: user.id },
              });
            }
          });
          trialCount = wanted;
          trialAgreementClaimed = trialNames.length > 0;
        } catch {
          trialCount = 0; // exhausted, raced, or agreement already claimed — charge instead
        }
      }
    }

    // Undo the claim when the batch dies after it was made — without this, a failed
    // batch consumed the trial (and pinned the agreement) while delivering nothing.
    const releaseTrialClaim = async () => {
      if (trialCount <= 0) return;
      await prisma.user.updateMany({
        where: { id: user.id },
        data: { freeTrialUsed: { decrement: trialCount } },
      }).catch((e) => console.error('Could not return trial claim:', e));
      if (trialAgreementClaimed && trialNames.length > 0) {
        await prisma.trialClaimedAgreement.deleteMany({
          where: { normalizedAgreementNo: { in: trialNames }, claimedByUserId: user.id },
        }).catch((e) => console.error('Could not release trial agreement claim:', e));
      }
      trialCount = 0;
      trialAgreementClaimed = false;
    };

    const totalProcessingFee = bills.reduce((sum, bill, index) => sum + (index < trialCount ? 0 : feeForBill(bill)), 0);

    if (!isFreeAccount) {
      const currentBalance = userWithAccount.customerAccount?.creditBalance || 0;
      if (currentBalance < totalProcessingFee) {
        await releaseTrialClaim();
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

    // STEP 2: Generate unique batch ID and name for this bulk creation
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const billNumbers = bills.map(b => b.billNo).join(', ');
    const batchName = bills.length > 3 
      ? `Batch: ${bills[0].billNo} to ${bills[bills.length - 1].billNo} (${bills.length} bills)` 
      : `Batch: ${billNumbers}`;

    // STEP 3: Create all bills (validation already passed)
    const createdBills = [];
    /** What the contractor and the admin are told about, once the batch has committed. */
    const notifiable: Array<{ id: string; billNo: string; totalPvc: number }> = [];

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

    // Everything from here to the charge is one unit: if any bill mid-loop throws, or
    // the charge itself fails (the in-transaction balance re-check can refuse what the
    // advisory pre-check let through), the bills created so far must not survive — a
    // bill with no billTransaction row reads as fully paid to every watermark check.
    // The single-bill route deletes on failed charge; this route now does the same.
    let creditInfo = { cost: 0, remainingBalance: 0 };
    try {
    // Which clause counts the quarters — the old one starts them the month after the
    // OPENING month, not the month after the base month. Resolved once for the batch.
    const { resolvePre2022Setup } = await import('@/lib/pre2022-contract');
    const { pre2022QuarterFromDate } = await import('@/lib/pvc-pre2022');
    const clauseSetup = resolvePre2022Setup(contract as any);
    const quarterFor = (date: Date) =>
      clauseSetup.isPre2022 && contract.dateOfOpening
        ? pre2022QuarterFromDate(date, new Date(contract.dateOfOpening))
        : getQuarterFromDate(date, baseMonth);

    for (let i = 0; i < bills.length; i++) {
      const billInput = bills[i];
      const measurementDate = new Date(billInput.dateOfMeasurement);
      const quarter = quarterFor(measurementDate);

      // Validate declared amount above, then preserve it for the bill total.
      const classificationTotal = billInput.classificationEntries.reduce(
        (sum, entry) => sum + Number(entry.amount),
        0
      );
      const grossBillAmount = Number(billInput.grossBillAmount || billInput.billAmount || classificationTotal);

      // What Cl.46A.1 puts outside price adjustment: railway-supplied material, and
      // extra items ordered under Cl.39(1)(b) where PVC was not specially agreed for
      // them. The single-bill route has excluded these since they were added; this one
      // never did, so a batch quietly paid variation on material the contractor never
      // bought. The billed amounts are untouched — that is the real work value — and
      // only the base the variation is worked out on is reduced, spread across the
      // entries in proportion to their amounts, exactly as the single-bill route does.
      const outsidePvc = Math.max(0, Number(billInput.railwaySuppliedMaterialValue) || 0)
        + Math.max(0, Number(billInput.extraItemsOutsidePvc) || 0);
      const pvcBaseFactor = outsidePvc > 0 && classificationTotal > outsidePvc
        ? (classificationTotal - outsidePvc) / classificationTotal
        : 1;

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
      
      const quarterlyAverages = await quarterlyAveragesFor(quarter, allIndices, baseMonth, 'auto');
      
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

      const { getClassificationComponents } = await import('@/lib/pvc-calculations');

      for (const entry of billInput.classificationEntries) {
        let hasSteelComponent = false;
        if (entry.subClassificationId) {
          // The same row calculateClassificationEntryPvc needs below, read through the
          // shared cache instead of a second query per entry.
          const subClass = await getClassificationComponents(entry.subClassificationId);
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
            amount: Number(entry.amount) * pvcBaseFactor,
            steelTypes: entrySteelTypes,
            itemRows: entry.itemRows || null
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
          itemRows: Array.isArray(entry.itemRows) && entry.itemRows.length > 0 ? entry.itemRows : undefined,
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

      // Attach the PDF this bill was read from. The upload happened while the batch was
      // still being filled in, so the document has been sitting unlinked until now.
      if (billInput.uploadedDocumentId) {
        const { linkUploadedDocument } = await import('@/lib/uploaded-documents');
        await linkUploadedDocument(billInput.uploadedDocumentId, { billId: bill.id, userId: user.id });
      }

      notifiable.push({ id: bill.id, billNo: bill.billNo || '', totalPvc });
      createdBills.push(bill);
    }

    // Recalculate cumulative PVC for all bills in this contract
    // This ensures correct cumulative values even when bills are created in bulk
    await recalculateCumulativePvcForContract(contractId);

    // Deduct processing fee and create transaction records
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
        // The pre-check earlier is outside any transaction, so concurrent batches could
        // both pass it and drive the wallet negative. Checked again here, where it holds.
        if (totalProcessingFee > 0 && balanceBefore < totalProcessingFee) {
          throw new Error(`INSUFFICIENT_BALANCE: needs ${totalProcessingFee}, has ${balanceBefore}`);
        }
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

        // Per-bill records INSIDE the same transaction as the deduction. They used to
        // be written afterwards, one by one — a failure there tripped the outer catch,
        // which deletes the bills and releases the trial but has no way to give the
        // money back: the customer was down the whole batch fee with nothing delivered.
        // The first trialCount bills are the trial's — free, and marked 'trial' so the
        // watermark rule sees them.
        await tx.billTransaction.createMany({
          data: createdBills.map((bill, index) => {
            const isTrialBill = index < trialCount;
            return {
              billId: bill.id,
              userId: user.id,
              amount: isTrialBill ? 0 : (bill.processingFee || 0),
              originalAmount: bill.processingFee || 0,
              discount: isTrialBill ? (bill.processingFee || 0) : 0,
              discountType: isTrialBill ? 'trial' : null,
              status: 'paid',
              isFree: isTrialBill
            };
          })
        });

        return balanceAfter;
      });

      creditInfo = {
        cost: totalProcessingFee,
        remainingBalance
      };
    }
    } catch (batchError) {
      if (createdBills.length > 0) {
        await prisma.bill.deleteMany({
          where: { id: { in: createdBills.map((b) => b.id) } },
        }).catch((e) => console.error('Could not remove bills of failed batch:', e));
        await recalculateCumulativePvcForContract(contractId).catch(() => {});
      }
      await releaseTrialClaim();
      throw batchError;
    }

    // Tell the contractor about each bill, and the admin about the batch.
    //
    // A batch used to notify nobody at all, so ten bills made through Bulk New reached
    // the contractor only if somebody thought to send them by hand. One message per
    // bill, because each bill is a separate claim with its own report -- but only ONE
    // message to the admin, because ten identical admin notifications for one action is
    // noise, not information.
    //
    // All of it inside after(): a batch of ten would otherwise add ten outbound calls to
    // a response the user is already waiting on.
    if (createdBills.length > 0) {
      // Collected in the loop, where each bill's PVC total is actually in scope — the
      // created row itself does not carry the calculation.
      const notified = notifiable;
      const batchPvc = notified.reduce((sum, b) => sum + b.totalPvc, 0);
      after(async () => {
        for (const b of notified) {
          await notifyBillByWhatsApp({
            billId: b.id,
            billNo: b.billNo,
            contractorPhone: contract.contractorPhone,
            contractorName: contract.contractorName,
            reason: 'created',
            notifyAdmin: false,
          });
        }
        await notifyAdminOfBillBatch({
          count: notified.length,
          agreementNo: contract.agreementNo,
          contractorName: contract.contractorName,
          totalPvc: batchPvc,
          billNos: notified.map((b) => b.billNo).filter(Boolean) as string[],
        });
      });
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
