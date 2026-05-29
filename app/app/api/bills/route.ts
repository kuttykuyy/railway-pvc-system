
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc, calculateWeightedComponents } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { validateApiAccess, validateBillProcessing } from '@/lib/payment-validation';
import { calculateExtensionCompliantPvc } from '@/lib/extension-compliance';
import { getBillingSettings } from '@/lib/admin-settings';
import { getUserAccessibleBills, checkUserContractAccess } from '@/lib/permissions';
import { validateMeasurementDateAgainstProvisionalIndices } from '@/lib/provisional-validation';
import { handleApiError } from '@/lib/error-handler';
import { isBillUsingProvisionalIndices, areFinalIndicesAvailableForBill } from '@/lib/index-status';
import { withTimeout, TIMEOUT_DEFAULTS } from '@/lib/api-timeout';
import { getPaginationParams, createPaginatedResponse } from '@/lib/api-helpers';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { extractSteelTypesFromEntries } from '@/lib/steel-type-handler';
import { sendBillPDFNotification, isMyDreamsWhatsAppConfigured, validatePhoneNumber, getAdminWhatsAppNumber, sendBillPDFWithTemplate } from '@/lib/whatsapp-mydreams';
import { notifyNewBillCreated } from '@/lib/slack-webhook';
import jwt from 'jsonwebtoken';

export const dynamic = "force-dynamic";
export const revalidate = 0; // Disable all caching

// GET /api/bills - Get all bills with pagination
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = getIdentifier(request);
    const rateLimit = rateLimiter.check(identifier, RATE_LIMITS.API.limit, RATE_LIMITS.API.windowMs);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
          }
        }
      );
    }

    // Execute with timeout protection
    return await withTimeout(
      (async () => {
        // Validate API access
        const { authorized, user, message: authMessage } = await validateApiAccess(request);
        
        if (!authorized) {
          return NextResponse.json(
            { error: authMessage || 'Unauthorized' },
            { status: 401 }
          );
        }

        const { searchParams } = new URL(request.url);
        const contractId = searchParams.get('contractId');
        
        // Get pagination parameters
        const { page, limit, skip } = getPaginationParams(request);
        
        // Get accessible bill IDs based on permissions
        let accessibleBillIds = await getUserAccessibleBills(user.id);
        
        // If contractId is specified, filter by contract and check contract access
        if (contractId) {
          const contractAccess = await checkUserContractAccess(user.id, contractId);
          if (!contractAccess?.canView) {
            return NextResponse.json({ error: 'Access denied to this contract' }, { status: 403 });
          }
          
          // Get bills only from this contract that user has access to
          const contractBills = await prisma.bill.findMany({
            where: { 
              contractId: contractId,
              id: { in: accessibleBillIds }
            },
            select: { id: true }
          });
          
          accessibleBillIds = contractBills.map(b => b.id);
        }
        
        if (accessibleBillIds.length === 0) {
          return NextResponse.json(
            createPaginatedResponse([], 0, page, limit)
          );
        }
        
        // Get total count for pagination
        const total = await prisma.bill.count({
          where: {
            id: { in: accessibleBillIds }
          }
        });
        
        // Get paginated bills
        const bills = await prisma.bill.findMany({
          where: {
            id: { in: accessibleBillIds }
          },
          orderBy: { dateOfMeasurement: 'desc' },
          skip,
          take: limit,
          include: {
            contract: {
              select: {
                id: true,
                agreementNo: true,
                contractorName: true,
                workDescription: true,
                isExtended: true,
                extensionType: true,
                coveringLetterDesignation: true,
                loaDate: true,
                baseMonth: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            },
            workClassification: true,
            classificationEntries: {
              include: {
                classification: true,
                subClassification: true
              }
            },
            pvcCalculation: true,
            billTransaction: true
          }
        });
        
        // Add provisional/final status to each bill
        const billsWithStatus = await Promise.all(
          bills.map(async (bill) => {
            const indicesStatus = await isBillUsingProvisionalIndices(
              bill.quarter,
              bill.contract.baseMonth
            );
            
            return {
              ...bill,
              indicesStatus: {
                isProvisional: indicesStatus.isProvisional,
                provisionalCount: indicesStatus.provisionalCount,
                totalCount: indicesStatus.totalCount
              }
            };
          })
        );
        
        // Create paginated response
        const response = createPaginatedResponse(billsWithStatus, total, page, limit);
        
        return NextResponse.json(response, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          }
        });
      })(),
      TIMEOUT_DEFAULTS.STANDARD,
      'get-bills'
    );
  } catch (error) {
    console.error('Error fetching bills:', error);
    const { message, code, statusCode } = handleApiError(error);
    return NextResponse.json(
      { error: message, code },
      { status: statusCode }
    );
  }
}

// POST /api/bills - Create new bill with PVC calculation (free processing)

// ============================================================================
// POST /api/bills - Create new bill with PVC calculation
// ============================================================================
// REWRITTEN FOR CLEAN STEEL TYPE HANDLING
// ============================================================================
export async function POST(request: NextRequest) {
  console.log('\n🚀 ===== NEW BILL API: POST REQUEST STARTED =====\n');
  
  try {
    // ===== STEP 1: Authentication & Authorization =====
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }
    
    // ===== STEP 2: Payment Validation =====
    const paymentValidation = await validateBillProcessing(request);
    if (!paymentValidation.canProcess) {
      return NextResponse.json({
        error: 'Payment required',
        reason: paymentValidation.reason,
        requiredPayment: paymentValidation.requiredPayment,
        isFree: paymentValidation.isFree || false
      }, { status: 402 });
    }
    
    // ===== STEP 3: Parse and Validate Request Body =====
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
      calculationMethod = 'auto',
      workClassification,
      zone,
      fuelPriceType = 'four_city_avg',
      isFinalPvc = false,
      nonScheduleItems = [],
      classificationEntries = [],
    } = body;
    
    // Validate required fields
    if (!contractId || !billNo || !grossBillAmount || !billAmount || !dateOfMeasurement) {
      return NextResponse.json({ error: 'Missing required fields: contractId, billNo, grossBillAmount, billAmount, dateOfMeasurement' }, { status: 400 });
    }

    // ===== STEP 3B: Check for Recent PVC Check Credit =====
    // If user did a PVC check for the same contract/date within last 30 minutes, apply ₹500 credit
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentPvcCheck = await prisma.pvcCheck.findFirst({
      where: {
        userId: user.id,
        contractId,
        dateOfMeasurement: new Date(dateOfMeasurement),
        createdAt: { gte: thirtyMinutesAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    let pvcCheckCredit = 0;
    if (recentPvcCheck && !recentPvcCheck.isFree) {
      pvcCheckCredit = recentPvcCheck.amount; // Typically ₹500
      console.log(`✅ Found recent PVC check (${recentPvcCheck.id}): Applying ₹${pvcCheckCredit} credit toward bill processing`);
    }
    
    // ===== STEP 4: Check Contract Access =====
    const contractAccess = await checkUserContractAccess(user.id, contractId);
    if (!contractAccess?.canCreateBills) {
      return NextResponse.json({ error: 'Access denied - You do not have permission to create bills for this contract' }, { status: 403 });
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
        contractorName: true,
        contractorPhone: true
      }
    });
    
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    
    // ===== STEP 5: Validate Measurement Date =====
    const measurementDate = new Date(dateOfMeasurement);
    if (isNaN(measurementDate.getTime())) {
      return NextResponse.json({ error: 'Invalid measurement date format' }, { status: 400 });
    }
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (measurementDate > today) {
      return NextResponse.json({ error: 'Measurement date cannot be in the future' }, { status: 400 });
    }
    
    if (measurementDate <= contract.baseMonth) {
      return NextResponse.json({ 
        error: `Measurement date must be after contract base month (${contract.baseMonth.toDateString()})`
      }, { status: 400 });
    }
    
    // Check if final price indices are available for ALL months needed in the calculation
    // PVC calculation uses a three-month average, so we need to check the entire quarter
    const indicesCheck = await areFinalIndicesAvailableForBill(measurementDate, contract.baseMonth);
    if (!indicesCheck.available) {
      return NextResponse.json({ 
        error: indicesCheck.message,
        details: indicesCheck.isProvisional 
          ? 'Some indices are provisional. Enable "Allow Provisional Indices" in Admin Settings to create bills with provisional indices.'
          : 'Please ensure all required indices are entered for the calculation period.',
        missingMonths: indicesCheck.missingMonths
      }, { status: 400 });
    }
    
    // Validate against provisional indices
    const provisionalValidation = await validateMeasurementDateAgainstProvisionalIndices(
      measurementDate,
      contract.baseMonth
    );
    if (!provisionalValidation.isValid) {
      return NextResponse.json({
        error: provisionalValidation.error || 'Provisional indices validation failed',
        details: provisionalValidation.details,
        provisional: true
      }, { status: 422 });
    }
    
    // ===== STEP 6: Calculate Quarter =====
    let quarterDateForCalculation = measurementDate;
    
    // For 17B extensions, use original completion date for quarter determination
    if (contract.isExtended && 
        contract.extensionType === '17B' && 
        contract.originalCompletionDate && 
        measurementDate > contract.originalCompletionDate) {
      quarterDateForCalculation = contract.originalCompletionDate;
      console.log(`✅ 17B Extension: Using original completion date (${quarterDateForCalculation.toDateString()}) for quarter calculation`);
    }
    
    const quarter = getQuarterFromDate(quarterDateForCalculation, contract.baseMonth);
    console.log(`📊 Calculated Quarter: ${quarter}`);
    
    // ===== STEP 7: Generate PVC Number =====
    const billCountForContract = await prisma.bill.count({ where: { contractId } });
    const sequenceNumber = String(billCountForContract + 1).padStart(3, '0');
    const autoPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;
    
    // ===== STEP 8: CRITICAL - Extract Steel Types from Classification Entries =====
    console.log('\n🔍 ===== EXTRACTING STEEL TYPES =====');
    const extractedSteelTypes = await extractSteelTypesFromEntries(classificationEntries);
    console.log(`✅ Steel types to be stored in bill: [${extractedSteelTypes.join(', ') || 'None'}]`);
    console.log('🔍 ===== STEEL TYPES EXTRACTED =====\n');
    
    // ===== STEP 9: Create Bill Record with Steel Types =====
    const billingSettings = await getBillingSettings();
    const billCost = billingSettings.billCost || 10; // Default matches BILL_PROCESSING_COST in admin settings
    
    const bill = await prisma.bill.create({
      data: {
        contractId,
        billNo,
        grossBillAmount: parseFloat(grossBillAmount),
        billAmount: parseFloat(billAmount),
        cementAmount: parseFloat(cementAmount) || 0,
        steelTmtBarsAmount: parseFloat(steelTmtBarsAmount) || 0,
        steelAngleChannelAmount: parseFloat(steelAngleChannelAmount) || 0,
        steelPlatesAmount: parseFloat(steelPlatesAmount) || 0,
        steelOtherSectionsAmount: parseFloat(steelOtherSectionsAmount) || 0,
        steelTypes: extractedSteelTypes, // CRITICAL: Store extracted steel types
        dateOfMeasurement: measurementDate,
        quarter,
        zone: zone || null,
        fuelPriceType: fuelPriceType || 'four_city_avg',
        pvcNumber: autoPvcNumber,
        isFinalPvc: isFinalPvc || false,
        dateOfCompletion: dateOfCompletion ? new Date(dateOfCompletion) : null,
        nonScheduleItems: nonScheduleItems || [],
        isChargeable: !paymentValidation.isFree,
        processingFee: paymentValidation.isFree ? 0 : billCost,
        subClassifications: []
      }
    });
    
    console.log(`✅ Bill created with ID: ${bill.id}`);
    console.log(`   Steel types stored: [${(bill.steelTypes as string[])?.join(', ') || 'None'}]`);
    
    // ===== STEP 10: Get Quarterly Averages (Needed for Entry PVC Calculations) =====
    // Use zone-based steel city prices instead of default Chennai rates
    const steelIndexNames = getSteelIndexNamesForZone(zone);
    const fuelIndexName = getFuelIndexNameForBill(zone, fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    console.log(`📊 Using steel indices for zone "${zone}" (city: ${getSteelCityForZone(zone)}):`, steelIndexNames);
    console.log(`⛽ Using fuel index: ${fuelIndexName} (fuelPriceType: ${fuelPriceType})`);
    
    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, calculationMethod);
    
    // ===== STEP 11: Create Classification Entries with PVC Calculations =====
    let totalClassificationPvc = 0;
    let totalClassificationLabour = 0;
    let totalClassificationPlant = 0;
    let totalClassificationFuel = 0;
    let totalClassificationMaterials = 0;
    let totalClassificationCement = 0;
    let totalClassificationSteel = 0;
    let totalClassificationExplosives = 0;
    
    if (classificationEntries && classificationEntries.length > 0) {
      console.log(`\n📋 Creating ${classificationEntries.length} classification entries with per-entry PVC calculations...`);
      
      const { calculateClassificationEntryPvc } = await import('@/lib/pvc-calculations');
      
      for (const entry of classificationEntries) {
        const hasValidAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined;
        
        if (hasValidAmount && (entry.subClassificationId || entry.classificationId)) {
          // Check if this classification has steel components
          let hasSteelComponent = false;
          if (entry.subClassificationId) {
            const subClass = await prisma.subClassification.findUnique({
              where: { id: entry.subClassificationId },
              select: { steel: true }
            });
            hasSteelComponent = (subClass?.steel ?? 0) > 0;
          } else if (entry.classificationId) {
            const classification = await prisma.classification.findUnique({
              where: { id: entry.classificationId },
              select: { steel: true }
            });
            hasSteelComponent = (classification?.steel ?? 0) > 0;
          }
          
          // Use entry's steel types if specified, otherwise use bill-level steel types if entry has steel
          const entrySteelTypes = entry.steelTypes && entry.steelTypes.length > 0 
            ? entry.steelTypes 
            : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);
          
          // Calculate PVC for this specific entry
          const entryPvc = await calculateClassificationEntryPvc(
            {
              subClassificationId: entry.subClassificationId,
              classificationId: entry.classificationId,
              amount: parseFloat(entry.amount),
              steelTypes: entrySteelTypes
            },
            quarterlyAverages
          );
          
          // Create entry with PVC breakdown
          await prisma.billClassificationEntry.create({
            data: {
              billId: bill.id,
              subClassificationId: entry.subClassificationId || null,
              classificationId: entry.classificationId || null,
              amount: parseFloat(entry.amount),
              description: entry.description || null,
              steelTypes: entrySteelTypes,
              scheduleItem: entry.scheduleItem || null,
              itemNumber: entry.itemNumber || null,
              quantity: entry.quantity ? parseFloat(entry.quantity) : null,
              agreementRate: entry.agreementRate ? parseFloat(entry.agreementRate) : null,
              itemRows: entry.itemRows ? JSON.parse(JSON.stringify(entry.itemRows)) : null,
              labourPvc: entryPvc.labourPvc,
              plantMachineryPvc: entryPvc.plantMachineryPvc,
              fuelPowerPvc: entryPvc.fuelPowerPvc,
              otherMaterialsPvc: entryPvc.otherMaterialsPvc,
              cementPvc: entryPvc.cementPvc,
              steelPvc: entryPvc.steelPvc,
              explosivesPvc: entryPvc.explosivesPvc,
              totalPvc: entryPvc.totalPvc
            }
          });
          
          if (hasSteelComponent && entrySteelTypes.length > 0) {
            console.log(`   ✅ Entry with steel PVC: ₹${entryPvc.steelPvc.toFixed(2)} → Steel types: [${entrySteelTypes.join(', ')}]`);
          }
          
          // Accumulate totals
          totalClassificationLabour += entryPvc.labourPvc;
          totalClassificationPlant += entryPvc.plantMachineryPvc;
          totalClassificationFuel += entryPvc.fuelPowerPvc;
          totalClassificationMaterials += entryPvc.otherMaterialsPvc;
          totalClassificationCement += entryPvc.cementPvc;
          totalClassificationSteel += entryPvc.steelPvc;
          totalClassificationExplosives += entryPvc.explosivesPvc;
          totalClassificationPvc += entryPvc.totalPvc;
          
          console.log(`   ✅ Entry created with PVC: ₹${entryPvc.totalPvc.toFixed(2)}`);
        }
      }
      
      console.log(`\n📊 Total Classification PVC: ₹${totalClassificationPvc.toFixed(2)}`);
    }
    
    // ===== STEP 12: Use Per-Entry PVC Calculations (Already Computed) =====
    console.log('\n💰 ===== USING PER-ENTRY PVC CALCULATIONS =====');
    console.log(`   Contract Extension: ${contract.isExtended ? contract.extensionType : 'None'}`);
    console.log(`   Total Classification Labour PVC: ₹${totalClassificationLabour.toFixed(2)}`);
    console.log(`   Total Classification Steel PVC: ₹${totalClassificationSteel.toFixed(2)}`);
    console.log(`   Total Classification PVC: ₹${totalClassificationPvc.toFixed(2)}`);
    
    // Use the per-entry totals as the extension compliant result
    const extensionCompliantResult = {
      labourPvc: totalClassificationLabour,
      plantMachineryPvc: totalClassificationPlant,
      fuelPowerPvc: totalClassificationFuel,
      otherMaterialsPvc: totalClassificationMaterials,
      cementPvc: totalClassificationCement,
      steelPvc: totalClassificationSteel,
      explosivesPvc: totalClassificationExplosives,
      totalPvc: totalClassificationPvc,
      extensionDetails: {
        isInExtensionPeriod: false,
        extensionType: contract.isExtended ? contract.extensionType : null,
        pvcRestrictionDate: null
      },
      appliedRestrictions: {
        isRestricted: false,
        originalPvcAmount: totalClassificationPvc,
        restrictedPvcAmount: totalClassificationPvc,
        savingsAmount: 0
      }
    };
    
    console.log('💰 ===== PER-ENTRY PVC CALCULATIONS COMPLETE =====\n');
    
    // ===== STEP 14: Calculate Dedicated Cement and Steel PVC =====
    const dedicatedCementPvc = calculateDedicatedCementPvc(parseFloat(cementAmount) || 0, quarterlyAverages);
    
    const dedicatedSteelTmtBarsPvc = calculateDedicatedSteelPvc(parseFloat(steelTmtBarsAmount) || 0, quarterlyAverages, 'Steel TMT Bars');
    const dedicatedSteelAngleChannelPvc = calculateDedicatedSteelPvc(parseFloat(steelAngleChannelAmount) || 0, quarterlyAverages, 'Steel Angle/Channel');
    const dedicatedSteelPlatesPvc = calculateDedicatedSteelPvc(parseFloat(steelPlatesAmount) || 0, quarterlyAverages, 'Steel Plates');
    const dedicatedSteelOtherSectionsPvc = calculateDedicatedSteelPvc(parseFloat(steelOtherSectionsAmount) || 0, quarterlyAverages, 'Steel Other Sections');
    const totalDedicatedSteelPvc = dedicatedSteelTmtBarsPvc + dedicatedSteelAngleChannelPvc + dedicatedSteelPlatesPvc + dedicatedSteelOtherSectionsPvc;
    
    // ===== STEP 15: Calculate Total PVC (with dedicated components if provided) =====
    // CRITICAL FIX: Sum BOTH classification-based AND dedicated components
    // Previous logic was "either/or" which caused underreported totals
    const finalCementPvc = extensionCompliantResult.cementPvc + dedicatedCementPvc;
    const finalSteelPvc = extensionCompliantResult.steelPvc + totalDedicatedSteelPvc;
    
    const totalPvc = 
      extensionCompliantResult.labourPvc +
      extensionCompliantResult.plantMachineryPvc +
      extensionCompliantResult.fuelPowerPvc +
      extensionCompliantResult.otherMaterialsPvc +
      extensionCompliantResult.explosivesPvc +
      finalCementPvc +
      finalSteelPvc;
    
    console.log('\n📊 ===== FINAL PVC BREAKDOWN =====');
    console.log(`   Labour: ₹${extensionCompliantResult.labourPvc.toFixed(2)}`);
    console.log(`   Cement: ₹${finalCementPvc.toFixed(2)} (classification: ₹${extensionCompliantResult.cementPvc.toFixed(2)} + dedicated: ₹${dedicatedCementPvc.toFixed(2)})`);
    console.log(`   Steel: ₹${finalSteelPvc.toFixed(2)} (classification: ₹${extensionCompliantResult.steelPvc.toFixed(2)} + dedicated: ₹${totalDedicatedSteelPvc.toFixed(2)})`);
    console.log(`   TOTAL PVC: ₹${totalPvc.toFixed(2)}`);
    console.log('📊 ===== PVC BREAKDOWN COMPLETE =====\n');
    
    // ===== STEP 16: Calculate Cumulative PVC =====
    const previousPvcCalculations = await prisma.pvcCalculation.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' }
    });
    const previousPvcTotal = previousPvcCalculations.length > 0 ? previousPvcCalculations[0].cumulativePvc : 0;
    
    // ===== STEP 17: Create PVC Calculation Record =====
    await prisma.pvcCalculation.create({
      data: {
        contractId,
        billId: bill.id,
        labourPvc: extensionCompliantResult.labourPvc,
        plantMachineryPvc: extensionCompliantResult.plantMachineryPvc,
        fuelPowerPvc: extensionCompliantResult.fuelPowerPvc,
        otherMaterialsPvc: extensionCompliantResult.otherMaterialsPvc,
        cementPvc: extensionCompliantResult.cementPvc,
        explosivesPvc: extensionCompliantResult.explosivesPvc,
        steelPvc: extensionCompliantResult.steelPvc,
        dedicatedCementPvc,
        dedicatedSteelTmtBarsPvc,
        dedicatedSteelAngleChannelPvc,
        dedicatedSteelPlatesPvc,
        dedicatedSteelOtherSectionsPvc,
        dedicatedSteelPvc: totalDedicatedSteelPvc,
        totalPvc,
        previousPvcTotal,
        cumulativePvc: previousPvcTotal + totalPvc,
        isExtensionPeriod: extensionCompliantResult.extensionDetails.isInExtensionPeriod,
        extensionType: extensionCompliantResult.extensionDetails.extensionType,
        isIndexCapped: extensionCompliantResult.appliedRestrictions.isRestricted,
        indexCapDate: extensionCompliantResult.extensionDetails.pvcRestrictionDate,
        pvcRestrictionReason: extensionCompliantResult.appliedRestrictions.isRestricted 
          ? `GCC ${extensionCompliantResult.extensionDetails.extensionType} Extension - PVC restriction applied`
          : null,
        originalPvcAmount: extensionCompliantResult.appliedRestrictions.originalPvcAmount,
        restrictedPvcAmount: extensionCompliantResult.appliedRestrictions.restrictedPvcAmount,
        pvcSavingsDueToRestriction: extensionCompliantResult.appliedRestrictions.savingsAmount || 0
      }
    });
    
    // ===== STEP 18: Create Bill Transaction =====
    console.log('\n💳 ===== CREATING BILL TRANSACTION =====');
    const { processPaymentForBill } = await import('@/lib/payment-validation');
    
    // Apply PVC check credit to bill processing fee
    const billProcessingFee = paymentValidation.requiredPayment || 0;
    const finalBillAmount = Math.max(0, billProcessingFee - pvcCheckCredit);
    
    if (pvcCheckCredit > 0) {
      console.log(`💳 PVC Check Credit Applied: ₹${billProcessingFee} - ₹${pvcCheckCredit} = ₹${finalBillAmount}`);
    }
    
    const paymentResult = await processPaymentForBill(
      user.id,
      bill.id,
      paymentValidation.isFree ? 'free_account' : 'credit_balance',
      undefined, // No payment reference for automatic processing
      undefined, // No Razorpay data
      finalBillAmount,
      totalPvc
    );
    
    if (!paymentResult.success) {
      console.error('❌ Failed to create bill transaction:', paymentResult.message);
      // Still return the bill even if transaction fails
    } else {
      console.log('✅ Bill transaction created successfully');
    }
    console.log('💳 ===== BILL TRANSACTION COMPLETE =====\n');
    
    // ===== STEP 19: Return Created Bill =====
    const createdBill = await prisma.bill.findUnique({
      where: { id: bill.id },
      include: {
        contract: true,
        workClassification: true,
        pvcCalculation: true,
        billTransaction: true, // Include transaction in response
        classificationEntries: {
          include: {
            subClassification: true,
            classification: true
          }
        }
      }
    });
    
    console.log(`\n✅ ===== BILL CREATED SUCCESSFULLY =====`);
    console.log(`   Bill ID: ${bill.id}`);
    console.log(`   Bill No: ${bill.billNo}`);
    console.log(`   Steel Types Stored: [${(bill.steelTypes as string[])?.join(', ') || 'None'}]`);
    console.log(`   Total PVC: ₹${totalPvc.toFixed(2)}`);
    console.log(`   Transaction Status: ${paymentResult.success ? 'Processed' : 'Failed'}`);
    console.log(`✅ ===== NEW BILL API: REQUEST COMPLETE =====\n`);
    
    // Send WhatsApp notification with PDF if configured and contractor has phone number
    const isWhatsAppConfigured = await isMyDreamsWhatsAppConfigured();
    const contractorPhone = contract.contractorPhone;
    
    if (isWhatsAppConfigured && contractorPhone && validatePhoneNumber(contractorPhone) && createdBill) {
      try {
        console.log(`📱 Sending WhatsApp notification with PDF to contractor: ${contractorPhone}`);
        
        // Generate JWT token for public PDF access (valid for 24 hours)
        const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret-key';
        const pdfToken = jwt.sign(
          { billId: createdBill.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        // Generate public PDF URL via proxy endpoint (ensures proper PDF content-type headers)
        const encodedToken = encodeURIComponent(pdfToken);
        const pdfUrl = `${process.env.NEXTAUTH_URL}/api/public/bill-pdf?billId=${createdBill.id}&token=${encodedToken}`;
        const pdfFileName = `PVC_Report_${createdBill.billNo?.replace(/\//g, '_')}.pdf`;
        const customerName = contract.contractorName || 'Customer';
        
        // Send WhatsApp message with PDF attachment
        const result = await sendBillPDFNotification(
          contractorPhone,
          createdBill.billNo,
          pdfUrl,
          customerName,
          pdfFileName
        );
        
        if (result.success) {
          console.log(`✅ WhatsApp notification with PDF sent successfully. Message ID: ${result.messageId}`);
        } else {
          console.error(`⚠️ Failed to send WhatsApp notification: ${result.error}`);
        }
      } catch (whatsappError) {
        console.error('⚠️ Error sending WhatsApp notification:', whatsappError);
        // Don't fail the bill creation if WhatsApp fails
      }
    } else if (isWhatsAppConfigured && !contractorPhone) {
      console.log('ℹ️ WhatsApp is configured but contractor phone number is missing');
    } else if (isWhatsAppConfigured && contractorPhone && !validatePhoneNumber(contractorPhone)) {
      console.log(`⚠️ WhatsApp is configured but contractor phone number is invalid: ${contractorPhone}`);
    }
    
    // Send WhatsApp notification to admin about new bill creation
    if (isWhatsAppConfigured && createdBill) {
      try {
        const adminWhatsAppNumber = await getAdminWhatsAppNumber();
        if (adminWhatsAppNumber) {
          console.log(`📱 Sending bill creation notification to admin: ${adminWhatsAppNumber}`);
          
          // Send to admin with full bill details (function handles PDF generation and formatting)
          const result = await sendBillPDFWithTemplate(
            createdBill.id, // Bill ID
            adminWhatsAppNumber, // Send to admin
            contract.contractorName || 'Unknown Contractor' // Contractor name for context
          );
          
          if (result.success) {
            console.log(`✅ Admin notification sent successfully. Message ID: ${result.messageId}`);
            console.log(`   Bill: ${createdBill.billNo}`);
            console.log(`   Contractor: ${contract.contractorName}`);
          } else {
            console.error(`⚠️ Failed to send admin notification: ${result.error}`);
          }
        } else {
          console.log('ℹ️ Admin WhatsApp number not configured, skipping admin notification');
        }
      } catch (adminWhatsappError) {
        console.error('⚠️ Error sending admin WhatsApp notification:', adminWhatsappError);
        // Don't fail the bill creation if admin WhatsApp fails
      }
    }
    
    // Send Slack notification asynchronously (don't await to avoid delaying response)
    if (createdBill) {
      notifyNewBillCreated({
        billNo: createdBill.billNo || 'N/A',
        contractNo: contract.agreementNo || 'N/A',
        userName: user.name || 'Unknown User',
        userEmail: user.email || 'N/A',
        grossAmount: createdBill.grossBillAmount || 0,
        pvcAmount: createdBill.pvcCalculation?.totalPvc || 0,
        dateOfMeasurement: createdBill.dateOfMeasurement,
        isFinalPvc: createdBill.isFinalPvc || false,
        isChargeable: createdBill.isChargeable || false,
        processingFee: createdBill.processingFee || 0
      }).catch(error => {
        // Log but don't fail the bill creation if Slack notification fails
        console.error('⚠️ Failed to send Slack notification for new bill:', error);
      });
    }
    
    return NextResponse.json({
      ...createdBill,
      pvcCheckCredit: pvcCheckCredit > 0 ? pvcCheckCredit : undefined,
      appliedPvcCheckCredit: pvcCheckCredit > 0
    });
    
  } catch (error) {
    console.error('\n❌ ===== ERROR IN BILL CREATION =====');
    console.error(error);
    console.error('❌ ===== ERROR DETAILS END =====\n');
    
    const { message, code, statusCode } = handleApiError(error);
    return NextResponse.json({ error: message, code }, { status: statusCode });
  }
}
