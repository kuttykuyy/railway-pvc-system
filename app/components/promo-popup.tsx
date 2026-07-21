'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function PromoPopup() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const dismissed = sessionStorage.getItem('promo_dismissed');
    if (!dismissed) {
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [mounted]);

  const dismiss = () => {
    setShow(false);
    sessionStorage.setItem('promo_dismissed', '1');
  };

  if (!mounted || !show) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={dismiss}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-600 px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-white/80 text-xs font-medium uppercase tracking-wider">From the makers of IR-PVC</p>
            <h2 className="text-white text-lg font-bold mt-1">More Tools for Railway Contractors</h2>
          </div>
          <button onClick={dismiss} className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 ml-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <a href="https://primerp.in?ref=irpvc" target="_blank" rel="noopener noreferrer"
            className="group flex items-start gap-4 p-4 rounded-xl border border-emerald-100 hover:bg-emerald-50 transition-colors">
            <div className="bg-emerald-600 text-white rounded-lg p-2.5 font-bold text-xs shrink-0">ERP</div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-sm group-hover:text-emerald-700">PRIME ERP</h3>
              <p className="text-xs text-gray-500 mt-1">USSOR/DSR billing, measurements, deviation statements, labour attendance & 30+ reports.</p>
              <span className="inline-block mt-2 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">14-Day Free Trial</span>
            </div>
          </a>
          <a href="https://irwcms.primerp.in?ref=irpvc" target="_blank" rel="noopener noreferrer"
            className="group flex items-start gap-4 p-4 rounded-xl border border-emerald-100 hover:bg-emerald-50 transition-colors">
            <div className="bg-emerald-600 text-white rounded-lg p-2.5 font-bold text-xs shrink-0">eMB</div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-sm group-hover:text-emerald-700">IRWCMS Auto-Fill</h3>
              <p className="text-xs text-gray-500 mt-1">Chrome extension to auto-fill eMB data in IRWCMS. Stop manual data entry — fill forms with one click.</p>
              <span className="inline-block mt-2 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Free Trial Available</span>
            </div>
          </a>
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button onClick={dismiss} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
            Maybe Later
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
