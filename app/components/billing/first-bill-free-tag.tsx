'use client';

import { useEffect, useState } from 'react';

// Shows "FREE" next to bill-creation buttons while the signed-in user still has
// an unused trial bill. Renders nothing once the trial is spent, for free-fee
// accounts (the balance API reports their trial as inactive), or while loading —
// so it can sit inline anywhere without reserving space.
export function FirstBillFreeTag({ className = '' }: { className?: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/balance')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.trialInfo?.isActive) setActive(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-green-700 ${className}`}
    >
      Free
    </span>
  );
}
