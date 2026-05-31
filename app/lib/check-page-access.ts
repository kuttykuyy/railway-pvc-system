import { prisma } from './db';


import { isAdminOnlyPage } from './page-permissions';



/**
 * Check if a user has access to a specific page
 * @param userId User ID
 * @param pagePath Page path (e.g., '/dashboard', '/contracts')
 * @param userRole User role ('admin' or 'user')
 * @returns boolean indicating if user has access
 */
export async function checkPageAccess(
  userId: string,
  pagePath: string,
  userRole: string
): Promise<boolean> {
  // Admins have access to all pages by default
  if (userRole === 'admin') {
    return true;
  }

  // Check if page is admin-only
  if (isAdminOnlyPage(pagePath)) {
    return false;
  }

  // Check user's specific page permissions
  const pageAccess = await prisma.userPageAccess.findUnique({
    where: {
      userId_pagePath: {
        userId,
        pagePath
      }
    }
  });

  // If no specific permission is set, allow access by default (for backward compatibility)
  // To deny access by default, change this to: return pageAccess?.canAccess ?? false;
  if (!pageAccess) {
    return true;
  }

  // Check if permission is active and not expired
  if (!pageAccess.isActive) {
    return false;
  }

  if (pageAccess.expiresAt && pageAccess.expiresAt < new Date()) {
    return false;
  }

  return pageAccess.canAccess;
}

/**
 * Get all accessible pages for a user
 * @param userId User ID
 * @param userRole User role ('admin' or 'user')
 * @returns Array of page paths the user can access
 */
export async function getUserAccessiblePages(
  userId: string,
  userRole: string
): Promise<string[]> {
  // Admins have access to all pages
  if (userRole === 'admin') {
    return ['*']; // Wildcard indicates all pages
  }

  const pageAccesses = await prisma.userPageAccess.findMany({
    where: {
      userId,
      isActive: true,
      canAccess: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: new Date() } }
      ]
    },
    select: {
      pagePath: true
    }
  });

  return pageAccesses.map(access => access.pagePath);
}

/**
 * Client-side utility to check page access from session
 * @param session NextAuth session object
 * @param pagePath Page path to check
 * @returns boolean indicating if user has access (based on role only for client-side)
 */
export function checkClientPageAccess(
  session: any,
  pagePath: string
): boolean {
  if (!session?.user) {
    return false;
  }

  // Admins have access to all pages
  if (session.user.role === 'admin') {
    return true;
  }

  // Check if page is admin-only
  if (isAdminOnlyPage(pagePath)) {
    return false;
  }

  // For client-side, we can't check database permissions
  // This is a basic check - server-side should do the real validation
  return true;
}
