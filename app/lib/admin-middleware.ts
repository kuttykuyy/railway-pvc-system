
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Validate admin access for API routes
 */
export async function validateAdminAccess(request: NextRequest): Promise<{
  authorized: boolean;
  user?: any;
  message?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return {
        authorized: false,
        message: 'Authentication required'
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    if (!user) {
      return {
        authorized: false,
        message: 'User not found'
      };
    }

    if (user.role !== 'admin') {
      return {
        authorized: false,
        message: 'Admin access required. This feature is restricted to administrators only.'
      };
    }

    return {
      authorized: true,
      user
    };
  } catch (error) {
    console.error('Admin validation error:', error);
    return {
      authorized: false,
      message: 'Authorization validation failed'
    };
  }
}

/**
 * Check if current user is admin (for use in components)
 */
export async function isUserAdmin(email: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { role: true }
    });
    
    return user?.role === 'admin';
  } catch (error) {
    console.error('Admin check error:', error);
    return false;
  }
}

/**
 * Admin-only route wrapper
 */
export function withAdminAuth(handler: (req: NextRequest, user: any) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const { authorized, user, message } = await validateAdminAccess(req);
    
    if (!authorized) {
      return NextResponse.json(
        { 
          error: message || 'Admin access required',
          code: 'ADMIN_ACCESS_REQUIRED'
        },
        { status: 403 }
      );
    }

    return handler(req, user);
  };
}
