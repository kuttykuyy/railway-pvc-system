'use client';

/**
 * The Cloudflare Turnstile checkbox, for forms that must not be filled by a script.
 *
 * Renders nothing at all when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, which matches
 * the server's fail-open behaviour: until the keys are added in Vercel, signup works
 * exactly as it did before rather than showing a check that can never be completed.
 */

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileWidgetProps {
  /** Given the token to send with the form, or '' when it expires or fails. */
  onToken: (token: string) => void;
  /** Bumping this resets the widget — a token is single-use, so a rejected submit needs a fresh one. */
  resetSignal?: number;
}

export function TurnstileWidget({ onToken, resetSignal = 0 }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the callback in a ref so re-renders of the parent never re-run the render
  // effect below: doing so would tear down the widget mid-challenge.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [failed, setFailed] = useState(false);

  // Rendering nothing is right when Turnstile is deliberately off, and indistinguishable
  // from a misconfiguration when it is not. NEXT_PUBLIC_ values are inlined at BUILD
  // time, so the usual cause is a variable that exists in Vercel but was not ticked for
  // Production, or was named without the NEXT_PUBLIC_ prefix — neither of which shows up
  // anywhere. Say so in the console rather than leaving a blank space to interpret.
  useEffect(() => {
    if (!siteKey) {
      console.warn(
        '[turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY was empty when this build was made, '
        + 'so the "I am human" check is not shown and signup is unprotected. The name must '
        + 'match exactly, must be ticked for the Production environment, and needs a '
        + 'REDEPLOY after changing — it is baked into the bundle, not read at runtime.',
      );
    }
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        // A token is short-lived. Clearing it on expiry stops the form submitting one
        // Cloudflare has already retired, which would read to the user as a random
        // rejection of a check they plainly completed.
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => { onTokenRef.current(''); setFailed(true); },
        theme: 'light',
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (window.turnstile) {
      renderWidget();
    } else if (existing) {
      existing.addEventListener('load', renderWidget);
    } else {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      // Blocked by a network, an extension, or a CSP that forgot this origin. Say so,
      // rather than leaving a blank space where the check should be.
      script.onerror = () => { if (!cancelled) setFailed(true); };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* already gone */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // A rejected submit burns the token, so the parent asks for a fresh one.
  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current('');
    }
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div className="space-y-1">
      <div ref={containerRef} />
      {failed && (
        <p className="text-xs text-amber-700">
          The &quot;I am human&quot; check could not load. An ad-blocker or your network may
          be blocking challenges.cloudflare.com — turn it off for this site and reload.
        </p>
      )}
    </div>
  );
}
