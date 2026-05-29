
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/bills/approval/bulk-submit
 * Submit multiple bills for approval by railway officials
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only contractors can submit bills
    if (user.role !== 'contractor' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only contractors can submit bills for approval' },
        { status: 403 }
      );
    }

    const { billIds } = await req.json();

    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return NextResponse.json(
        { error: 'Bill IDs array is required' },
        { status: 400 }
      );
    }

    // Get all bills
    const bills = await prisma.bill.findMany({
      where: {
        id: { in: billIds }
      },
      include: {
        contract: true
      }
    });

    if (bills.length === 0) {
      return NextResponse.json(
        { error: 'No bills found with the provided IDs' },
        { status: 404 }
      );
    }

    // Check permissions and eligibility for each bill
    const errors: string[] = [];
    const successBillIds: string[] = [];

    for (const bill of bills) {
      // Verify the bill belongs to a contract owned by this user
      if (bill.contract.userId !== user.id && user.role !== 'admin') {
        errors.push(`${bill.billNo}: You do not have permission to submit this bill`);
        continue;
      }

      // Only draft or revision_requested bills can be submitted
      if (bill.status !== 'draft' && bill.status !== 'revision_requested') {
        errors.push(`${bill.billNo}: Cannot submit bill with status '${bill.status}'`);
        continue;
      }

      successBillIds.push(bill.id);
    }

    // Update eligible bills
    if (successBillIds.length > 0) {
      await prisma.$transaction(async (tx: any) => {
        // Update all bills to submitted status
        await tx.bill.updateMany({
          where: {
            id: { in: successBillIds }
          },
          data: {
            status: 'submitted',
            submittedAt: new Date()
          }
        });

        // Create approval history entries for each bill
        const historyEntries = successBillIds.map(billId => {
          const bill = bills.find(b => b.id === billId);
          return {
            billId,
            userId: user.id,
            action: 'submitted',
            previousStatus: bill?.status || 'draft',
            newStatus: 'submitted',
            comments: 'Bill submitted for approval (bulk submission)'
          };
        });

        await tx.billApprovalHistory.createMany({
          data: historyEntries
        });
      });
    }

    // Return response with summary
    return NextResponse.json({
      success: true,
      message: `Successfully submitted ${successBillIds.length} bill(s) for approval`,
      submitted: successBillIds.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      submittedBillIds: successBillIds
    });

  } catch (error) {
    console.error('Bulk submit bills error:', error);
    return NextResponse.json(
      { error: 'Failed to submit bills for approval' },
      { status: 500 }
    );
  }
}
