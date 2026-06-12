
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

// PATCH /api/admin/users/[userId] - Update user role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  try {
    // Check admin access
    const { authorized, user: adminUser, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    
    const body = await request.json();
    const { role: roleUpperCase } = body;

    // Validate role (accept uppercase)
    const validRoles = ['CONTRACTOR', 'PENDING_RAILWAY_OFFICIAL', 'RAILWAY_OFFICIAL', 'ADMIN'];
    if (!roleUpperCase || !validRoles.includes(roleUpperCase)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Convert to lowercase for database storage
    const role = roleUpperCase.toLowerCase();

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent changing role of the primary admin
    if (targetUser.email === '30prasath93@gmail.com') {
      return NextResponse.json(
        { error: 'Cannot change role of primary admin user' },
        { status: 400 }
      );
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      }
    });

    return NextResponse.json({
      message: 'User role updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[userId] - Delete user and all related data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  try {
    // Check admin access
    const { authorized, user: adminUser, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            billTransactions: true,
            contracts: true,
            creditTransactions: true
          }
        }
      }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent deleting admin users
    if (targetUser.role === 'admin' || targetUser.email === '30prasath93@gmail.com') {
      return NextResponse.json(
        { error: 'Cannot delete admin users' },
        { status: 400 }
      );
    }

    // Delete user and all related data in a transaction
    await prisma.$transaction(async (prisma: any) => {
      // Delete in proper order to respect foreign key constraints
      
      // 1. Delete sessions (NextAuth)
      await prisma.session.deleteMany({
        where: { userId: userId }
      });

      // 2. Delete accounts (NextAuth OAuth)
      await prisma.account.deleteMany({
        where: { userId: userId }
      });

      // 3. Delete verification tokens (by email identifier)
      await prisma.verificationToken.deleteMany({
        where: { identifier: targetUser.email }
      });

      // 4. Delete WhatsApp logs
      await prisma.whatsAppLog.deleteMany({
        where: { userId: userId }
      });

      // 5. Delete WhatsApp conversations
      await prisma.whatsAppConversation.deleteMany({
        where: { userId: userId }
      });

      // 6. Delete bill approval history
      await prisma.billApprovalHistory.deleteMany({
        where: { userId: userId }
      });

      // 7. Delete credit transactions
      await prisma.creditTransaction.deleteMany({
        where: { userId: userId }
      });

      // 8. Delete bill transactions
      await prisma.billTransaction.deleteMany({
        where: { userId: userId }
      });

      // 9. Delete Razorpay transactions
      await prisma.razorpayTransaction.deleteMany({
        where: { userId: userId }
      });

      // 10. Delete GST invoices
      await prisma.gstInvoice.deleteMany({
        where: { userId: userId }
      });

      // 11. Delete labour index documents
      await prisma.labourIndexDocument.deleteMany({
        where: { uploadedBy: userId }
      });

      // 12. Delete report templates
      await prisma.reportTemplate.deleteMany({
        where: { userId: userId }
      });

      // 13. Delete user bill access permissions
      await prisma.userBillAccess.deleteMany({
        where: { userId: userId }
      });

      // 14. Delete user contract access permissions
      await prisma.userContractAccess.deleteMany({
        where: { userId: userId }
      });

      // 15. Delete user page access permissions
      await prisma.userPageAccess.deleteMany({
        where: { userId: userId }
      });

      // 16. Delete PVC comparison sessions
      await prisma.pvcComparisonSession.deleteMany({
        where: { userId: userId }
      });

      // 17. Delete PVC comparison daily usage
      await prisma.pvcComparisonDailyUsage.deleteMany({
        where: { userId: userId }
      });

      // 18. Delete PVC calculations for user's bills
      await prisma.pvcCalculation.deleteMany({
        where: {
          bill: {
            contract: {
              userId: userId
            }
          }
        }
      });

      // 19. Unlink bills approved by this user (don't delete, just remove reference)
      await prisma.bill.updateMany({
        where: { approvedBy: userId },
        data: { approvedBy: null, approvedAt: null }
      });

      // 20. Delete bills for user's contracts
      await prisma.bill.deleteMany({
        where: {
          contract: {
            userId: userId
          }
        }
      });

      // 21. Delete user's contracts
      await prisma.contract.deleteMany({
        where: { userId: userId }
      });

      // 22. Delete customer account
      await prisma.customerAccount.deleteMany({
        where: { userId: userId }
      });

      // 23. Delete invoices
      await prisma.invoice.deleteMany({
        where: { userId: userId }
      });

      // 24. Delete usage reports
      await prisma.usageReport.deleteMany({
        where: { userId: userId }
      });

      // 25. Finally delete the user
      await prisma.user.delete({
        where: { id: userId }
      });
    });

    return NextResponse.json({
      message: 'User and all related data deleted successfully',
      deletedUser: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name
      },
      deletedRecords: targetUser._count
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
