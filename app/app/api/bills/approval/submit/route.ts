import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseAgreementNumber } from '@/lib/railway-division-helper';

/**
 * POST /api/bills/approval/submit
 * Submit a bill for approval by railway officials
 */
export async function POST(req: NextRequest) {
  try {
    logger.log('=== Bill Approval Submission API Called ===');
    
    const session = await getServerSession(authOptions);
    logger.log('Session user:', session?.user?.email);
    
    if (!session?.user?.email) {
      console.error('No session found');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    logger.log('User found:', { id: user?.id, role: user?.role, email: user?.email });

    if (!user) {
      console.error('User not found in database');
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only contractors can submit bills
    if (user.role !== 'contractor' && user.role !== 'admin') {
      console.error('User does not have permission. Role:', user.role);
      return NextResponse.json(
        { error: 'Only contractors can submit bills for approval' },
        { status: 403 }
      );
    }

    const { billId, assignedToUserId } = await req.json();
    logger.log('Request data:', { billId, assignedToUserId });

    if (!billId) {
      console.error('No bill ID provided');
      return NextResponse.json(
        { error: 'Bill ID is required' },
        { status: 400 }
      );
    }

    // Get the bill
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: true
      }
    });

    logger.log('Bill found:', bill ? { 
      id: bill.id, 
      status: bill.status, 
      contractId: bill.contractId,
      agreementNo: bill.contract.agreementNo 
    } : 'null');

    if (!bill) {
      console.error('Bill not found in database');
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Verify the bill belongs to a contract owned by this user
    if (bill.contract.userId !== user.id && user.role !== 'admin') {
      console.error('User does not own this contract', {
        contractUserId: bill.contract.userId,
        currentUserId: user.id
      });
      return NextResponse.json(
        { error: 'You do not have permission to submit this bill' },
        { status: 403 }
      );
    }

    // Only draft or revision_requested bills can be submitted
    if (bill.status !== 'draft' && bill.status !== 'revision_requested') {
      console.error('Invalid bill status for submission:', bill.status);
      return NextResponse.json(
        { error: `Cannot submit bill with status: ${bill.status}` },
        { status: 400 }
      );
    }

    // Parse agreement number to determine zone and division
    const parsed = parseAgreementNumber(bill.contract.agreementNo);
    logger.log('Parsed agreement number:', parsed);
    
    let finalAssignedTo = assignedToUserId;

    if (parsed && !assignedToUserId) {
      logger.log('Looking for railway officials with:', {
        zone: parsed.zone,
        division: parsed.division
      });

      const officialFields = { id: true, name: true, designation: true } as const;

      // Best match: the official posted to this very division.
      let matchingOfficials = await prisma.user.findMany({
        where: {
          role: 'railway_official',
          railwayZone: parsed.zone,
          division: parsed.division,
          isCurrentPosting: true,
        },
        select: officialFields,
      });

      // Nothing sets `division` — not signup, not the admin screen — so the match above
      // finds nobody in practice and the submission used to be refused outright, which
      // is what "submit for approval does nothing" looked like. Fall back to the zone,
      // which is what actually governs who may approve.
      if (matchingOfficials.length === 0) {
        matchingOfficials = await prisma.user.findMany({
          where: { role: 'railway_official', railwayZone: parsed.zone, isCurrentPosting: true },
          select: officialFields,
        });
        logger.log(`Division match empty; ${matchingOfficials.length} official(s) in zone ${parsed.zone}`);
      }

      if (matchingOfficials.length === 1) {
        finalAssignedTo = matchingOfficials[0].id;
        logger.log('Auto-assigning to:', matchingOfficials[0]);
      } else if (matchingOfficials.length > 1) {
        logger.log('Multiple officials found, requiring selection');
        return NextResponse.json(
          {
            error: 'Multiple officials found. Please select an official.',
            requiresSelection: true,
            officials: matchingOfficials
          },
          { status: 400 }
        );
      } else {
        // Still nobody. Submit it anyway, unassigned: the approvals queue shows every
        // submitted bill to every official, and approving does not require being the
        // assignee. Blocking here left a finished bill with nowhere to go.
        logger.log(`No railway official registered for ${parsed.zone}; submitting unassigned.`);
      }
    }

    logger.log('Updating bill status to submitted. Final assigned to:', finalAssignedTo);

    // Update bill status to submitted with optional assignment
    const updatedBill = await prisma.bill.update({
      where: { id: billId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        approvedBy: finalAssignedTo || null,
      }
    });

    logger.log('Bill updated successfully');

    // Create approval history entry
    await prisma.billApprovalHistory.create({
      data: {
        billId,
        userId: user.id,
        action: 'submitted',
        previousStatus: bill.status,
        newStatus: 'submitted',
        comments: finalAssignedTo
          ? `Bill submitted and assigned for approval`
          : 'Bill submitted for approval (no official assigned — any official of the zone can approve it)'
      }
    });

    logger.log('Approval history created');

    // TODO: Send email notification to assigned railway official or all matching officials
    // This can be implemented later with email service

    return NextResponse.json({
      success: true,
      message: 'Bill submitted for approval successfully',
      bill: updatedBill,
      assignedTo: finalAssignedTo,
    });

  } catch (error: any) {
    console.error('Submit bill error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to submit bill for approval' },
      { status: 500 }
    );
  }
}

