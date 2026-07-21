'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

export function PromoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('promo_banner_dismissed');
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem('promo_banner_dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-600 via-emerald-600 to-emerald-600 bg-[length:200%_100%] animate-shimmer p-3 sm:p-4 shadow-sm mb-4">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors z-10"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 pr-8">
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400"></span>
          </span>
          <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">From IR-PVC</span>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-5 flex-1">
          <a
            href="https://primerp.in?ref=irpvc"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors group"
          >
            <span className="bg-white text-emerald-700 text-[10px] font-black rounded px-1.5 py-0.5">ERP</span>
            <span className="text-white text-sm font-semibold">PRIME ERP</span>
            <span className="text-green-300 text-[10px] font-bold">FREE TRIAL</span>
            <ExternalLink className="h-3 w-3 text-white/50 group-hover:text-white/80" />
          </a>
          <a
            href="https://irwcms.primerp.in?ref=irpvc"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors group"
          >
            <span className="bg-white text-emerald-700 text-[10px] font-black rounded px-1.5 py-0.5">eMB</span>
            <span className="text-white text-sm font-semibold">IRWCMS Auto-Fill</span>
            <span className="text-green-300 text-[10px] font-bold">FREE TRIAL</span>
            <ExternalLink className="h-3 w-3 text-white/50 group-hover:text-white/80" />
          </a>
        </div>
      </div>
    </div>
  );
}
