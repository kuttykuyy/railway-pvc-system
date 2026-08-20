
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateDedicatedCementPvc, calculateDedicatedSteelPvc, calculateClassificationEntryPvc, getClassificationComponents } from '@/lib/pvc-calculations';
import { advancedCache } from '@/lib/advanced-cache';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canUserDeleteBill, canUserEditBill } from '@/lib/bill-permissions';
import { checkUserBillAccess } from '@/lib/permissions';
import { extractSteelTypesFromEntries } from '@/lib/steel-type-handler';
import { areFinalIndicesAvailableForBill } from '@/lib/index-status';
import { recalculateCumulativePvcForContract } from '@/lib/recalculateCumulativePvc';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { resolveBillClassificationPolicy } from '@/lib/bill-classification-policy';

export const dynamic = "force-dynamic";

// DELETE /api/bills/[id] - Delete a single bill
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    

    // Get user session
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user can delete this bill
    const { allowed, reason } = await canUserDeleteBill(user.id, id, user.role);

    if (!allowed) {
      return NextResponse.json(
        { error: reason || 'You do not have permission to delete this bill' },
        { status: 403 }
      );
    }

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: { pvcCalculation: true }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Delete InvoiceItem linked to this bill's BillTransaction (no cascade defined).
    // The line was removed without touching its invoice's totals, so every invoice
    // that had ever billed a since-deleted bill overstated what was owed. The parent
    // invoice is corrected by the same amount, in one transaction with the removal.
    const billTx = await prisma.billTransaction.findUnique({
      where: { billId: id },
      select: { id: true },
    });
    if (billTx) {
      const items = await prisma.invoiceItem.findMany({
        where: { billTransactionId: billTx.id },
        select: { id: true, invoiceId: true, totalPrice: true },
      });
      if (items.length > 0) {
        const removedByInvoice = new Map<string, number>();
        for (const item of items) {
          removedByInvoice.set(item.invoiceId, (removedByInvoice.get(item.invoiceId) || 0) + (item.totalPrice || 0));
        }
        await prisma.$transaction(async (tx) => {
          await tx.invoiceItem.deleteMany({ where: { billTransactionId: billTx.id } });
          for (const [invoiceId, removed] of removedByInvoice) {
            const invoice = await tx.invoice.findUnique({
              where: { id: invoiceId },
              select: { subtotal: true, taxAmount: true, paidAmount: true },
            });
            if (!invoice) continue;
            const subtotal = Math.max(0, (invoice.subtotal || 0) - removed);
            const totalAmount = subtotal + (invoice.taxAmount || 0);
            await tx.invoice.update({
              where: { id: invoiceId },
              data: {
                subtotal,
                totalAmount,
                outstandingAmount: Math.max(0, totalAmount - (invoice.paidAmount || 0)),
              },
            });
          }
        });
      }
    }

    // Delete the bill — cascades handle PvcCalculation, BillTransaction, BillClassificationEntry, etc.
    await prisma.bill.delete({
      where: { id }
    });

    // A deleted historical bill changes every later bill's cumulative PVC.
    await recalculateCumulativePvcForContract(bill.contractId);

    // Clear the deleted bill and every remaining bill PDF for this contract.
    // By TAG, not by a pattern over the key: cached reports are stored tagged
    // `bill:<id>`, while the key format has changed under these call sites before —
    // a build id was added between the prefix and the bill id, and every pattern
    // anchored to the old shape silently matched nothing, leaving deleted bills
    // servable and survivors showing their pre-deletion cumulative PVC. A tag cannot
    // drift out of step with the key.
    advancedCache.invalidateByTag(`bill:${id}`);
    const remainingBills = await prisma.bill.findMany({
      where: { contractId: bill.contractId },
      select: { id: true },
    });
    for (const remainingBill of remainingBills) {
      advancedCache.invalidateByTag(`bill:${remainingBill.id}`);
    }

    return NextResponse.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    return NextResponse.json(
      { error: 'Failed to delete bill' },
      { status: 500 }
    );
  }
}

// GET /api/bills/[id] - Get a single bill
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const access = await checkUserBillAccess(user.id, id);
    if (!access?.canView) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        contract: true,
        pvcCalculation: true,
        workClassification: true,
        classificationEntries: {
          include: {
            subClassification: true
          }
        },
        billTransaction: { select: { id: true, amount: true, discount: true, discountType: true, status: true, isFree: true, createdAt: true } }
      }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(bill);
  } catch (error) {
    console.error('Error fetching bill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT /api/bills/[id] - Update bill
// ============================================================================
// REWRITTEN FOR CLEAN STEEL TYPE HANDLING
// ============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('\n🔄 ===== NEW BILL API: PUT REQUEST STARTED =====');
  console.log(`   Bill ID: ${id}\n`);
  
  try {
    
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
      classificationEntries = [],
      nonScheduleItems = [],
      zone,
      fuelPriceType,
      pvcNumber,
      isFinalPvc = false
    } = body;
    
    // ===== STEP 1: Validate Required Fields =====
    if (!contractId || !billNo || !dateOfMeasurement) {
      return NextResponse.json({ error: 'Missing required fields: contractId, billNo, dateOfMeasurement' }, { status: 400 });
    }
    
    // ===== STEP 2: Authentication & Authorization =====
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ===== STEP 3: Check Bill Exists and User Can Edit =====
    const existingBill = await prisma.bill.findUnique({
      where: { id },
      include: { contract: true, pvcCalculation: true }
    });

    if (!existingBill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // 🔒 Security: contractId cannot be changed after creation — prevents moving bills between contracts
    if (contractId && contractId !== existingBill.contractId) {
      return NextResponse.json({ error: 'Contract cannot be changed after bill creation' }, { status: 400 });
    }

    const { allowed, reason } = await canUserEditBill(user.id, id, user.role);
    if (!allowed) {
      return NextResponse.json({ error: reason || 'You do not have permission to edit this bill' }, { status: 403 });
    }

    const normalizedBillNo = String(billNo).trim();
    const duplicateBill = await prisma.bill.findFirst({
      where: {
        contractId: existingBill.contractId,
        id: { not: id },
        billNo: { equals: normalizedBillNo, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicateBill) {
      return NextResponse.json(
        { error: `Bill number ${normalizedBillNo} already exists for this contract` },
        { status: 409 },
      );
    }
    
    // ===== STEP 4: Get Contract =====
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        agreementNo: true,
        baseMonth: true,
        isExtended: true,
        extensionType: true,
        originalCompletionDate: true,
        workDescription: true,
        // The clause decides how the quarter is counted — see the quarter block below.
        dateOfOpening: true,
        pre2022WorkType: true,
        pvcClauseVersion: true,
      }
    });
    
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const classificationPolicy = await resolveBillClassificationPolicy(
      contract.workDescription,
      classificationEntries,
      { cementAmount, steelTmtBarsAmount, steelAngleChannelAmount, steelPlatesAmount, steelOtherSectionsAmount },
    );
    // ===== STEP 5: Calculate Quarter =====
    const measurementDate = new Date(dateOfMeasurement);
    
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
        details: 'Bills can only be edited when all final price indices are published for the calculation period.',
        missingMonths: indicesCheck.missingMonths
      }, { status: 400 });
    }
    
    // Quarter derivation, exactly as creation does it. This route used the plain
    // GCC-2022 rule for everyone, so editing a bill on a pre-2022-clause contract
    // relabelled it one quarter off, and editing one on a 17B-extended contract lost
    // the original-completion-date anchor.
    let quarterDateForCalculation = measurementDate;
    if (contract.isExtended
        && contract.extensionType === '17B'
        && contract.originalCompletionDate
        && measurementDate > contract.originalCompletionDate) {
      quarterDateForCalculation = contract.originalCompletionDate;
    }
    const { resolvePre2022Setup } = await import('@/lib/pre2022-contract');
    const clauseSetup = resolvePre2022Setup(contract as any);
    let quarter: string;
    if (clauseSetup.isPre2022 && contract.dateOfOpening) {
      const { pre2022QuarterFromDate } = await import('@/lib/pvc-pre2022');
      quarter = pre2022QuarterFromDate(quarterDateForCalculation, new Date(contract.dateOfOpening));
    } else {
      quarter = getQuarterFromDate(quarterDateForCalculation, contract.baseMonth);
    }

    // GCC-2022 Cl.46A: W excludes railway-supplied material. Creation reduces the PVC
    // base by this factor; the edit path priced the full entry amounts, so one edit of
    // a bill with railway-supplied materials silently inflated its PVC. The stored
    // value is the fallback so an edit that does not resend the field keeps the
    // exclusion it was created with.
    const railwaySupplied = Math.max(0, Number(body.railwaySuppliedMaterialValue ?? existingBill.railwaySuppliedMaterialValue ?? 0) || 0);
    const extraItems = Math.max(0, Number(body.extraItemsOutsidePvc ?? 0) || 0);
    const outsidePvc = railwaySupplied + extraItems;
    const entriesTotalAmount = (classificationEntries || []).reduce(
      (sum: number, e: any) => sum + (parseFloat(e?.amount) || 0),
      0,
    );
    const pvcBaseFactor = outsidePvc > 0 && entriesTotalAmount > outsidePvc
      ? (entriesTotalAmount - outsidePvc) / entriesTotalAmount
      : 1;

    // ===== STEP 6: CRITICAL - Extract Steel Types from Classification Entries =====
    console.log('\n🔍 ===== EXTRACTING STEEL TYPES (UPDATE) =====');
    const extractedSteelTypes = await extractSteelTypesFromEntries(classificationEntries);
    console.log(`✅ Steel types to be updated in bill: [${extractedSteelTypes.join(', ') || 'None'}]`);
    console.log('🔍 ===== STEEL TYPES EXTRACTED =====\n');
    
    // ===== STEP 7/8: Assemble the bill update (written atomically in STEP 16) =====
    // This route used to delete every classification entry FIRST, then update the
    // bill, fetch indices, and re-create entries one by one — so a failure anywhere in
    // that stretch (an index lookup throwing, a timeout) left a live bill with no
    // entries and a calculation matching nothing. Creation was rewritten to write
    // everything in one transaction; the edit path now does the same: all the heavy
    // work happens below against plain data, and the writes go together at the end.
    const billUpdateData = {
        contractId: existingBill.contractId, // always use original contractId — immutable
        billNo: normalizedBillNo,
        editCount: { increment: 1 }, // track edit count for permission control
        grossBillAmount: parseFloat(grossBillAmount),
        billAmount: parseFloat(billAmount),
        cementAmount: classificationPolicy.cementAmount,
        steelTmtBarsAmount: classificationPolicy.steelTmtBarsAmount,
        steelAngleChannelAmount: classificationPolicy.steelAngleChannelAmount,
        steelPlatesAmount: classificationPolicy.steelPlatesAmount,
        steelOtherSectionsAmount: classificationPolicy.steelOtherSectionsAmount,
        steelTypes: extractedSteelTypes, // CRITICAL: Update steel types
        dateOfMeasurement: measurementDate,
        dateOfCompletion: dateOfCompletion ? new Date(dateOfCompletion) : null,
        quarter,
        zone: zone || null,
        fuelPriceType: fuelPriceType || 'four_city_avg',
        // Absent means untouched. `pvcNumber || null` wiped an issued PVC number
        // whenever a client did not echo the field back on edit.
        pvcNumber: pvcNumber === undefined ? undefined : (pvcNumber || null),
        isFinalPvc: isFinalPvc || false,
        nonScheduleItems: nonScheduleItems || [],
        // Keep the exclusion the PVC below was computed with.
        railwaySuppliedMaterialValue: railwaySupplied,
        lastEditedBy: user.id,
        lastEditedAt: new Date()
      };

    // ===== STEP 9: Get Quarterly Averages (moved up before creating entries) =====
    // Use zone-based steel city prices instead of default Chennai rates
    const steelIndexNames = getSteelIndexNamesForZone(zone);
    const fuelIndexName = getFuelIndexNameForBill(zone, fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    
    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, calculationMethod);
    
    // ===== STEP 10: Compute New Classification Entries with PVC Breakdown =====
    // Collected, not written — the writes happen together in STEP 16's transaction.
    const entryRowsToCreate: any[] = [];
    let totalClassificationLabour = 0;
    let totalClassificationPlant = 0;
    let totalClassificationFuel = 0;
    let totalClassificationMaterials = 0;
    let totalClassificationCement = 0;
    let totalClassificationSteel = 0;
    let totalClassificationExplosives = 0;
    let totalClassificationPvc = 0;
    
    if (classificationEntries && classificationEntries.length > 0) {
      console.log(`\n📋 Creating ${classificationEntries.length} classification entries with PVC breakdown...`);
      
      for (const entry of classificationEntries) {
        const hasValidAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined;
        
        if ((entry.subClassificationId || entry.classificationId) && hasValidAmount) {
          // Shared cache — the same row the PVC calculation reads below.
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

          // Calculate PVC for this specific entry — on the amount net of
          // railway-supplied material, exactly as creation does.
          const entryPvc = await calculateClassificationEntryPvc(
            {
              subClassificationId: entry.subClassificationId,
              classificationId: entry.classificationId,
              amount: parseFloat(entry.amount) * pvcBaseFactor,
              steelTypes: entrySteelTypes
            },
            quarterlyAverages,
            {
              hasDedicatedSteel,
              hasDedicatedCement
            }
          );

          entryRowsToCreate.push({
              billId: id,
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
              totalPvc: entryPvc.totalPvc
          });

          // Accumulate totals (same as creation route)
          totalClassificationLabour += entryPvc.labourPvc;
          totalClassificationPlant += entryPvc.plantMachineryPvc;
          totalClassificationFuel += entryPvc.fuelPowerPvc;
          totalClassificationMaterials += entryPvc.otherMaterialsPvc;
          totalClassificationCement += entryPvc.cementPvc;
          totalClassificationSteel += entryPvc.steelPvc;
          totalClassificationExplosives += entryPvc.explosivesPvc;
          totalClassificationPvc += entryPvc.totalPvc;
          
          if (hasSteelComponent && entrySteelTypes.length > 0) {
            console.log(`   ✅ Entry with steel PVC: ₹${entryPvc.steelPvc.toFixed(2)} → Steel types: [${entrySteelTypes.join(', ')}]`);
          }
          
          console.log(`   ✅ Entry created with PVC: ₹${entryPvc.totalPvc.toFixed(2)}`);
        }
      }
      
      console.log(`\n📊 Total Classification PVC: ₹${totalClassificationPvc.toFixed(2)}`);
    }
    
    // ===== STEP 11: Use Per-Entry PVC Calculations (Already Computed) =====
    console.log('\n💰 ===== USING PER-ENTRY PVC CALCULATIONS (UPDATE) =====');
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
    
    console.log('💰 ===== PER-ENTRY PVC CALCULATIONS COMPLETE (UPDATE) =====\n');
    
    // ===== STEP 13: Calculate Dedicated Cement and Steel PVC =====
    const dedicatedCementPvc = calculateDedicatedCementPvc(classificationPolicy.cementAmount, quarterlyAverages);
    
    const dedicatedSteelTmtBarsPvc = calculateDedicatedSteelPvc(classificationPolicy.steelTmtBarsAmount, quarterlyAverages, 'Steel TMT Bars');
    const dedicatedSteelAngleChannelPvc = calculateDedicatedSteelPvc(classificationPolicy.steelAngleChannelAmount, quarterlyAverages, 'Steel Angle/Channel');
    const dedicatedSteelPlatesPvc = calculateDedicatedSteelPvc(classificationPolicy.steelPlatesAmount, quarterlyAverages, 'Steel Plates');
    const dedicatedSteelOtherSectionsPvc = calculateDedicatedSteelPvc(classificationPolicy.steelOtherSectionsAmount, quarterlyAverages, 'Steel Other Sections');
    const totalDedicatedSteelPvc = dedicatedSteelTmtBarsPvc + dedicatedSteelAngleChannelPvc + dedicatedSteelPlatesPvc + dedicatedSteelOtherSectionsPvc;
    
    // ===== STEP 14: Calculate Total PVC =====
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
    
    console.log('\n📊 ===== FINAL PVC BREAKDOWN (UPDATE) =====');
    console.log(`   Labour: ₹${extensionCompliantResult.labourPvc.toFixed(2)}`);
    console.log(`   Cement: ₹${finalCementPvc.toFixed(2)} (classification: ₹${extensionCompliantResult.cementPvc.toFixed(2)} + dedicated: ₹${dedicatedCementPvc.toFixed(2)})`);
    console.log(`   Steel: ₹${finalSteelPvc.toFixed(2)} (classification: ₹${extensionCompliantResult.steelPvc.toFixed(2)} + dedicated: ₹${totalDedicatedSteelPvc.toFixed(2)})`);
    console.log(`   TOTAL PVC: ₹${totalPvc.toFixed(2)}`);
    console.log('📊 ===== PVC BREAKDOWN COMPLETE =====\n');
    
    // ===== STEP 15: Cumulative PVC will be recalculated after DB update =====
    // Placeholder values — will be corrected by recalculateCumulativePvcForContract
    const previousPvcTotal = 0;
    
    // ===== STEP 16: Write everything atomically =====
    // Old entries out, bill updated, new entries in, calculation updated — one
    // transaction of plain inserts and updates. All the heavy work (index lookups,
    // per-entry PVC) already happened above, so this opens and closes in milliseconds;
    // and a failure anywhere leaves the bill exactly as it was before the edit.
    const pvcCalculationData = {
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
    };

    await prisma.$transaction(async (tx) => {
      await tx.billClassificationEntry.deleteMany({ where: { billId: id } });
      await tx.bill.update({ where: { id }, data: billUpdateData });
      if (entryRowsToCreate.length > 0) {
        await tx.billClassificationEntry.createMany({ data: entryRowsToCreate });
      }
      if (existingBill.pvcCalculation) {
        await tx.pvcCalculation.update({
          where: { id: existingBill.pvcCalculation.id },
          data: pvcCalculationData,
        });
      } else {
        await tx.pvcCalculation.create({
          data: { contractId, billId: id, ...pvcCalculationData },
        });
      }
    }, { maxWait: 10_000, timeout: 20_000 });

    console.log(`✅ Bill updated atomically: ${id} (${entryRowsToCreate.length} entries)`);

    // ===== STEP 17: Recalculate Cumulative PVC for entire contract =====
    // This properly sorts bills by dateOfMeasurement and computes running totals
    await recalculateCumulativePvcForContract(contractId);
    
    // ===== STEP 18: Return Updated Bill =====
    const updatedBill = await prisma.bill.findUnique({
      where: { id },
      include: {
        contract: true,
        workClassification: true,
        pvcCalculation: true,
        classificationEntries: {
          include: {
            subClassification: true,
            classification: true
          }
        }
      }
    });
    
    console.log(`\n✅ ===== BILL UPDATED SUCCESSFULLY =====`);
    console.log(`   Bill ID: ${id}`);
    console.log(`   Bill No: ${billNo}`);
    console.log(`   Steel Types Updated: [${extractedSteelTypes.join(', ') || 'None'}]`);
    console.log(`   Total PVC: ₹${totalPvc.toFixed(2)}`);
    console.log(`✅ ===== NEW BILL API: UPDATE COMPLETE =====\n`);
    
    // Invalidate cached PDFs for this bill, by the tag they are stored under — the
    // key-shaped pattern this used never matched, so an edited bill kept handing out
    // its pre-edit report.
    advancedCache.invalidateByTag(`bill:${id}`);

    return NextResponse.json(updatedBill);
    
  } catch (error) {
    console.error('\n❌ ===== ERROR IN BILL UPDATE =====');
    console.error(error);
    console.error('❌ ===== ERROR DETAILS END =====\n');
    
    return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 });
  }
}
