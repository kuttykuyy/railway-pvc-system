'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

/**
 * Tells the server which page a signed-in person opened, once per navigation.
 *
 * This is what lets the signup funnel say "verified their email, opened Create Bill,
 * never came back" instead of a blank. Fire-and-forget: it never blocks a page and a
 * failure is silent. Anonymous visitors send nothing.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const { status } = useSession();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !pathname) return;
    if (pathname.startsWith('/admin') || pathname.startsWith('/api')) return;
    if (last.current === pathname) return;
    last.current = pathname;
    try {
      void fetch('/api/track/page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* never let tracking touch the page */ }
  }, [pathname, status]);

  return null;
}
