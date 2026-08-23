import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc, calculateWeightedComponents } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getSteelCityForZone, getFuelIndexNameForBill, DEFAULT_FUEL_PRICE_TYPE } from '@/lib/zone-steel-city-mapping';
import { validateApiAccess, validateBillProcessing } from '@/lib/payment-validation';
import { calculateExtensionCompliantPvc } from '@/lib/extension-compliance';
import { getBillingSettings } from '@/lib/admin-settings';
import { billAccessWhere, compareBillAccessPaths, checkUserContractAccess } from '@/lib/permissions';
import { validateMeasurementDateAgainstProvisionalIndices } from '@/lib/provisional-validation';
import { handleApiError } from '@/lib/error-handler';
import { isBillUsingProvisionalIndices, areFinalIndicesAvailableForBill, relevantIndexNamesForBill } from '@/lib/index-status';
import { withTimeout, TIMEOUT_DEFAULTS } from '@/lib/api-timeout';
import { getPaginationParams, createPaginatedResponse } from '@/lib/api-helpers';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { extractSteelTypesFromEntries } from '@/lib/steel-type-handler';
import { resolveBillClassificationPolicy } from '@/lib/bill-classification-policy';
import { sendBillPDFNotification, isMyDreamsWhatsAppConfigured, validatePhoneNumber, getAdminWhatsAppNumber, sendBillPDFWithTemplate } from '@/lib/whatsapp-mydreams';
import { notifyNewBillCreated } from '@/lib/slack-webhook';
import jwt from 'jsonwebtoken';
import { getNextAuthSecret } from '@/lib/auth';
import { emailLinkOrigin } from '@/lib/email-link-origin';

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
        
        // Who may see what, as a condition the database applies while it pages — not a
        // list of every accessible id brought into memory first. null = admin, no filter.
        // See billAccessWhere for the rules and the one failure mode that matters.
        const accessWhere = await billAccessWhere(user.id);
        const isUnrestricted = accessWhere === null;

        // AND-ed under its own key so a later `contractId` cannot collide with the OR inside.
        let billsWhere: Record<string, any> = isUnrestricted ? {} : { AND: [accessWhere] };

        // If contractId is specified, check contract access and narrow the filter
        if (contractId) {
          const contractAccess = await checkUserContractAccess(user.id, contractId);
          if (!contractAccess?.canView) {
            return NextResponse.json({ error: 'Access denied to this contract' }, { status: 403 });
          }
          billsWhere = { ...billsWhere, contractId };
        }

        // Phase-2 check: the old id-list and the new predicate, compared for this person
        // after the response has gone. Records any disagreement for the admin; never
        // changes what is shown. Removed once it has been quiet long enough.
        after(() => compareBillAccessPaths(user.id, 'bills-list'));

        // The heavy per-bill relations (workClassification + full classificationEntries)
        // are ONLY read by the new-bill "carry forward classification from the previous
        // bill" flow, which always requests a single contract (?contractId=...). The
        // general list (?limit=1000, no contractId — bills page, mobile list, admin
        // permissions) never reads them, so we skip them there to avoid fetching every
        // entry + its classification/subClassification for up to 1000 bills.
        const includeClassificationRelations = !!contractId;

        // Count and fetch in parallel — single round-trip each, no ID array ping-pong
        const [total, bills] = await Promise.all([
          prisma.bill.count({ where: billsWhere }),
          prisma.bill.findMany({
            where: billsWhere,
            orderBy: { dateOfMeasurement: 'desc' },
            skip,
            take: limit,
            include: {
              contract: {
                select: {
                  id: true,
                  agreementNo: true,
                  contractorName: true,
                  // The card offers a tap-to-call link; without this it had a name and no way to use it.
                  contractorPhone: true,
                  workDescription: true,
                  isExtended: true,
                  extensionType: true,
                  coveringLetterDesignation: true,
                  loaDate: true,
                  baseMonth: true,
                  user: { select: { id: true, name: true, email: true } }
                }
              },
              ...(includeClassificationRelations
                ? {
                    workClassification: true,
                    classificationEntries: {
                      include: { classification: true, subClassification: true },
                    },
                  }
                : {}),
              pvcCalculation: true,
              billTransaction: { select: { id: true, amount: true, discount: true, discountType: true, status: true, isFree: true, createdAt: true } }
            }
          })
        ]);
        
        // Batch provisional-index check: deduplicate quarters before hitting DB
        // A page of 20 bills often share the same 2-3 quarters — no need for 20 queries
        // The status must be judged against the indices THIS bill prices on. Its fuel and
        // steel indices depend on the zone, so the memo key carries them too — two bills in
        // the same quarter but different zones are not the same question.
        const keyFor = (b: any) =>
          `${b.quarter}::${b.contract.baseMonth.toISOString()}::${relevantIndexNamesForBill(b.zone, b.fuelPriceType).sort().join('|')}`;
        const uniqueQuarters = [...new Set(bills.map(keyFor))];
        const statusByKey = new Map<string, { isProvisional: boolean; provisionalCount: number; totalCount: number; provisionalIndices: string[]; details: string }>();
        await Promise.all(
          uniqueQuarters.map(async key => {
            const [quarter, baseMonthISO, indexList] = key.split('::');
            const status = await isBillUsingProvisionalIndices(
              quarter,
              new Date(baseMonthISO),
              indexList ? indexList.split('|').filter(Boolean) : undefined,
            );
            statusByKey.set(key, {
              isProvisional: status.isProvisional,
              provisionalCount: status.provisionalCount,
              totalCount: status.totalCount,
              provisionalIndices: status.provisionalIndices,
              details: status.details,
            });
          })
        );
        // Latch the sticky provisional flag for bills whose numbers were computed before this
        // column existed (or before it was set): if the quarter is provisional right now, record
        // it so the "Regenerate" action survives once the real index is later published.
        const idsToLatch = bills
          .filter(b => b.pvcCalculation && !(b.pvcCalculation as any).usedProvisionalIndices
            && statusByKey.get(keyFor(b))?.isProvisional)
          .map(b => b.pvcCalculation!.id);
        if (idsToLatch.length > 0) {
          await prisma.pvcCalculation.updateMany({
            where: { id: { in: idsToLatch } },
            data: { usedProvisionalIndices: true },
          });
        }
        const latched = new Set(idsToLatch);
        const billsWithStatus = bills.map(bill => ({
          ...bill,
          pvcCalculation: bill.pvcCalculation && latched.has(bill.pvcCalculation.id)
            ? { ...bill.pvcCalculation, usedProvisionalIndices: true }
            : bill.pvcCalculation,
          indicesStatus: statusByKey.get(keyFor(bill))
            ?? { isProvisional: false, provisionalCount: 0, totalCount: 0, provisionalIndices: [], details: '' }
        }));
        
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
  logger.log('\n🚀 ===== NEW BILL API: POST REQUEST STARTED =====\n');
  
  try {
    // ===== STEP 1: Authentication & Authorization =====
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
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
      fuelPriceType = DEFAULT_FUEL_PRICE_TYPE,
      isFinalPvc = false,
      nonScheduleItems = [],
      classificationEntries = [],
      isAiUploaded,
      railwaySuppliedMaterialValue = 0,
      extraItemsOutsidePvc = 0,
      extractedAgreementNo = '',
    } = body;

    // GCC-2022 Cl.46A: W (the PVC base) is the gross value of work done EXCLUDING the
    // "cost of materials supplied by Railway either free or at fixed rate". The billed
    // entry amounts stay as-is (that is the real work value); only the base the PVC is
    // computed on is reduced, spread across entries in proportion to their amounts.
    const railwaySupplied = Math.max(0, parseFloat(railwaySuppliedMaterialValue) || 0);
    // Cl.46A.1(b): an extra item added under Cl.39(1)(b) — one outside the tender's Bill
    // of Quantities — is excluded from the value price variation is computed on, unless
    // applicability of PVC and a base month were specially agreed when its rate was
    // fixed. Where they were agreed, that item is not entered here and is priced like
    // any other. Not to be confused with the B-schedule items a tender itself carries:
    // those are part of the contract and attract PVC in the ordinary way.
    const extraItems = Math.max(0, parseFloat(extraItemsOutsidePvc) || 0);
    const outsidePvc = railwaySupplied + extraItems;
    const entriesTotalAmount = (classificationEntries || []).reduce(
      (sum: number, e: any) => sum + (parseFloat(e?.amount) || 0),
      0,
    );
    const pvcBaseFactor = outsidePvc > 0 && entriesTotalAmount > outsidePvc
      ? (entriesTotalAmount - outsidePvc) / entriesTotalAmount
      : 1;

    // ===== STEP 2: Payment Validation =====
    const paymentValidation = await validateBillProcessing(request, isAiUploaded);
    if (!paymentValidation.canProcess) {
      return NextResponse.json({
        error: 'Payment required',
        reason: paymentValidation.reason,
        requiredPayment: paymentValidation.requiredPayment,
        isFree: paymentValidation.isFree || false
      }, { status: 402 });
    }

    let isBillFree = paymentValidation.isFree;
    let calculatedBillCost = paymentValidation.requiredPayment || 0;

    // ===== STEP 2B: Railway Official checks =====
    if (user!.role === 'railway_official') {
      // 1. Posting details must be complete
      const roProfile = await prisma.user.findUnique({
        where: { id: user!.id },
        select: { designation: true, department: true, railwayZone: true, division: true },
      });
      const missingFields: string[] = [];
      if (!roProfile?.designation) missingFields.push('Designation');
      if (!roProfile?.department)  missingFields.push('Department');
      if (!roProfile?.railwayZone) missingFields.push('Railway Zone');
      if (!roProfile?.division)    missingFields.push('Division');
      if (missingFields.length > 0) {
        return NextResponse.json({
          error: 'Incomplete posting details',
          reason: `Please complete your Railway Posting Details before creating a bill. Missing: ${missingFields.join(', ')}.`,
          missingPostingFields: missingFields,
          postingIncomplete: true,
        }, { status: 403 });
      }

    }
    
    // ===== STEP 3A: Lock zone for Railway Officials =====
    // Always use the zone stored on their profile — ignore whatever was submitted
    let effectiveZone = zone;
    if (user!.role === 'railway_official') {
      const roUser = await prisma.user.findUnique({ where: { id: user!.id }, select: { railwayZone: true } });
      if (roUser?.railwayZone) {
        effectiveZone = roUser.railwayZone;
      } else if (!zone) {
        return NextResponse.json({
          error: 'Zone not configured',
          reason: 'Your Railway Official account does not have a zone assigned. Please contact your administrator.',
        }, { status: 400 });
      }
    }

    // Validate required fields
    if (!contractId || !billNo || !grossBillAmount || !billAmount || !dateOfMeasurement) {
      return NextResponse.json({ error: 'Missing required fields: contractId, billNo, grossBillAmount, billAmount, dateOfMeasurement' }, { status: 400 });
    }

    const normalizedBillNo = String(billNo).trim();
    const duplicateBill = await prisma.bill.findFirst({
      where: {
        contractId,
        billNo: { equals: normalizedBillNo, mode: 'insensitive' },
      },
      select: { id: true, billNo: true },
    });
    if (duplicateBill) {
      // The id travels with the refusal so the screen can offer to open it. Someone
      // who uploads the same PDF twice wants the report that already exists, and
      // someone who mistyped the number learns which bill they collided with — a bare
      // "already exists" leaves both of them with a dead end.
      return NextResponse.json(
        {
          error: `Bill number ${duplicateBill.billNo} already exists for this contract`,
          existingBillId: duplicateBill.id,
          existingBillNo: duplicateBill.billNo,
        },
        { status: 409 },
      );
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
      // One check pays for one bill. Nothing marks a PvcCheck consumed, so the credit
      // used to apply to EVERY bill created in the 30-minute window — one ₹500 check
      // waived the fee on an unlimited run of bills. A bill for the same contract and
      // measurement date created after the check means the credit has been spent.
      const creditAlreadyUsed = await prisma.bill.findFirst({
        where: {
          contractId,
          dateOfMeasurement: new Date(dateOfMeasurement),
          createdAt: { gt: recentPvcCheck.createdAt },
        },
        select: { id: true },
      });
      if (!creditAlreadyUsed) {
        pvcCheckCredit = recentPvcCheck.amount; // Typically ₹500
        logger.log(`✅ Found recent PVC check (${recentPvcCheck.id}): Applying ₹${pvcCheckCredit} credit toward bill processing`);
      } else {
        logger.log(`PVC check ${recentPvcCheck.id} already used by bill ${creditAlreadyUsed.id}; no credit applied`);
      }
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
        loaNo: true,
        baseMonth: true,
        isExtended: true,
        extensionType: true,
        originalCompletionDate: true,
        currentCompletionDate: true,
        contractorName: true,
        contractorPhone: true,
        workDescription: true,
        // Needed to label the quarter under the right clause (see STEP 6).
        dateOfOpening: true,
        pvcClauseVersion: true,
        pre2022WorkType: true,
      }
    });
    
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // ===== STEP 4A2: Fill in the real agreement number from the bill =====
    // A contract created from an LOA carries the LOA number as a stand-in, because the
    // LOA usually has no agreement number. The bill PDF prints the real one — the first
    // bill hands it to the contract. Only a stand-in is ever replaced (agreementNo equals
    // the contract's own loaNo), so a hand-typed real number can never be overwritten by
    // a stray bill. On a clash with another contract the stand-in simply stays.
    const billAgreementNo = String(extractedAgreementNo || '').trim();
    // The contract's agreementNo is stored NORMALIZED (uppercase, spaces/dots stripped)
    // while loaNo is stored as read — so the stand-in test must normalize both sides,
    // or an LOA number containing a space or dot never equals its own stand-in and the
    // real number is never adopted.
    const { normalizeAgreementNo } = await import('@/lib/railway-division-helper');
    const normalizedContractNo = normalizeAgreementNo(contract.agreementNo);
    const isLoaStandIn = Boolean(
      contract.loaNo &&
      normalizedContractNo &&
      normalizedContractNo === normalizeAgreementNo(contract.loaNo)
    );
    // The FIRST bill only — the name of this step. Once bills exist, PVC numbers have
    // been issued as PVC/<agreementNo>/001…, and renaming the contract would leave the
    // next one inconsistent with every one already submitted. It also protects a
    // contract whose loaNo merely repeats its real agreement number: indistinguishable
    // from a stand-in, and production holds two such contracts, one with nine bills.
    const contractHasBills = isLoaStandIn
      ? (await prisma.bill.count({ where: { contractId } })) > 0
      : false;
    if (
      billAgreementNo &&
      isLoaStandIn &&
      !contractHasBills &&
      normalizeAgreementNo(billAgreementNo) !== normalizedContractNo
    ) {
      // Store it the same way manual creation does, so lookups and the trial-claim
      // dedup see one spelling of the number.
      const adoptedNo = normalizeAgreementNo(billAgreementNo) || billAgreementNo;
      // Ask FIRST whether the number is free, rather than letting the unique index
      // refuse the write. Both end with the stand-in kept, but the failed write is
      // logged by the driver before this code can catch it, so a perfectly handled
      // situation showed up in production as a prisma:error — noise that makes a real
      // error harder to see. (Seen for real: a second account uploading a bill for an
      // agreement another account already holds.) The shared helper always checked
      // first; this copy did not.
      const numberTaken = await prisma.contract.findFirst({
        where: {
          OR: [
            { agreementNo: { equals: adoptedNo, mode: 'insensitive' } },
            { agreementNo: { equals: billAgreementNo.trim(), mode: 'insensitive' } },
          ],
          NOT: { id: contract.id },
        },
        select: { id: true },
      });
      if (numberTaken) {
        logger.log(`⚠️ Agreement number ${adoptedNo} already belongs to another contract — keeping the LOA stand-in on ${contract.id}.`);
      } else {
        try {
          await prisma.contract.update({
            where: { id: contract.id },
            data: { agreementNo: adoptedNo },
          });
          logger.log(`🔗 Contract ${contract.id}: agreement number ${adoptedNo} taken from the bill (was LOA stand-in ${contract.agreementNo})`);
          contract.agreementNo = adoptedNo;
        } catch (e: any) {
          // Still guarded: two bills racing could both pass the check above.
          logger.log(`⚠️ Could not adopt agreement number ${billAgreementNo} from the bill: ${e?.code || e?.message}`);
        }
      }
    }

    const classificationPolicy = await resolveBillClassificationPolicy(
      contract.workDescription,
      classificationEntries,
      { cementAmount, steelTmtBarsAmount, steelAngleChannelAmount, steelPlatesAmount, steelOtherSectionsAmount },
    );

    // ===== STEP 4B: Block trial if this agreement number already claimed globally =====
    // Only applies to actual trial users — not admins, railway officials, or free accounts
    // A free bill for a normal user (not admin/official/free-account/₹0-fee) can only be
    // free because of the trial. Do NOT gate on user.isTrialActive here: with the default
    // 1-bill trial it is already false at the moment the trial is consumed, which made this
    // whole agreement-dedup check dead code and let one agreement claim a trial from any
    // number of accounts.
    const isActualTrialBill =
      isBillFree &&
      user.role !== 'admin' &&
      user.role !== 'superadmin' &&
      user.role !== 'railway_official' &&
      !user.isFreeAccount &&
      user.customProcessingFee !== 0;
    if (isActualTrialBill) {
      const { normalizeAgreementNo } = await import('@/lib/railway-division-helper');
      // Both names the agreement answers to: its own number and the LOA number it
      // stood on beforehand. Checking only the current one meant an agreement whose
      // LOA identifier had already taken a free bill still passed here, and was
      // refused later at claim time — after the bill had been built.
      const claimNames = [contract.agreementNo, contract.loaNo]
        .map(value => normalizeAgreementNo(String(value || '')))
        .filter(Boolean) as string[];
      if (claimNames.length > 0) {
        const alreadyClaimed = await prisma.trialClaimedAgreement.findFirst({
          where: { normalizedAgreementNo: { in: claimNames } }
        });
        if (alreadyClaimed) {
          // Agreement has already claimed a free trial.
          // Check if this user has enough credit balance to pay for the bill instead of using a trial.
          const currentBalance = user.customerAccount?.creditBalance || 0;
          
          const billingSettings = await getBillingSettings();
          const fullCost = isAiUploaded
            ? (billingSettings.aiBillCost || 499)
            : (billingSettings.billCost || 199);
          // A negotiated per-bill rate applies here too. This downgrade path charged
          // the standard rate, so a ₹50-a-bill customer paid ₹199 whenever their
          // agreement's trial was already claimed — same bill, two prices.
          const costToCharge = user.customProcessingFee !== null && user.customProcessingFee > 0
            ? user.customProcessingFee
            : fullCost;

          if (currentBalance >= costToCharge) {
            // User can afford the bill, downgrade from free trial to paid bill
            isBillFree = false;
            calculatedBillCost = costToCharge;
            logger.log(`⚠️ Agreement ${contract.agreementNo} already claimed a trial globally. User has ₹${currentBalance} credits, charging ₹${costToCharge} instead of free trial.`);
          } else {
            return NextResponse.json({
              error: 'Payment required',
              reason: 'A free trial has already been used for this Agreement Number. Please add credits to continue.',
              requiredPayment: costToCharge,
              isFree: false
            }, { status: 402 });
          }
        }
      }
    }

    // NOTE: The "Generate with AI" classification-justification fee (₹99) is charged
    // on the server at the moment the AI runs (see app/api/bills/classification-justification).
    // It is intentionally NOT re-charged here, so it cannot be dodged via bill edit,
    // bulk/external create, or by suppressing a client flag at save.

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
    
    const baseMonthDate = new Date(contract.baseMonth);
    const measurementYear = measurementDate.getFullYear();
    const measurementMonth = measurementDate.getMonth();
    const baseYear = baseMonthDate.getFullYear();
    const baseMonthVal = baseMonthDate.getMonth();
    
    if (measurementYear < baseYear || (measurementYear === baseYear && measurementMonth <= baseMonthVal)) {
      return NextResponse.json({ 
        error: `Measurement date must be in a month after the contract base month (${baseMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`
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
    // Always the MEASUREMENT date's quarter — including under a 17B extension. The
    // clause (GCC 46A.10, as this codebase reads it in extension-compliance.ts) is
    // UsedIndex = min(current quarter average, Index_L): price the current quarter,
    // capped at the last month of the original completion period. Creation used to
    // freeze the quarter AT the completion date instead — a different reading that
    // denied the railway the benefit of indices falling after the period, disagreed
    // with what Regenerate then computed, and mislabelled the stored quarter. The cap
    // is applied to the averages below.
    const quarterDateForCalculation = measurementDate;
    const under17BRestriction = !!(contract.isExtended
      && contract.extensionType === '17B'
      && contract.originalCompletionDate
      && measurementDate > contract.originalCompletionDate);
    
    // The two clauses count quarters from different months: GCC-2022 from the month
    // after the base month, the older clause from the month after the OPENING month.
    // Every bill was labelled by the 2022 rule, so on an old-clause contract the stored
    // label could sit one quarter away from the one its statement is actually priced
    // in — the same bill reading Q2 on the contract page and Q1 on its statement.
    const { resolvePre2022Setup } = await import('@/lib/pre2022-contract');
    const clauseSetup = resolvePre2022Setup(contract as any);
    let quarter: string;
    if (clauseSetup.isPre2022 && contract.dateOfOpening) {
      const { pre2022QuarterFromDate } = await import('@/lib/pvc-pre2022');
      quarter = pre2022QuarterFromDate(quarterDateForCalculation, new Date(contract.dateOfOpening));
    } else {
      quarter = getQuarterFromDate(quarterDateForCalculation, contract.baseMonth);
    }
    logger.log(`📊 Calculated Quarter: ${quarter} (${clauseSetup.isPre2022 ? 'pre-2022 clause' : 'GCC-2022'})`);
    
    // ===== STEP 7: Generate PVC Number =====
    // To prevent duplicate pvcNumbers when intermediate bills are deleted,
    // find the maximum sequence number among all existing bills for this contract.
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
    const sequenceNumber = String(maxSequence + 1).padStart(3, '0');
    const autoPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;
    
    // ===== STEP 8: CRITICAL - Extract Steel Types from Classification Entries =====
    logger.log('\n🔍 ===== EXTRACTING STEEL TYPES =====');
    const extractedSteelTypes = await extractSteelTypesFromEntries(classificationEntries);
    logger.log(`✅ Steel types to be stored in bill: [${extractedSteelTypes.join(', ') || 'None'}]`);
    logger.log('🔍 ===== STEEL TYPES EXTRACTED =====\n');
    
    // ===== STEP 9: Assemble the Bill Record (written later, with everything else) =====
    // Nothing is written until STEP 17, where the bill, its classification entries and
    // its PVC calculation are inserted together in one transaction. They used to be
    // three separate writes ~250 lines apart, with the index lookups and the whole
    // calculation in between: a function timeout anywhere in that stretch left a bill
    // row with no calculation and no charge — visible to its owner, showing no
    // numbers, never billed — and the duplicate check then refused to let them create
    // it again. The heavy work stays OUTSIDE the transaction so it cannot be held open
    // (Prisma closes an interactive transaction after five seconds).
    const billData = {
        contractId,
        billNo: normalizedBillNo,
        // The same fact that priced this bill, kept rather than discarded.
        createdVia: isAiUploaded ? 'pdf' : 'manual',
        grossBillAmount: parseFloat(grossBillAmount),
        billAmount: parseFloat(billAmount),
        cementAmount: classificationPolicy.cementAmount,
        steelTmtBarsAmount: classificationPolicy.steelTmtBarsAmount,
        steelAngleChannelAmount: classificationPolicy.steelAngleChannelAmount,
        steelPlatesAmount: classificationPolicy.steelPlatesAmount,
        steelOtherSectionsAmount: classificationPolicy.steelOtherSectionsAmount,
        steelTypes: extractedSteelTypes, // CRITICAL: Store extracted steel types
        dateOfMeasurement: measurementDate,
        quarter,
        zone: effectiveZone || null,
        fuelPriceType: fuelPriceType || DEFAULT_FUEL_PRICE_TYPE,
        pvcNumber: autoPvcNumber,
        isFinalPvc: isFinalPvc || false,
        dateOfCompletion: dateOfCompletion ? new Date(dateOfCompletion) : null,
        nonScheduleItems: nonScheduleItems || [],
        isChargeable: !isBillFree,
        processingFee: isBillFree ? 0 : calculatedBillCost,
        subClassifications: []
    };

    logger.log(`📝 Bill record assembled for ${normalizedBillNo}`);
    logger.log(`   Steel types to store: [${extractedSteelTypes.join(', ') || 'None'}]`);

    // ===== STEP 10: Get Quarterly Averages (Needed for Entry PVC Calculations) =====
    // Use zone-based steel city prices instead of default Chennai rates
    const steelIndexNames = getSteelIndexNamesForZone(effectiveZone);
    const fuelIndexName = getFuelIndexNameForBill(effectiveZone, fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    logger.log(`📊 Using steel indices for zone "${effectiveZone}" (city: ${getSteelCityForZone(effectiveZone)}):`, steelIndexNames);
    logger.log(`⛽ Using fuel index: ${fuelIndexName} (fuelPriceType: ${fuelPriceType})`);

    // Pre-2022 quarters start a month later than the GCC-2022 rule derives from the
    // quarter label alone. The label was already clause-aware; without this override
    // the averages were still taken over the GCC-2022 months — one month early — with
    // the label merely relabelling them.
    let pre2022MonthsOverride: Date[] | undefined;
    if (clauseSetup.isPre2022 && contract.dateOfOpening) {
      const { pre2022QuarterMonths } = await import('@/lib/pvc-pre2022');
      pre2022MonthsOverride = pre2022QuarterMonths(quarter, new Date(contract.dateOfOpening));
    }
    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, calculationMethod, pre2022MonthsOverride);

    // GCC 46A.10: under a 17B extension, each index is capped at Index_L — the index
    // of the last month of the original completion period. min() applied to the
    // averages HERE reaches every downstream figure the same way: per-entry PVC and
    // the dedicated cement/steel amounts alike.
    let indexCapInfo: { indexL: Record<string, number>; restrictionDate: Date } | null = null;
    if (under17BRestriction && contract.originalCompletionDate) {
      const { getCappedIndices } = await import('@/lib/extension-compliance');
      const capped = await getCappedIndices(
        new Date(contract.originalCompletionDate),
        quarterlyAverages,
        new Date(contract.baseMonth),
      );
      for (const qa of quarterlyAverages) {
        if (capped.cappedIndices[qa.indexName] !== undefined) {
          qa.average = capped.cappedIndices[qa.indexName];
        }
      }
      indexCapInfo = { indexL: capped.indexL_Values, restrictionDate: new Date(contract.originalCompletionDate) };
      logger.log(`🔒 17B: averages capped at Index_L of ${indexCapInfo.restrictionDate.toISOString().slice(0, 7)}`);
    }
    
    // ===== STEP 11: Work Out Each Classification Entry's PVC =====
    // Computed here, written in STEP 17 alongside the bill.
    const entryRowsToCreate: any[] = [];
    let totalClassificationPvc = 0;
    let totalClassificationLabour = 0;
    let totalClassificationPlant = 0;
    let totalClassificationFuel = 0;
    let totalClassificationMaterials = 0;
    let totalClassificationCement = 0;
    let totalClassificationSteel = 0;
    let totalClassificationExplosives = 0;
    
    if (classificationEntries && classificationEntries.length > 0) {
      logger.log(`\n📋 Creating ${classificationEntries.length} classification entries with per-entry PVC calculations...`);

      const { calculateClassificationEntryPvc, getClassificationComponents } = await import('@/lib/pvc-calculations');

      for (const entry of classificationEntries) {
        const hasValidAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined;

        if (hasValidAmount && (entry.subClassificationId || entry.classificationId)) {
          // Shared cache — the same row the PVC calculation reads below, so checking for
          // a steel component no longer costs its own query per entry.
          const components = await getClassificationComponents(entry.subClassificationId, entry.classificationId);
          const hasSteelComponent = (components?.steel ?? 0) > 0;
          
          // Use entry's steel types if specified, otherwise use bill-level steel types if entry has steel
          const entrySteelTypes = entry.steelTypes && entry.steelTypes.length > 0 
            ? entry.steelTypes 
            : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);
          
          const hasDedicatedCement = classificationPolicy.cementAmount > 0;
          const hasDedicatedSteel = 
            classificationPolicy.steelTmtBarsAmount > 0 ||
            classificationPolicy.steelAngleChannelAmount > 0 ||
            classificationPolicy.steelPlatesAmount > 0 ||
            classificationPolicy.steelOtherSectionsAmount > 0;

          // Calculate PVC for this specific entry
          const entryPvc = await calculateClassificationEntryPvc(
            {
              subClassificationId: entry.subClassificationId,
              classificationId: entry.classificationId,
              // PVC base excludes railway-supplied material (factor is 1 when none).
              amount: parseFloat(entry.amount) * pvcBaseFactor,
              steelTypes: entrySteelTypes
            },
            quarterlyAverages,
            {
              hasDedicatedSteel,
              hasDedicatedCement
            }
          );
          
          // Collected now, written with the bill in STEP 17. billId is added there,
          // since the bill row does not exist until the transaction runs.
          entryRowsToCreate.push({
              subClassificationId: entry.subClassificationId || null,
              classificationId: entry.classificationId || null,
              amount: parseFloat(entry.amount),
              description: entry.description || null,
              classificationJustification: entry.classificationJustification || null,
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
              totalPvc: entryPvc.totalPvc,
          });

          if (hasSteelComponent && entrySteelTypes.length > 0) {
            logger.log(`   ✅ Entry with steel PVC: ₹${entryPvc.steelPvc.toFixed(2)} → Steel types: [${entrySteelTypes.join(', ')}]`);
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
          
          logger.log(`   ✅ Entry created with PVC: ₹${entryPvc.totalPvc.toFixed(2)}`);
        }
      }
      
      logger.log(`\n📊 Total Classification PVC: ₹${totalClassificationPvc.toFixed(2)}`);
    }
    
    // ===== STEP 12: Use Per-Entry PVC Calculations (Already Computed) =====
    logger.log('\n💰 ===== USING PER-ENTRY PVC CALCULATIONS =====');
    logger.log(`   Contract Extension: ${contract.isExtended ? contract.extensionType : 'None'}`);
    logger.log(`   Total Classification Labour PVC: ₹${totalClassificationLabour.toFixed(2)}`);
    logger.log(`   Total Classification Steel PVC: ₹${totalClassificationSteel.toFixed(2)}`);
    logger.log(`   Total Classification PVC: ₹${totalClassificationPvc.toFixed(2)}`);
    
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
        isInExtensionPeriod: under17BRestriction,
        extensionType: contract.isExtended ? contract.extensionType : null,
        pvcRestrictionDate: indexCapInfo?.restrictionDate ?? null
      },
      appliedRestrictions: {
        // The cap was applied to the averages themselves, so the totals above ARE the
        // restricted figures. Recording isRestricted keeps the stored row honest —
        // it used to say false even when a 17B extension governed the bill.
        isRestricted: !!indexCapInfo,
        originalPvcAmount: totalClassificationPvc,
        restrictedPvcAmount: totalClassificationPvc,
        savingsAmount: 0
      }
    };

    logger.log('💰 ===== PER-ENTRY PVC CALCULATIONS COMPLETE =====\n');
    
    // ===== STEP 14: Calculate Dedicated Cement and Steel PVC =====
    const dedicatedCementPvc = calculateDedicatedCementPvc(classificationPolicy.cementAmount, quarterlyAverages);
    
    const dedicatedSteelTmtBarsPvc = calculateDedicatedSteelPvc(classificationPolicy.steelTmtBarsAmount, quarterlyAverages, 'Steel TMT Bars');
    const dedicatedSteelAngleChannelPvc = calculateDedicatedSteelPvc(classificationPolicy.steelAngleChannelAmount, quarterlyAverages, 'Steel Angle/Channel');
    const dedicatedSteelPlatesPvc = calculateDedicatedSteelPvc(classificationPolicy.steelPlatesAmount, quarterlyAverages, 'Steel Plates');
    const dedicatedSteelOtherSectionsPvc = calculateDedicatedSteelPvc(classificationPolicy.steelOtherSectionsAmount, quarterlyAverages, 'Steel Other Sections');
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
    
    logger.log('\n📊 ===== FINAL PVC BREAKDOWN =====');
    logger.log(`   Labour: ₹${extensionCompliantResult.labourPvc.toFixed(2)}`);
    logger.log(`   Cement: ₹${finalCementPvc.toFixed(2)} (classification: ₹${extensionCompliantResult.cementPvc.toFixed(2)} + dedicated: ₹${dedicatedCementPvc.toFixed(2)})`);
    logger.log(`   Steel: ₹${finalSteelPvc.toFixed(2)} (classification: ₹${extensionCompliantResult.steelPvc.toFixed(2)} + dedicated: ₹${totalDedicatedSteelPvc.toFixed(2)})`);
    logger.log(`   TOTAL PVC: ₹${totalPvc.toFixed(2)}`);
    logger.log('📊 ===== PVC BREAKDOWN COMPLETE =====\n');
    
    // ===== STEP 16: Calculate Cumulative PVC =====
    const previousPvcCalculations = await prisma.pvcCalculation.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' }
    });
    const previousPvcTotal = previousPvcCalculations.length > 0 ? previousPvcCalculations[0].cumulativePvc : 0;
    
    // ===== STEP 17: Write the bill, its entries and its calculation — together =====
    // One transaction: all three exist or none does. Only writes are inside it; every
    // index lookup and calculation already happened above, so it opens and closes in
    // milliseconds and cannot hit Prisma's five-second interactive-transaction limit.
    const pvcCalculationData = {
        contractId,
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
        pvcSavingsDueToRestriction: extensionCompliantResult.appliedRestrictions.savingsAmount || 0,
        // Sticky flag: remember that this bill's numbers were computed with provisional/
        // borrowed indices, so the list can keep offering "Regenerate" until it is recalculated.
        usedProvisionalIndices: indicesCheck.isProvisional === true
    };

    let bill;
    try {
      bill = await prisma.$transaction(async (tx) => {
        const created = await tx.bill.create({ data: billData });
        if (entryRowsToCreate.length > 0) {
          // One statement rather than one per entry: a bill can carry dozens, and each
          // round trip would spend the transaction's budget.
          await tx.billClassificationEntry.createMany({
            data: entryRowsToCreate.map((row) => ({ ...row, billId: created.id })),
          });
        }
        await tx.pvcCalculation.create({ data: { ...pvcCalculationData, billId: created.id } });
        return created;
      }, {
        // Generous against a slow database, still far below the function's own limit.
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (writeError: any) {
      // The unique index on (contractId, billNo) — the duplicate check ~250 lines above
      // is check-then-act with several awaits in between, so two requests can both pass
      // it. This is the database refusing the second one.
      if (writeError?.code === 'P2002') {
        // Lost the race to a request that got there first — find what it created so
        // this one can be pointed at it rather than just turned away.
        const winner = await prisma.bill.findFirst({
          where: { contractId, billNo: { equals: normalizedBillNo, mode: 'insensitive' } },
          select: { id: true, billNo: true },
        }).catch(() => null);
        return NextResponse.json(
          {
            error: `Bill number ${winner?.billNo ?? normalizedBillNo} already exists for this contract`,
            existingBillId: winner?.id,
            existingBillNo: winner?.billNo,
          },
          { status: 409 },
        );
      }
      throw writeError;
    }

    if (railwaySupplied > 0) {
      // Best-effort and deliberately outside the transaction: this column arrives via
      // Pending DB Changes, and on a database that has not had it applied the write
      // fails — which inside the transaction would discard a perfectly good bill. The
      // PVC is already correct either way, since pvcBaseFactor was applied above.
      await prisma.bill.update({
        where: { id: bill.id },
        data: { railwaySuppliedMaterialValue: railwaySupplied },
      }).catch((err) =>
        console.error('Could not store railwaySuppliedMaterialValue (migration pending?):', err));
    }

    logger.log(`✅ Bill ${bill.id} written with ${entryRowsToCreate.length} entries and its PVC calculation`);

    // ===== STEP 17B: Re-run cumulative totals in measurement order =====
    // The previousPvcTotal above came from the latest calculation BY CREATION TIME.
    // Back-entering an earlier bill (Bill 2 typed after Bill 3) made Bill 2's
    // cumulative include Bill 3's PVC — non-monotonic columns on the master sheet.
    // The update and bulk-create paths already recompute in dateOfMeasurement order;
    // create now does the same.
    const { recalculateCumulativePvcForContract } = await import('@/lib/recalculateCumulativePvc');
    await recalculateCumulativePvcForContract(contractId).catch((e) =>
      console.error('Cumulative PVC recalculation failed:', e));

    // ===== STEP 18: Create Bill Transaction =====
    logger.log('\n💳 ===== CREATING BILL TRANSACTION =====');
    const { processPaymentForBill } = await import('@/lib/payment-validation');
    
    // Apply PVC check credit to bill processing fee
    const billProcessingFee = isBillFree ? 0 : calculatedBillCost;
    const finalBillAmount = Math.max(0, billProcessingFee - pvcCheckCredit);
    
    if (pvcCheckCredit > 0) {
      logger.log(`💳 PVC Check Credit Applied: ₹${billProcessingFee} - ₹${pvcCheckCredit} = ₹${finalBillAmount}`);
    }
    
    const paymentResult = await processPaymentForBill(
      user.id,
      bill.id,
      isBillFree ? 'free_account' : 'credit_balance',
      undefined, // No payment reference for automatic processing
      undefined, // No Razorpay data
      finalBillAmount,
      totalPvc,
      contract.agreementNo,
      isAiUploaded,
      // When this route decided the bill is paid (including the "agreement already
      // claimed a trial → charge instead" downgrade), the charge must happen — not a
      // second, doomed attempt at the trial.
      !isBillFree
    );
    
    if (!paymentResult.success) {
      console.error('❌ Failed to create bill transaction:', paymentResult.message);
      // The bill must not outlive a refused charge. "Still return the bill" was the
      // policy here, and it is how a lost trial-claim race or an insufficient balance
      // produced a kept bill with NO transaction row — which every watermark check
      // reads as fully paid. A bill that could not be charged is deleted, and the
      // caller is told to try again.
      await prisma.bill.delete({ where: { id: bill.id } }).catch((err) =>
        console.error('Could not remove unpaid bill:', err));
      await recalculateCumulativePvcForContract(contractId).catch(() => {});
      return NextResponse.json(
        {
          error: 'Payment could not be completed',
          reason: paymentResult.message || 'The charge for this bill did not go through. No bill was created — please try again.',
        },
        { status: 402 },
      );
    } else {
      logger.log('✅ Bill transaction created successfully');
    }
    logger.log('💳 ===== BILL TRANSACTION COMPLETE =====\n');
    
    // ===== STEP 19: Return Created Bill =====
    const createdBill = await prisma.bill.findUnique({
      where: { id: bill.id },
      include: {
        contract: true,
        workClassification: true,
        pvcCalculation: true,
        billTransaction: { select: { id: true, amount: true, discount: true, discountType: true, status: true, isFree: true, createdAt: true } }, // Include transaction in response
        classificationEntries: {
          include: {
            subClassification: true,
            classification: true
          }
        }
      }
    });
    
    logger.log(`\n✅ ===== BILL CREATED SUCCESSFULLY =====`);
    logger.log(`   Bill ID: ${bill.id}`);
    logger.log(`   Bill No: ${bill.billNo}`);
    logger.log(`   Steel Types Stored: [${(bill.steelTypes as string[])?.join(', ') || 'None'}]`);
    logger.log(`   Total PVC: ₹${totalPvc.toFixed(2)}`);
    logger.log(`   Transaction Status: ${paymentResult.success ? 'Processed' : 'Failed'}`);
    logger.log(`✅ ===== NEW BILL API: REQUEST COMPLETE =====\n`);
    
    // Send WhatsApp notification with PDF if configured and contractor has phone number
    const isWhatsAppConfigured = await isMyDreamsWhatsAppConfigured();
    const contractorPhone = contract.contractorPhone;
    
    if (isWhatsAppConfigured && contractorPhone && validatePhoneNumber(contractorPhone) && createdBill) {
      try {
        logger.log(`📱 Sending WhatsApp notification with PDF to contractor: ${contractorPhone}`);
        
        // Generate JWT token for public PDF access (valid for 24 hours)
        const pdfToken = jwt.sign(
          { billId: createdBill.id },
          getNextAuthSecret(),
          { expiresIn: '24h' }
        );
        
        // Generate public PDF URL via proxy endpoint (ensures proper PDF content-type headers)
        const encodedToken = encodeURIComponent(pdfToken);
        // Built from the canonical origin, never NEXTAUTH_URL: that names the platform
        // host, so contractors received WhatsApp links to a domain that is not the site.
        const pdfUrl = `${emailLinkOrigin()}/api/public/bill-pdf?billId=${createdBill.id}&token=${encodedToken}`;
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
          logger.log(`✅ WhatsApp notification with PDF sent successfully. Message ID: ${result.messageId}`);
        } else {
          console.error(`⚠️ Failed to send WhatsApp notification: ${result.error}`);
        }
      } catch (whatsappError) {
        console.error('⚠️ Error sending WhatsApp notification:', whatsappError);
        // Don't fail the bill creation if WhatsApp fails
      }
    } else if (isWhatsAppConfigured && !contractorPhone) {
      logger.log('ℹ️ WhatsApp is configured but contractor phone number is missing');
    } else if (isWhatsAppConfigured && contractorPhone && !validatePhoneNumber(contractorPhone)) {
      logger.log(`⚠️ WhatsApp is configured but contractor phone number is invalid: ${contractorPhone}`);
    }
    
    // Send WhatsApp notification to admin about new bill creation
    if (isWhatsAppConfigured && createdBill) {
      try {
        const adminWhatsAppNumber = await getAdminWhatsAppNumber();
        if (adminWhatsAppNumber) {
          logger.log(`📱 Sending bill creation notification to admin: ${adminWhatsAppNumber}`);
          
          // Send to admin with full bill details (function handles PDF generation and formatting)
          const result = await sendBillPDFWithTemplate(
            createdBill.id, // Bill ID
            adminWhatsAppNumber, // Send to admin
            contract.contractorName || 'Unknown Contractor' // Contractor name for context
          );
          
          if (result.success) {
            logger.log(`✅ Admin notification sent successfully. Message ID: ${result.messageId}`);
            logger.log(`   Bill: ${createdBill.billNo}`);
            logger.log(`   Contractor: ${contract.contractorName}`);
          } else {
            console.error(`⚠️ Failed to send admin notification: ${result.error}`);
          }
        } else {
          logger.log('ℹ️ Admin WhatsApp number not configured, skipping admin notification');
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
