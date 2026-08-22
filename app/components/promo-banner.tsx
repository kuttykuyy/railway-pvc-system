'use client';

/**
 * "More tools from the makers of IR-PVC" — shown at the top of the Contracts and Bills
 * lists.
 *
 * The previous version was a thin green strip with two tiny chips in it; it read as a
 * decorative header and nobody clicked. This one looks like what it is — two products,
 * each with a name, what it does in one line, its badge and its own button — so it can be
 * judged in a glance and acted on in one click. Dismissable for the session.
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
    description: 'USSOR/DSR billing, measurements, deviation statements, labour attendance and 30+ reports — built for railway contractors.',
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
    description: 'A Chrome extension that enters your measurement data into IRWCMS forms for you — no more typing row after row.',
    pill: 'Free trial',
    cta: 'Add to Chrome',
    href: 'https://irwcms.primerp.in?ref=irpvc',
  },
] as const;

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
    <section
      aria-label="More tools from the makers of IR-PVC"
      className="relative rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm mb-5 overflow-hidden"
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-emerald-600" aria-hidden />
      <button
        onClick={dismiss}
        aria-label="Hide for now"
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pl-6 pr-12 pt-4 pb-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">From the makers of IR-PVC</p>
        <h2 className="text-lg font-bold text-slate-900 mt-0.5">Two more tools for railway contractors</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 px-5 pb-5 pt-3">
        {PRODUCTS.map(({ key, badge, Icon, name, tagline, description, pill, cta, href }) => (
          <div
            key={key}
            className="flex flex-col rounded-xl border border-emerald-100 bg-white p-4 shadow-[0_1px_2px_rgba(6,78,59,.06)]"
          >
            <div className="flex items-start gap-3">
              <div className="relative shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white grid place-items-center shadow-md">
                <Icon className="h-6 w-6" />
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-white text-emerald-700 text-[9px] font-black rounded px-1.5 py-px border border-emerald-200">
                  {badge}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base leading-tight">{name}</h3>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded-full px-2 py-0.5">{pill}</span>
                </div>
                <p className="text-sm font-semibold text-emerald-800 mt-0.5">{tagline}</p>
                <p className="text-[13px] text-slate-600 mt-1 leading-snug">{description}</p>
              </div>
            </div>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 transition-colors"
            >
              {cta} <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
