
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';

const SESSION_DURATION = 60 * 60 * 1000; // 60 minutes (1 hour)
const CHECK_INTERVAL = 30000; // Check every 30 seconds
const STORAGE_KEY = 'irpvc_last_activity';

export function SessionTimeoutWarning() {
  const { data: session, status } = useSession();
  const logoutTriggered = useRef(false);

  // Get last activity from localStorage (persists across navigations/tabs)
  const getLastActivity = useCallback((): number => {
    if (typeof window === 'undefined') return Date.now();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {}
    return Date.now();
  }, []);

  // Update last activity timestamp in localStorage
  const updateActivity = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch {}
  }, []);

  // Set initial activity on mount
  useEffect(() => {
    if (status === 'authenticated') {
      updateActivity();
    }
  }, [status, updateActivity]);

  // Track user activity - broad set of events
  useEffect(() => {
    if (status !== 'authenticated') return;

    const events = [
      'mousedown', 'mousemove', 'click',
      'keydown', 'keypress', 'keyup',
      'scroll', 'touchstart', 'touchmove',
      'input', 'change', 'focus', 'visibilitychange'
    ];

    // Throttle activity updates to max once per 10 seconds
    let lastUpdate = 0;
    const throttledUpdate = () => {
      const now = Date.now();
      if (now - lastUpdate > 10000) {
        lastUpdate = now;
        updateActivity();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, throttledUpdate, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledUpdate);
      });
    };
  }, [status, updateActivity]);

  // Check session timeout
  useEffect(() => {
    if (status !== 'authenticated') return;

    const checkTimeout = () => {
      if (logoutTriggered.current) return;

      const lastActivity = getLastActivity();
      const now = Date.now();
      const timeSinceActivity = now - lastActivity;

      // Only logout if truly inactive for the full duration
      if (timeSinceActivity >= SESSION_DURATION) {
        logoutTriggered.current = true;
        handleLogout();
      }
    };

    const interval = setInterval(checkTimeout, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [status, getLastActivity]);

  const handleLogout = async () => {
    try {
      // Clear stored activity
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      
      await signOut({ 
        callbackUrl: '/auth/signin?timeout=true',
        redirect: true 
      });
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/auth/signin?timeout=true';
    }
  };

  // No UI needed - automatic logout only
  return null;
}
