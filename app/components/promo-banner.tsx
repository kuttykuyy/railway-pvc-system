'use client';

/**
 * "More tools from the makers of IR-PVC" — a marquee ticker shown at the top of the
 * Contracts and Bills lists.
 *
 * It replaced a two-column card block: the ads now slide continuously in one thin strip,
 * so the promo costs far less vertical space and the motion draws the eye. Each product
 * is a compact chip (icon, name, one-line pitch, button). The strip pauses on hover so a
 * moving button stays clickable, holds still for anyone whose OS asks to reduce motion,
 * and is dismissable for the session.
 */

import { useState, useEffect } from 'react';
import { X, ArrowUpRight, Boxes, MousePointerClick } from 'lucide-react';

const PRODUCTS = [
  {
    key: 'primerp',
    badge: 'ERP',
    Icon: Boxes,
    name: 'Prime ERP',
    tagline: 'Run the whole contract, not just the PVC.',
    pill: '14-day free trial',
    cta: 'Start free trial',
    href: 'https://primerp.in?ref=irpvc',
  },
  {
    key: 'irwcms',
    badge: 'eMB',
    Icon: MousePointerClick,
    name: 'IRWCMS Auto-Fill',
    tagline: 'Fill eMB in IRWCMS with one click.',
    pill: 'Free trial',
    cta: 'Add to Chrome',
    href: 'https://irwcms.primerp.in?ref=irpvc',
  },
] as const;

type Product = (typeof PRODUCTS)[number];

function Chip({ badge, Icon, name, tagline, pill, cta, href }: Product) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-none items-center gap-3 rounded-xl border border-emerald-200 bg-white py-2 pl-2.5 pr-3.5 no-underline shadow-[0_1px_2px_rgba(6,78,59,.06)] hover:border-emerald-300"
    >
      <span className="relative flex-none h-10 w-10 rounded-[10px] bg-gradient-to-br from-emerald-600 to-emerald-700 text-white grid place-items-center shadow-sm">
        <Icon className="h-5 w-5" />
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-white text-emerald-700 text-[8px] font-black rounded px-1 border border-emerald-200">
          {badge}
        </span>
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 leading-tight">{name}</span>
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded-full px-2 py-px whitespace-nowrap">{pill}</span>
        </span>
        <span className="text-[12.5px] text-slate-600 whitespace-nowrap">{tagline}</span>
      </span>
      <span className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 whitespace-nowrap">
        {cta} <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}

function Dot() {
  return <span aria-hidden className="flex-none h-1.5 w-1.5 rounded-full bg-emerald-300" />;
}

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

  // The track is rendered twice back-to-back; the animation slides it by exactly one
  // copy's width (-50%) and loops, so the join is seamless. A separator dot sits after
  // every chip, including the last, so the two copies butt together evenly.
  const oneCopy = (
    <>
      {PRODUCTS.map((p) => (
        <span key={p.key} className="flex items-center gap-3.5">
          <Chip {...p} />
          <Dot />
        </span>
      ))}
    </>
  );

  return (
    <section
      aria-label="More tools from the makers of IR-PVC"
      className="relative rounded-2xl border border-emerald-200 bg-emerald-50/60 shadow-sm mb-5 overflow-hidden"
    >
      <style>{`
        @keyframes irpvc-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .irpvc-marquee-track { animation: irpvc-marquee 32s linear infinite; }
        .irpvc-marquee-viewport:hover .irpvc-marquee-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .irpvc-marquee-track { animation: none; }
        }
      `}</style>

      <div className="absolute inset-y-0 left-0 w-1.5 bg-emerald-600 z-10" aria-hidden />

      <div className="flex items-center gap-2 pl-5 pr-3 py-1.5 border-b border-emerald-100">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">
          From the makers of IR-PVC
        </span>
        <button
          onClick={dismiss}
          aria-label="Hide for now"
          className="ml-auto text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="irpvc-marquee-viewport relative overflow-hidden py-2.5">
        {/* Soft fade at both edges so chips enter and leave gracefully */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-10 bg-gradient-to-r from-emerald-50/90 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 z-10 bg-gradient-to-l from-emerald-50/90 to-transparent" aria-hidden />
        <div className="irpvc-marquee-track flex w-max items-center gap-3.5">
          {oneCopy}
          {oneCopy}
        </div>
      </div>
    </section>
  );
}
