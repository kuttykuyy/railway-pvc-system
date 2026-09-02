import { logger } from '@/lib/logger';
/**
 * External API: Bill Creation
 * Allows external apps (like primerp.in) to create PVC bills
 * 
 * POST /api/external/bills - Create a new bill
 * GET /api/external/bills - List bills (with pagination)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateExternalApiKey } from '@/lib/external-api-auth';
import { getQuarterFromDate, calculateClassificationBasedPvcWithComponents } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { processPaymentForBill } from '@/lib/payment-validation';
import { getBillingSettings } from '@/lib/admin-settings';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { checkUserContractAccess } from '@/lib/permissions';
import { areFinalIndicesAvailableForBill } from '@/lib/index-status';
import { billRequiresExtension } from '@/lib/extension-compliance';
import { extractSteelTypesFromEntries } from '@/lib/steel-type-handler';
import { getExternalCorsHeaders } from '@/lib/external-cors';

export const dynamic = 'force-dynamic';

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: getExternalCorsHeaders(request) });
}

/**
 * GET /api/external/bills
 * List bills for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const auth = await validateExternalApiKey(request, 'bills:read');
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401, headers: getExternalCorsHeaders(request) }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;
    
    // Build query filters
    const where: Record<string, unknown> = {};
    
    if (contractId) {
      // Check contract access
      const access = await checkUserContractAccess(auth.userId!, contractId);
      if (!access?.canView) {
        return NextResponse.json(
          { success: false, error: 'Access denied to this contract' },
          { status: 403, headers: getExternalCorsHeaders(request) }
        );
      }
      where.contractId = contractId;
    } else {
      // Get all contracts user has access to
      const userContracts = await prisma.contract.findMany({
        where: { userId: auth.userId },
        select: { id: true }
      });
      where.contractId = { in: userContracts.map(c => c.id) };
    }
    
    // Get total count
    const total = await prisma.bill.count({ where });
    
    // Get bills
    const bills = await prisma.bill.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        contract: {
          select: {
            id: true,
            agreementNo: true,
            contractorName: true,
            workDescription: true
          }
        },
        pvcCalculation: {
          select: {
            labourPvc: true,
            cementPvc: true,
            steelPvc: true,
            fuelPowerPvc: true,
            totalPvc: true
          }
        }
      }
    });
    
    return NextResponse.json({
      success: true,
      data: bills,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }, { headers: getExternalCorsHeaders(request) });
    
  } catch (error) {
    console.error('[ExternalAPI] GET bills error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bills' },
      { status: 500, headers: getExternalCorsHeaders(request) }
    );
  }
}

/**
 * POST /api/external/bills
 * Create a new PVC bill
 * 
 * Required fields:
 * - contractId: string (ID of the contract)
 * - billNo: string (Bill number)
 * - grossBillAmount: number (Gross bill amount)
 * - billAmount: number (Net bill amount for PVC calculation)
 * - dateOfMeasurement: string (ISO date)
 * 
 * Optional fields:
 * - cementAmount: number (default: 0)
 * - steelTmtBarsAmount: number (default: 0)
 * - steelAngleChannelAmount: number (default: 0)
 * - steelPlatesAmount: number (default: 0)
 * - steelOtherSectionsAmount: number (default: 0)
 * - dateOfCompletion: string (ISO date)
 * - isFinalPvc: boolean (default: false)
 * - zone: string
 * - classificationEntries: array of classification entries
 */
export async function POST(request: NextRequest) {
  logger.log('\n\ud83d\ude80 [ExternalAPI] POST /api/external/bills - Request received');
  
  try {
    // ===== Step 1: Validate API Key =====
    const auth = await validateExternalApiKey(request, 'bills:create');
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401, headers: getExternalCorsHeaders(request) }
      );
    }
    
    logger.log(`\u2705 API key validated for user: ${auth.userEmail}`);
    
    // ===== Step 2: Parse Request Body =====
    const body = await request.json();
    const {
      contractId,
      billNo,
      grossBillAmount,
      billAmount,
      cementAmount = 0,
      steelTmtBarsAmount = 0,
      steelAngleChannelAmount = 0,
      steelPlatesAmount = 0,
      steelOtherSectionsAmount = 0,
      dateOfMeasurement,
      dateOfCompletion,
      isFinalPvc = false,
      zone,
      fuelPriceType = 'four_city_avg',
      classificationEntries = [],
    } = body;
    
    // ===== Step 3: Validate Required Fields =====
    if (!contractId || !billNo || grossBillAmount === undefined || 
        billAmount === undefined || !dateOfMeasurement) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields',
        required: ['contractId', 'billNo', 'grossBillAmount', 'billAmount', 'dateOfMeasurement']
      }, { status: 400, headers: getExternalCorsHeaders(request) });
    }
    
    // ===== Step 4: Check Contract Access =====
    const contractAccess = await checkUserContractAccess(auth.userId!, contractId);
    if (!contractAccess?.canCreateBills) {
      return NextResponse.json(
        { success: false, error: 'Access denied - Cannot create bills for this contract' },
        { status: 403, headers: getExternalCorsHeaders(request) }
      );
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
        currentCompletionDate: true,
        dateOfOpening: true,
        completionPeriodMonths: true,
        contractorName: true
      }
    });
    
    if (!contract) {
      return NextResponse.json(
        { success: false, error: 'Contract not found' },
        { status: 404, headers: getExternalCorsHeaders(request) }
      );
    }
    
    // ===== Step 5: Validate Measurement Date =====
    const measurementDate = new Date(dateOfMeasurement);
    if (isNaN(measurementDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid measurement date format. Use ISO format (YYYY-MM-DD)' },
        { status: 400, headers: getExternalCorsHeaders(request) }
      );
    }
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (measurementDate > today) {
      return NextResponse.json(
        { success: false, error: 'Measurement date cannot be in the future' },
        { status: 400, headers: getExternalCorsHeaders(request) }
      );
    }
    
    // The whole base MONTH is out of bounds, not just its first day. Comparing dates
    // against the 1st let a measurement on, say, the 15th of the base month through —
    // the web route rejects the entire month, and this one now matches it.
    const baseMonthDate = new Date(contract.baseMonth);
    if (measurementDate.getFullYear() < baseMonthDate.getFullYear()
        || (measurementDate.getFullYear() === baseMonthDate.getFullYear()
            && measurementDate.getMonth() <= baseMonthDate.getMonth())) {
      return NextResponse.json({
        success: false,
        error: `Measurement date must be in a month after the contract base month (${baseMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`
      }, { status: 400, headers: getExternalCorsHeaders(request) });
    }
    
    // A bill measured after the date the contract covers is work in a period the
    // contract does not yet run to. Under the GCC that period exists only once a time
    // extension is granted, and the extension decides how PVC applies to it (17B caps
    // the indices). The web and bulk routes stop such a bill until the extension is
    // recorded; this route created it anyway, applying the 17B cap only when an
    // extension already existed. Same gate, same answer, here too.
    const extensionGate = billRequiresExtension(contract, measurementDate);
    if (extensionGate.blocked) {
      return NextResponse.json({
        success: false,
        error: `This bill is measured after the contract's completion date `
          + `(${extensionGate.coveredUntil?.toLocaleDateString('en-IN')}). Record the time `
          + `extension for this contract first, then create the bill.`,
        code: 'EXTENSION_REQUIRED',
        coveredUntil: extensionGate.coveredUntil,
        addExtensionUrl: `/contracts/${contract.id}/extensions`,
      }, { status: 409, headers: getExternalCorsHeaders(request) });
    }

    // Check if final indices are available
    const indicesCheck = await areFinalIndicesAvailableForBill(measurementDate, contract.baseMonth);
    if (!indicesCheck.available) {
      return NextResponse.json({ 
        success: false,
        error: indicesCheck.message,
        missingMonths: indicesCheck.missingMonths
      }, { status: 400, headers: getExternalCorsHeaders(request) });
    }
    
    // ===== Step 6: Payment Validation (inline for external API) =====
    const billingSettings = await getBillingSettings();
    const billCost = billingSettings.billCost || 199;
    
    // Get user with account info
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { customerAccount: true }
    });
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404, headers: getExternalCorsHeaders(request) }
      );
    }
    
    // Check if user has free account
    let isFreeAccount = user.isFreeAccount || (user.customProcessingFee === 0) || user.role === 'superadmin' || user.role === 'railway_official';
    
    // Check balance for paid accounts
    if (!isFreeAccount) {
      const currentBalance = user.customerAccount?.creditBalance || 0;
      if (currentBalance < billCost) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient credits',
          reason: `Required: ₹${billCost}, Available: ₹${currentBalance}`,
          requiredPayment: billCost
        }, { status: 402, headers: getExternalCorsHeaders(request) });
      }
    }
    
    // ===== Step 7: Calculate Quarter =====
    let quarterDateForCalculation = measurementDate;
    if (contract.isExtended && 
        contract.extensionType === '17B' && 
        contract.originalCompletionDate && 
        measurementDate > contract.originalCompletionDate) {
      quarterDateForCalculation = contract.originalCompletionDate;
    }
    
    const quarter = getQuarterFromDate(quarterDateForCalculation, contract.baseMonth);
    logger.log(`\ud83d\udcca Calculated Quarter: ${quarter}`);
    
    // ===== Step 7b: Refuse a duplicate bill number =====
    // Without this the unique index threw P2002 out of the catch-all as a bare 500
    // with the raw error string — the caller had no way to know the number was taken.
    const duplicateBill = await prisma.bill.findFirst({
      where: { contractId, billNo: { equals: String(billNo), mode: 'insensitive' } },
      select: { id: true, billNo: true },
    });
    if (duplicateBill) {
      return NextResponse.json({
        success: false,
        error: `Bill number ${duplicateBill.billNo} already exists for this contract`,
        existingBillId: duplicateBill.id,
      }, { status: 409, headers: getExternalCorsHeaders(request) });
    }

    // ===== Step 8: Generate PVC Number =====
    // Max existing sequence + 1, exactly as the web route. count+1 duplicated an
    // existing pvcNumber the moment any earlier bill had been deleted.
    const contractBillNumbers = await prisma.bill.findMany({
      where: { contractId },
      select: { pvcNumber: true },
    });
    let maxSequence = 0;
    for (const b of contractBillNumbers) {
      if (b.pvcNumber) {
        const seq = parseInt(b.pvcNumber.split('/').pop() || '', 10);
        if (!isNaN(seq) && seq > maxSequence) maxSequence = seq;
      }
    }
    const sequenceNumber = String(maxSequence + 1).padStart(3, '0');
    const autoPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;

    // ===== Step 9: Extract Steel Types =====
    const extractedSteelTypes = await extractSteelTypesFromEntries(classificationEntries);

    // ===== Step 10: Assemble the bill (created atomically with its calculation below).
    // It used to be created HERE, before the index lookups and the PVC calculation —
    // a failure in either left an orphan bill with no calculation and no charge, the
    // exact partial state the web route's transaction exists to prevent. =====
    const billData = {
        contractId,
        billNo,
        grossBillAmount: parseFloat(String(grossBillAmount)),
        billAmount: parseFloat(String(billAmount)),
        cementAmount: parseFloat(String(cementAmount)) || 0,
        steelTmtBarsAmount: parseFloat(String(steelTmtBarsAmount)) || 0,
        steelAngleChannelAmount: parseFloat(String(steelAngleChannelAmount)) || 0,
        steelPlatesAmount: parseFloat(String(steelPlatesAmount)) || 0,
        steelOtherSectionsAmount: parseFloat(String(steelOtherSectionsAmount)) || 0,
        steelTypes: extractedSteelTypes,
        dateOfMeasurement: measurementDate,
        dateOfCompletion: dateOfCompletion ? new Date(dateOfCompletion) : null,
        quarter,
        pvcNumber: autoPvcNumber,
        isFinalPvc,
        zone: zone || null,
        fuelPriceType: fuelPriceType || 'four_city_avg',
        isChargeable: !isFreeAccount,
        processingFee: isFreeAccount ? 0 : billCost,
        subClassifications: []
    };

    // ===== Step 11: Calculate PVC using the same approach as main API =====
    // Use zone-based steel city prices instead of default Chennai rates
    const steelIndexNames = getSteelIndexNamesForZone(zone);
    const fuelIndexName = getFuelIndexNameForBill(zone, fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    
    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, 'auto');
    
    // Get weighted components from classification entries or use defaults
    const { calculateWeightedComponents } = await import('@/lib/pvc-calculations');
    
    const hasDedicatedCement = cementAmount && parseFloat(String(cementAmount)) > 0;
    const hasDedicatedSteel = 
      (steelTmtBarsAmount && parseFloat(String(steelTmtBarsAmount)) > 0) ||
      (steelAngleChannelAmount && parseFloat(String(steelAngleChannelAmount)) > 0) ||
      (steelPlatesAmount && parseFloat(String(steelPlatesAmount)) > 0) ||
      (steelOtherSectionsAmount && parseFloat(String(steelOtherSectionsAmount)) > 0);

    const weightedComponents = await calculateWeightedComponents(classificationEntries, {
      hasDedicatedSteel,
      hasDedicatedCement
    });
    
    // Calculate PVC
    const pvcResult = calculateClassificationBasedPvcWithComponents(
      parseFloat(String(billAmount)),
      quarterlyAverages,
      {
        fixed: weightedComponents.fixed,
        labour: weightedComponents.labour,
        steel: weightedComponents.steel,
        cement: weightedComponents.cement,
        plantMachinery: weightedComponents.plantMachinery,
        fuel: weightedComponents.fuel,
        otherMaterials: weightedComponents.otherMaterials,
        explosives: weightedComponents.explosives,
        steelTypes: extractedSteelTypes
      }
    );
    
    // Get previous PVC total for this contract
    const previousPvcResult = await prisma.pvcCalculation.findFirst({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      select: { cumulativePvc: true }
    });
    const previousPvcTotal = previousPvcResult?.cumulativePvc || 0;
    
    // ===== Step 12: Create the bill and its calculation together =====
    const { bill, pvcCalculation } = await prisma.$transaction(async (tx) => {
      const createdBill = await tx.bill.create({ data: billData as any });
      const createdCalc = await tx.pvcCalculation.create({
        data: {
          contractId,
          billId: createdBill.id,
          labourPvc: pvcResult.labourPvc || 0,
          plantMachineryPvc: pvcResult.plantMachineryPvc || 0,
          fuelPowerPvc: pvcResult.fuelPowerPvc || 0,
          otherMaterialsPvc: pvcResult.otherMaterialsPvc || 0,
          cementPvc: pvcResult.cementPvc || 0,
          steelPvc: pvcResult.steelPvc || 0,
          explosivesPvc: pvcResult.explosivesPvc || 0,
          totalPvc: pvcResult.totalPvc || 0,
          previousPvcTotal,
          cumulativePvc: previousPvcTotal + (pvcResult.totalPvc || 0)
        }
      });
      return { bill: createdBill, pvcCalculation: createdCalc };
    }, { maxWait: 10_000, timeout: 20_000 });

    logger.log(`✅ Bill created: ${bill.id}`);

    // ===== Step 13: Process Payment =====
    const paymentResult = await processPaymentForBill(
      auth.userId!,
      bill.id,
      isFreeAccount ? 'free_account' : 'credit_balance',
      undefined,
      undefined,
      isFreeAccount ? 0 : billCost,
      pvcResult.totalPvc || 0,
      contract.agreementNo  // pass agreementNo so trial claims are recorded
    );
    
    if (!paymentResult.success) {
      console.error('\\u274c Failed to process payment:', paymentResult.message);
      // Same rule as the web route: a bill that could not be charged is not kept.
      // Logging-and-continuing left an unpaid bill with no transaction row, which the
      // watermark checks read as fully paid.
      await prisma.bill.delete({ where: { id: bill.id } }).catch((err) =>
        console.error('Could not remove unpaid bill:', err));
      return NextResponse.json(
        { success: false, error: 'Payment could not be completed', reason: paymentResult.message },
        { status: 402 },
      );
    } else {
      logger.log('\\u2705 Payment processed successfully');
    }

    // A back-dated bill changes every later bill's cumulative PVC; the web route
    // repairs the chain after create and this one never did, so cumulatives went
    // non-monotonic the first time an API caller sent bills out of date order.
    const { recalculateCumulativePvcForContract } = await import('@/lib/recalculateCumulativePvc');
    await recalculateCumulativePvcForContract(contractId).catch((e) =>
      console.error('Could not recalculate cumulative PVC:', e));

    // ===== Step 14: Return Success Response =====
    return NextResponse.json({
      success: true,
      message: 'Bill created successfully',
      data: {
        id: bill.id,
        billNo: bill.billNo,
        pvcNumber: bill.pvcNumber,
        grossBillAmount: bill.grossBillAmount,
        billAmount: bill.billAmount,
        quarter: bill.quarter,
        dateOfMeasurement: bill.dateOfMeasurement,
        pvcCalculation: {
          labourPvc: pvcCalculation.labourPvc,
          cementPvc: pvcCalculation.cementPvc,
          steelPvc: pvcCalculation.steelPvc,
          fuelPowerPvc: pvcCalculation.fuelPowerPvc,
          totalPvc: pvcCalculation.totalPvc
        },
        contract: {
          id: contract.id,
          agreementNo: contract.agreementNo,
          contractorName: contract.contractorName
        },
        links: {
          view: `https://irpvc.in/bills/${bill.id}`,
          pdf: `https://irpvc.in/api/bills/${bill.id}/pdf-report`
        }
      }
    }, { status: 201, headers: getExternalCorsHeaders(request) });
    
  } catch (error) {
    console.error('[ExternalAPI] POST bills error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create bill', details: String(error) },
      { status: 500, headers: getExternalCorsHeaders(request) }
    );
  }
}

