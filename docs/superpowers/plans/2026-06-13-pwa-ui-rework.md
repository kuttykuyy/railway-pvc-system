# PWA UI/UX Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Clean Professional mobile/PWA UI rework: new mobile dashboard, bottom tab navigation, and refreshed PWA chrome components.

**Architecture:** Keep the existing page structure and data fetching. Replace the mobile presentation layer (`mobile-dashboard.tsx`, `mobile-navigation.tsx`, `install-prompt.tsx`, `offline-indicator.tsx`) with the Clean Professional design. Add a bottom tab bar component and reuse the existing side sheet as the "More" menu.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide React, next-themes.

---

## File Map

| File | Responsibility |
|---|---|
| `components/mobile/mobile-dashboard.tsx` | New dashboard feed: greeting, credit card, quick actions, stats, recent activity |
| `components/mobile/bottom-navigation.tsx` | New fixed bottom tab bar with Home / Bills / Contracts / More |
| `components/mobile/mobile-navigation.tsx` | Converted to "More" side sheet, triggered by bottom nav |
| `components/pwa/install-prompt.tsx` | Restyled install banner |
| `components/mobile/offline-indicator.tsx` | Restyled compact offline banner |
| `components/service-worker-update.tsx` | Color-align update toast |
| `components/layout-wrapper.tsx` | Swap old mobile nav for bottom nav + more sheet |
| `app/globals.css` | Add safe-area padding utilities if missing |

---

## Task 1: Add safe-area utility CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append safe-area utilities**

```css
/* Safe area utilities for PWA bottom navigation */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.mb-safe {
  margin-bottom: env(safe-area-inset-bottom, 0px);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat(pwa): add safe-area inset utilities"
```

---

## Task 2: Build Bottom Navigation component

**Files:**
- Create: `components/mobile/bottom-navigation.tsx`
- Modify: `components/mobile/mobile-navigation.tsx` (extract More sheet)
- Modify: `components/layout-wrapper.tsx`

- [ ] **Step 1: Create the bottom tab bar**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, Building2, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MobileNavigation from './mobile-navigation';

const tabs = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Bills', href: '/bills', icon: FileText },
  { name: 'Contracts', href: '/contracts', icon: Building2 },
];

export default function BottomNavigation() {
  const pathname = usePathname();

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
                  'flex flex-col items-center justify-center gap-1 transition-colors',
                  isActive ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <tab.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>
                  {tab.name}
                </span>
              </Link>
            );
          })}

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="More menu"
              >
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
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
```

- [ ] **Step 2: Refactor mobile-navigation.tsx to accept `asSheet` prop**

Keep the existing side-sheet content but remove the fixed mobile header and spacer. Wrap the inner content in an exported component that accepts `{ asSheet?: boolean }`. The default export should still render the original sheet for desktop fallback if needed.

```tsx
interface MobileNavigationProps {
  asSheet?: boolean;
}

export default function MobileNavigation({ asSheet = false }: MobileNavigationProps) {
  // existing sheet content body only (no fixed header/spacer when asSheet=true)
}
```

- [ ] **Step 3: Update layout-wrapper.tsx to use BottomNavigation**

Replace both `<MobileNavigation />` usages with `<BottomNavigation />`. Remove the old top mobile header spacer logic where present.

```tsx
import BottomNavigation from '@/components/mobile/bottom-navigation';

// inside both return branches
<BottomNavigation />
```

- [ ] **Step 4: Run typecheck and lint**

```bash
cd app
npx tsc --noEmit
npx next lint
```

- [ ] **Step 5: Commit**

```bash
git add components/mobile/bottom-navigation.tsx components/mobile/mobile-navigation.tsx components/layout-wrapper.tsx app/globals.css
git commit -m "feat(pwa): add bottom tab navigation and more sheet"
```

---

## Task 3: Rework Mobile Dashboard

**Files:**
- Modify: `components/mobile/mobile-dashboard.tsx`

- [ ] **Step 1: Update imports**

Replace the existing icon imports with:

```tsx
import {
  Building2,
  FileText,
  Calculator,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  ChevronRight,
  Zap,
  Wifi,
  WifiOff,
  Plus,
  History,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
```

- [ ] **Step 2: Replace loading skeleton**

Keep the existing skeleton structure but style cards with rounded-2xl and remove the connection status card from the skeleton state.

- [ ] **Step 3: Implement new dashboard layout**

Render in this order:

1. **Connection status chip** (small, inline) — only when offline
2. **Greeting header** with avatar
3. **Credit balance gradient card** with Top Up / History buttons
4. **Quick actions grid** — New Bill, New Contract, Reports, Forecast
5. **Key metrics** — Active Contracts + Bills Generated
6. **Recent activity** list
7. **Admin panel link** (if admin)

Use Tailwind classes matching the Clean Professional design system. Example structure:

```tsx
<div className="space-y-4 pb-4 lg:hidden">
  {/* offline chip */}
  {!isOnline && (
    <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-100 px-3 py-1.5 text-xs font-medium text-red-700">
      <WifiOff className="h-3.5 w-3.5" />
      Offline mode
    </div>
  )}

  {/* header */}
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide">Good afternoon</p>
      <h1 className="text-lg font-bold text-slate-900">
        {session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
      </h1>
    </div>
    <div className="h-10 w-10 rounded-full bg-violet-600 text-white flex items-center justify-center font-semibold">
      {initial}
    </div>
  </div>

  {/* credit card */}
  <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-violet-700 p-5 text-white shadow-lg shadow-violet-200">
    <p className="text-xs text-violet-100">Available Credits</p>
    <p className="text-3xl font-extrabold mt-1">₹{creditBalance.toLocaleString('en-IN')}</p>
    <div className="flex gap-3 mt-4">
      <Button size="sm" variant="secondary" className="flex-1 bg-white/20 text-white hover:bg-white/30 border-0" asChild>
        <Link href="/billing">Top Up</Link>
      </Button>
      <Button size="sm" variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 bg-transparent" asChild>
        <Link href="/profile">History</Link>
      </Button>
    </div>
  </div>

  {/* quick actions */}
  <div className="grid grid-cols-4 gap-3">
    <QuickAction icon={Plus} label="New Bill" href="/bills/new" />
    <QuickAction icon={Building2} label="Contract" href="/contracts/new" />
    <QuickAction icon={BarChart3} label="Reports" href="/reports/abstract" />
    <QuickAction icon={TrendingUp} label="Forecast" href="/pvc-forecast" />
  </div>

  {/* key metrics */}
  <div className="grid grid-cols-2 gap-3">
    <MetricCard value={stats.totalContracts} label="Active Contracts" />
    <MetricCard value={stats.totalBills} label="Bills Generated" />
  </div>

  {/* recent activity */}
  <Card className="rounded-2xl shadow-sm border-slate-100">
    ...existing recent activity list with updated spacing...
  </Card>
</div>
```

- [ ] **Step 4: Run typecheck and lint**

```bash
cd app
npx tsc --noEmit
npx next lint
```

- [ ] **Step 5: Commit**

```bash
git add components/mobile/mobile-dashboard.tsx
git commit -m "feat(pwa): rework mobile dashboard with clean professional design"
```

---

## Task 4: Restyle PWA Chrome Components

**Files:**
- Modify: `components/pwa/install-prompt.tsx`
- Modify: `components/mobile/offline-indicator.tsx`
- Modify: `components/service-worker-update.tsx`

- [ ] **Step 1: Update install prompt**

Replace the Card/CardHeader/CardContent layout with:

```tsx
<div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
  <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4">
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
        <Smartphone className="h-5 w-5 text-violet-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">Install IR-PVC</p>
        <p className="text-xs text-slate-500 mt-0.5">Add to home screen for quick access and offline use.</p>
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700" onClick={handleInstallClick}>
            Install
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 text-slate-500" onClick={handleDismiss}>
            Later
          </Button>
        </div>
      </div>
      <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Update offline indicator**

Simplify to a compact top banner:

```tsx
<div className="fixed top-16 left-4 right-4 z-50 lg:top-4 lg:left-auto lg:right-4 lg:max-w-sm">
  <div className={cn(
    "rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm border",
    isOnline
      ? "bg-green-50 text-green-800 border-green-100"
      : "bg-red-50 text-red-800 border-red-100"
  )}>
    <span className="flex items-center gap-2">
      {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {isOnline ? 'Back online' : 'You are offline'}
    </span>
  </div>
</div>
```

- [ ] **Step 3: Align service worker update toast colors**

Change the gradient from `from-violet-600 to-purple-600` to `from-violet-600 to-violet-700` and update text colors to match Clean Professional palette.

- [ ] **Step 4: Run typecheck and lint**

```bash
cd app
npx tsc --noEmit
npx next lint
```

- [ ] **Step 5: Commit**

```bash
git add components/pwa/install-prompt.tsx components/mobile/offline-indicator.tsx components/service-worker-update.tsx
git commit -m "feat(pwa): restyle install prompt, offline indicator, and update toast"
```

---

## Task 5: Final Verification & Push

- [ ] **Step 1: Run full checks**

```bash
cd app
npx tsc --noEmit
npx next lint
```

- [ ] **Step 2: Check no desktop regressions**

Open the app at desktop width and confirm the desktop navigation still renders and the bottom nav is hidden (`lg:hidden`).

- [ ] **Step 3: Push all commits**

```bash
git push origin main
```

---

## Spec Coverage Check

| Spec Section | Implementing Task |
|---|---|
| Clean Professional design system | Task 3 + Task 4 |
| Mobile dashboard layout | Task 3 |
| Bottom tab navigation | Task 2 |
| Updated install prompt | Task 4 |
| Updated offline indicator | Task 4 |
| Service worker toast alignment | Task 4 |
| Accessibility touch targets | Task 2 + Task 3 |
| Safe-area handling | Task 1 + Task 2 |

---

## Rollback Notes

If the bottom nav causes issues on specific routes, the previous mobile header sheet can be restored by reverting `components/layout-wrapper.tsx` to its pre-change state.
