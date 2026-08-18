'use client';

import { signOut } from 'next-auth/react';

/**
 * Sign out and land back on the site the person was actually using.
 *
 * next-auth resolves a relative callbackUrl against NEXTAUTH_URL, and here that names the
 * platform host rather than the address customers know — so `signOut({ callbackUrl:
 * '/auth/signin' })` sent everyone from irpvc.in to a different domain to sign in again.
 * The same mismatch is already routed around in verify-email, forgot-password and the
 * Telegram links, but the sign-out redirect is built inside next-auth's own redirect
 * callback, where the request host is not available, so it cannot be fixed the same way.
 *
 * Letting next-auth clear the session and doing the navigation ourselves keeps the person
 * on whichever host they arrived on — apex or www — and stays correct if NEXTAUTH_URL is
 * later pointed at the public domain.
 */
export async function signOutToCurrentSite(path: string = '/auth/signin'): Promise<void> {
  try {
    await signOut({ redirect: false });
  } catch (error) {
    // Leaving them on a signed-in-looking page is worse than a redirect with a stale
    // cookie, so the navigation below happens either way.
    console.error('Sign out error:', error);
  }
  window.location.href = path;
}
