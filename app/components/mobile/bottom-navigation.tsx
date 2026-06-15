'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, Building2, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MobileNavigation from './mobile-navigation';
import { useLanguage } from '../i18n-provider';

const tabs = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Bills', href: '/bills', icon: FileText },
  { name: 'Contracts', href: '/contracts', icon: Building2 },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const getTabTranslation = (name: string) => {
    switch (name) {
      case 'Home': return t('nav.home');
      case 'Bills': return t('nav.bills');
      case 'Contracts': return t('nav.contracts');
      default: return name;
    }
  };

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
        <div className="grid grid-cols-4 h-16">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 transition-colors touch-manipulation',
                  isActive ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <tab.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>
                  {getTabTranslation(tab.name)}
                </span>
              </Link>
            );
          })}

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
                aria-label="More menu"
              >
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t('nav.more')}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm p-0 border-r-0">
              <MobileNavigation asSheet />
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Spacer for fixed bottom nav */}
      <div className="lg:hidden h-16" />
    </>
  );
}
