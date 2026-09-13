import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The frame both auth pages share: what an account gets you on the left, the form on
 * the right; a single column with the logo on top on a phone.
 *
 * One frame for both pages so sign-up and sign-in read as one product, and so the
 * left panel — not the form — carries the sales copy. The form itself stays short.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
      <aside className="hidden lg:flex flex-col justify-between border-r border-gray-200 bg-[#f8faf9] px-16 py-14">
        <Logo />
        <div className="max-w-[440px] space-y-7">
          <h1 className="text-[40px] leading-[46px] font-extrabold tracking-tight text-gray-900 [text-wrap:balance]">
            Your PVC statement, in minutes.
          </h1>
          <p className="text-base leading-relaxed text-gray-600">
            Upload the signed IREPS bill. IR-PVC reads every item, applies the indices for your
            base month, and hands back the statement in the Railway&rsquo;s own format.
          </p>
          <ul className="space-y-3.5 text-[15px] leading-[22px] text-gray-700">
            <Fact><strong className="text-gray-900">First bill free</strong> &mdash; no card needed to try it.</Fact>
            <Fact>Totals checked against the bill&rsquo;s own printed figures.</Fact>
            <Fact>Statement delivered here and on WhatsApp.</Fact>
          </ul>
        </div>
        <p className="text-[13px] text-gray-500">First bill free &middot; then pay per bill, no subscription needed.</p>
      </aside>

      <main className="flex min-h-screen flex-col lg:items-center lg:justify-center px-5 py-8 lg:p-12 lg:bg-grid-slate-200/50">
        <div className="lg:hidden mb-7"><Logo /></div>
        <div className="w-full max-w-[480px] lg:mx-auto lg:rounded-xl lg:border lg:border-gray-200 lg:bg-white lg:shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)] lg:px-10 lg:py-9">
          <div className="space-y-1.5 mb-5">
            <h2 className="text-[26px] leading-8 font-extrabold tracking-tight text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function Fact({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      <span>{children}</span>
    </li>
  );
}

function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      {/* The real brand mark, the same file the top navigation uses. */}
      <img src="/logo.png" alt="IR-PVC logo" className="h-10 w-auto object-contain" />
      <span className="text-lg font-extrabold tracking-tight text-emerald-600">IR-PVC</span>
    </Link>
  );
}

/** The one Google button, drawn once. */
export function GoogleButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-60"
    >
      <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.9c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7-10.1 7-17.2z" />
        <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function OrDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-[13px] text-gray-500">{children}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
