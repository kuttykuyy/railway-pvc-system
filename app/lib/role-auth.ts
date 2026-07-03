

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Check if current user is admin
 */
export async function isUserAdmin(request?: Request): Promise<{
  isAdmin: boolean;
  user?: any;
  message?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return {
        isAdmin: false,
        message: 'Authentication required'
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return {
        isAdmin: false,
        message: 'User not found'
      };
    }

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    return {
      isAdmin,
      user,
      message: isAdmin ? 'Admin access granted' : 'Admin access required'
    };
  } catch (error) {
    console.error('Role check error:', error);
    return {
      isAdmin: false,
      message: 'Role verification failed'
    };
  }
}

/**
 * Check if current user is a railway official
 */
export async function isUserRailwayOfficial(request?: Request): Promise<{
  isRailwayOfficial: boolean;
  user?: any;
  message?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return {
        isRailwayOfficial: false,
        message: 'Authentication required'
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return {
        isRailwayOfficial: false,
        message: 'User not found'
      };
    }

    const isRailwayOfficial = user.role === 'railway_official' || user.role === 'admin' || user.role === 'superadmin';

    return {
      isRailwayOfficial,
      user,
      message: isRailwayOfficial ? 'Railway official access granted' : 'Railway official access required'
    };
  } catch (error) {
    console.error('Role check error:', error);
    return {
      isRailwayOfficial: false,
      message: 'Role verification failed'
    };
  }
}

/**
 * Check if current user is a contractor
 */
export async function isUserContractor(request?: Request): Promise<{
  isContractor: boolean;
  user?: any;
  message?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return {
        isContractor: false,
        message: 'Authentication required'
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return {
        isContractor: false,
        message: 'User not found'
      };
    }

    const isContractor = user.role === 'contractor' || user.role === 'admin' || user.role === 'superadmin';

    return {
      isContractor,
      user,
      message: isContractor ? 'Contractor access granted' : 'Contractor access required'
    };
  } catch (error) {
    console.error('Role check error:', error);
    return {
      isContractor: false,
      message: 'Role verification failed'
    };
  }
}

/**
 * Validate admin API access
 */
export async function validateAdminAccess(request: Request): Promise<{
  authorized: boolean;
  user?: any;
  message?: string;
}> {
  const { isAdmin, user, message } = await isUserAdmin(request);
  
  return {
    authorized: isAdmin,
    user,
    message
  };
}

/**
 * Client-side role check hook data
 */
export function getClientRoleInfo(session: any) {
  return {
    isAdmin: session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    isRailwayOfficial: session?.user?.role === 'railway_official' || session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    isContractor: session?.user?.role === 'contractor' || session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    role: session?.user?.role || 'contractor',
    email: session?.user?.email,
    designation: session?.user?.designation,
    department: session?.user?.department
  };
}
