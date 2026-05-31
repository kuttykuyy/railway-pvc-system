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
      
      // Find matching railway officials
      const matchingOfficials = await prisma.user.findMany({
        where: {
          role: 'railway_official',
          railwayZone: parsed.zone,
          division: parsed.division,
          isCurrentPosting: true,
        },
        select: {
          id: true,
          name: true,
          designation: true,
        },
      });

      logger.log(`Found ${matchingOfficials.length} matching officials:`, matchingOfficials);

      // Auto-assign if only one official matches
      if (matchingOfficials.length === 1) {
        finalAssignedTo = matchingOfficials[0].id;
        logger.log('Auto-assigning to:', matchingOfficials[0]);
      } else if (matchingOfficials.length === 0) {
        console.error('No railway officials found for the zone/division');
        return NextResponse.json(
          { error: `No railway officials found for ${parsed.zoneName} - ${parsed.divisionName}. Please contact system administrator.` },
          { status: 400 }
        );
      } else {
        logger.log('Multiple officials found, requiring selection');
        return NextResponse.json(
          { 
            error: 'Multiple officials found. Please select an official.',
            requiresSelection: true,
            officials: matchingOfficials 
          },
          { status: 400 }
        );
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
          : 'Bill submitted for approval'
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

