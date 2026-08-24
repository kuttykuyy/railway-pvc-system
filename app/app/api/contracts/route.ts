
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { getBaseMonth } from '@/lib/pvc-calculations';
import { getUserAccessibleContracts } from '@/lib/permissions';
import { checkPvcEligibility, generateEligibilityNote } from '@/lib/gcc-compliance';
import { normalizeSchedules } from '@/lib/contract-schedules';

/** Rebate % must be a finite number in 0–100, else store null. */
function sanitizeRebate(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
import { normalizeAgreementNo } from '@/lib/railway-division-helper';

// Helper function to ensure base month values are available
async function ensureBaseMonthValues(baseMonth: Date) {
  try {
    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany();
    
    // Normalize base month to first day of month
    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    
    const monthEnd = new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1);

    // One read for every index, then one write for every gap. This was a findFirst per
    // index and a create per missing one, run one after another — around fifteen
    // sequential round-trips on the path that creates a contract, to answer a question
    // a single query covers.
    const existing = await prisma.monthlyIndexValue.findMany({
      where: {
        priceIndexId: { in: allIndices.map(i => i.id) },
        month: { gte: normalizedBaseMonth, lt: monthEnd },
      },
      select: { priceIndexId: true },
    });
    const haveValue = new Set(existing.map(v => v.priceIndexId));

    const missing = allIndices.filter(index => !haveValue.has(index.id));
    if (missing.length > 0) {
      await prisma.monthlyIndexValue.createMany({
        data: missing.map(index => ({
          priceIndexId: index.id,
          month: normalizedBaseMonth,
          value: index.baseValue,
          source: `Auto-populated base month value for ${index.name}`,
        })),
        // The unique index on (priceIndexId, month) is the real guard: two contracts
        // created for the same base month at once would otherwise collide here.
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error('Error ensuring base month values:', error);
    // Don't throw error - this is a best-effort operation
  }
}

export const dynamic = "force-dynamic";

/** Ceiling on the unpaginated contract list. Far above any real account (53 today). */
const CONTRACT_LIST_CAP = 2000;

// GET /api/contracts - Get all contracts (admin) or user's own contracts (user)
export async function GET(request: NextRequest) {
  try {
    // Validate API access
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // null = admin (unrestricted) — skip ID filter to avoid loading all IDs into memory
    const accessibleContractIds = await getUserAccessibleContracts(user.id);
    const isUnrestricted = accessibleContractIds === null;

    if (!isUnrestricted && accessibleContractIds.length === 0) {
      return NextResponse.json([]);
    }

    const contractsWhere = isUnrestricted ? {} : { id: { in: accessibleContractIds } };

    // Seven of the nine screens that read this list are contract pickers — they need
    // every contract to fill a dropdown, which is why this is deliberately not
    // paginated, but they never look at the bill and calculation counts. Those counts
    // are two aggregates over the two largest tables in the app, paid on every one of
    // those loads. `?lean=1` leaves them out; the default response is unchanged, so a
    // caller that does not ask still gets exactly what it got before.
    const lean = request.nextUrl.searchParams.get('lean') === '1';

    // Not paginated, deliberately (see above) — but not unbounded either. Seven of the
    // nine callers are dropdowns that need every contract, and all of them search in the
    // browser over the whole list, so paging this would break the search it feeds. What
    // it must not do is grow without limit: an account with tens of thousands of
    // contracts would serve tens of thousands of rows into a select box.
    //
    // So: a ceiling far above any real account today (53 is the largest), newest first,
    // and the truth in the headers when it bites — never a quietly shortened list.
    const [total, contracts] = await Promise.all([
      prisma.contract.count({ where: contractsWhere }),
      prisma.contract.findMany({
        where: contractsWhere,
        orderBy: { createdAt: 'desc' },
        take: CONTRACT_LIST_CAP,
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          },
          ...(lean ? {} : {
            _count: {
              select: {
                bills: true,
                pvcCalculations: true
              }
            }
          }),
        }
      }),
    ]);

    if (total > CONTRACT_LIST_CAP) {
      console.warn(`[contracts] list capped: returned ${CONTRACT_LIST_CAP} of ${total}`);
    }
    return NextResponse.json(contracts, {
      headers: {
        'X-Total-Count': String(total),
        'X-Returned-Count': String(contracts.length),
        'X-Truncated': total > CONTRACT_LIST_CAP ? '1' : '0',
      },
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// POST /api/contracts - Create new contract
export async function POST(request: NextRequest) {
  let agreementNoForError = 'unknown';
  
  try {
    // Validate API access
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Railway Official contract quota
    if (user!.role === 'railway_official') {
      const { checkRailwayOfficialContractQuota } = await import('@/lib/admin-settings');
      const quota = await checkRailwayOfficialContractQuota(user!.id);
      if (!quota.allowed) {
        return NextResponse.json({
          error: 'Contract limit reached',
          reason: `Railway Official accounts are limited to ${quota.limit} contracts. You have ${quota.used}/${quota.limit}. Please contact your administrator to increase the limit.`,
          quotaExceeded: true,
          quota,
        }, { status: 429 });
      }
    }

    const body = await request.json();
    const {
      agreementNo: agreementNoInput,
      loaNo,
      loaDate,
      contractorName,
      contractorPhone,
      createdVia,
      workDescription, 
      dateOfOpening,
      tenderAdvertisedValue,
      contractValue,
      completionPeriodMonths,
      hasRailwaySuppliedMaterials,
      railwaySuppliedMaterialsNote,
      coveringLetterDesignation,
      schedules,
      rebatePercentage
    } = body;

    // Set up from an LOA, before an agreement exists: the LOA number stands in as the
    // contract's identifier. agreementNo is unique and every lookup and PVC number is
    // built from it, so it cannot be empty — but it need not be an agreement number
    // yet. Contract.loaNo keeps the LOA number too, so the two staying equal is what
    // marks the agreement number as still awaited.
    const agreementNo = agreementNoInput && String(agreementNoInput).trim()
      ? agreementNoInput
      : (loaNo && String(loaNo).trim() ? String(loaNo).trim() : agreementNoInput);

    // Store for error handling
    agreementNoForError = agreementNo;

    // Validate required fields

    if (!agreementNo || !contractorName || !workDescription || !dateOfOpening) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Normalize agreement number: uppercase, strip spaces/junk from segments
    const normalizedAgreementNo = normalizeAgreementNo(agreementNo);
    if (!normalizedAgreementNo) {
      return NextResponse.json(
        { error: 'Invalid Agreement Number format' },
        { status: 400 }
      );
    }
    agreementNoForError = normalizedAgreementNo;

    // Check for duplicate using normalized form (catches extra-letter abuse)
    const existingContract = await prisma.contract.findFirst({
      where: {
        OR: [
          { agreementNo: { equals: normalizedAgreementNo, mode: 'insensitive' } },
          { agreementNo: { equals: agreementNo.trim(), mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        agreementNo: true,
        contractorName: true,
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (existingContract) {
      return NextResponse.json(
        {
          error: 'Contract with this Agreement Number already exists',
          // No name: naming the other account told any signed-in user who holds any
          // agreement number they cared to probe.
          details: `A contract with Agreement Number "${normalizedAgreementNo}" already exists in the system. If this is your agreement, it may have been registered under another of your accounts — contact support.`
        },
        { status: 409 }
      );
    }

    // Validate date
    const openingDate = new Date(dateOfOpening);
    if (isNaN(openingDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date of opening provided' },
        { status: 400 }
      );
    }

    const baseMonth = getBaseMonth(openingDate);
    
    // Check PVC eligibility per GCC 46A.1 - use tender advertised value if available, otherwise contract value
    const pvcEligibilityResult = checkPvcEligibility(
      tenderAdvertisedValue || contractValue || null,
      completionPeriodMonths || null
    );
    
    const pvcEligibilityNote = generateEligibilityNote(
      tenderAdvertisedValue || contractValue || null,
      completionPeriodMonths || null
    );
    
    // Ensure base month index values are available for this contract
    await ensureBaseMonthValues(baseMonth);
    
    // Parse LOA date if provided
    const loaDateParsed = loaDate ? new Date(loaDate) : null;
    if (loaDate && loaDateParsed && isNaN(loaDateParsed.getTime())) {
      return NextResponse.json(
        { error: 'Invalid LOA date provided' },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.create({
      data: {
        agreementNo: normalizedAgreementNo,
        // 'pdf' when the agreement extractor filled the form, 'manual' when typed.
        createdVia: createdVia === 'pdf' ? 'pdf' : 'manual',
        loaNo,
        loaDate: loaDateParsed,
        contractorName,
        contractorPhone: contractorPhone || null,
        workDescription,
        dateOfOpening: openingDate,
        baseMonth,
        tenderAdvertisedValue: tenderAdvertisedValue || null,
        contractValue: contractValue || null,
        completionPeriodMonths: completionPeriodMonths || null,
        pvcApplicable: pvcEligibilityResult.isEligible,
        pvcEligibilityNote,
        hasRailwaySuppliedMaterials: hasRailwaySuppliedMaterials || false,
        railwaySuppliedMaterialsNote: railwaySuppliedMaterialsNote || null,
        coveringLetterDesignation: coveringLetterDesignation || null,
        // Schedules carry per-schedule escalation/bid rate. normalizeSchedules accepts
        // both the legacy string[] and the object form.
        schedules: normalizeSchedules(schedules),
        // Rebate is agreed once for the whole agreement. Clamp to a sane 0–100 so a
        // bad/huge/negative value can't corrupt the cement-rate math downstream.
        rebatePercentage: sanitizeRebate(rebatePercentage),
        userId: user.id
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            bills: true,
            pvcCalculations: true
          }
        }
      }
    });

    // Attach the LOA this contract was read from, if one was kept. The upload happened
    // before the contract existed, so the document has been unlinked until now.
    if (body.uploadedDocumentId) {
      const { linkUploadedDocument } = await import('@/lib/uploaded-documents');
      await linkUploadedDocument(body.uploadedDocumentId, { contractId: contract.id, userId: user.id });
    }

    return NextResponse.json(contract);
  } catch (error: any) {
    console.error('Error creating contract:', error);
    
    // Handle unique constraint violation for agreementNo
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('agreementNo') ? 'Agreement Number' : 'field';
      return NextResponse.json(
        { 
          error: `Contract with this ${field} already exists`,
          details: `A contract with Agreement Number "${agreementNoForError}" is already in the system. Please use a different Agreement Number.`
        },
        { status: 409 } // Conflict status code for duplicate resource
      );
    }
    
    // Handle validation errors
    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Foreign key constraint failed. Please check your data.' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create contract',
        details: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred'
      },
      { status: 500 }
    );
  }
}
