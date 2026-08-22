'use client';

/**
 * One admin screen holding several, as tabs.
 *
 * The admin menu had grown to twenty-five entries — six headings and a scroll — and
 * every one of them was a separate page load to find out whether it was the screen you
 * wanted. The screens themselves are fine; there were simply too many doors. Each
 * heading is now a single door, and its screens are tabs behind it.
 *
 * Nothing is moved or rewritten: a tab renders the page component that already exists,
 * loaded only when its tab is opened (these are large screens — one of them is 1,700
 * lines — and paying for all of them on arrival would be worse than the menu was). The
 * old routes still work, so bookmarks, deep links and the notes elsewhere in the app
 * that say "Admin → Cement Coefficients" keep leading where they always did.
 *
 * The open tab is in the URL (?tab=), so a hub screen can be linked to directly and the
 * back button steps through tabs rather than leaving the hub.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export interface AdminHubTab {
  /** URL value and React key. */
  key: string;
  name: string;
  /** One line under the tab strip, saying what this screen is for. */
  description?: string;
  /** The route this screen also lives at on its own — shown as "open on its own page". */
  href?: string;
  render: () => React.ReactNode;
}

export function AdminHub({
  title,
  description,
  tabs,
  extraLinks,
}: {
  title: string;
  description?: string;
  tabs: AdminHubTab[];
  /** Screens that are not tabs — an external document, a page that must stand alone. */
  extraLinks?: Array<{ name: string; href: string; external?: boolean }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams?.get('tab');
  const [fallback, setFallback] = useState(tabs[0]?.key);
  const activeKey = tabs.some(t => t.key === fromUrl) ? (fromUrl as string) : fallback;
  const active = tabs.find(t => t.key === activeKey) || tabs[0];

  const select = (key: string) => {
    setFallback(key);
    // replace, not push: stepping back through every tab a person clicked is not a
    // history anyone wants, and the URL still names the tab for sharing.
    router.replace(`?tab=${key}`, { scroll: false });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        {description && <p className="text-sm text-gray-500 mt-1 max-w-[80ch]">{description}</p>}
      </div>

      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => select(tab.key)}
              aria-current={tab.key === activeKey ? 'page' : undefined}
              className={`whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab.key === activeKey
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
          {extraLinks?.map(link => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              className="whitespace-nowrap px-3.5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 inline-flex items-center gap-1.5"
            >
              {link.name} <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>

      {active?.description && (
        <p className="text-sm text-gray-500 mt-3">{active.description}</p>
      )}

      <div className="mt-1">
        <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>}>
          {active?.render()}
        </Suspense>
      </div>
    </div>
  );
}

/** Hub pages are client screens that read ?tab=, so each needs its own Suspense boundary. */
export function AdminHubPage(props: Parameters<typeof AdminHub>[0]) {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>}>
      <AdminHub {...props} />
    </Suspense>
  );
}
