# PWA UI/UX Rework — Design Spec

**Date:** 2026-06-13  
**Project:** IR-PVC (Indian Railway Price Variation Clause Calculator)  
**Scope:** Mobile/PWA experience only (lg:hidden breakpoint). Desktop UI stays unchanged unless noted.

---

## 1. Goal

Make the PWA feel like a polished, native mobile app for railway contractors and admins. Improve readability, reduce clutter, and give one-tap access to the most common actions.

---

## 2. Design Direction

**Chosen direction:** A — Clean Professional

- Light, airy surfaces with soft shadows
- Primary accent: IR-PVC purple (`#7c3aed`)
- Background: slate-50 (`#f8fafc`)
- Cards: white with rounded-2xl corners
- Typography: Inter, clear hierarchy
- Bottom tab navigation instead of a hamburger side drawer

---

## 3. Design System

### Colors
| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#7c3aed` | Buttons, active nav, links, balance card gradient |
| `--color-primary-dark` | `#6d28d9` | Gradient end |
| `--color-surface` | `#ffffff` | Cards, bottom nav |
| `--color-background` | `#f8fafc` | Page background |
| `--color-text-primary` | `#1e293b` | Headings, numbers |
| `--color-text-secondary` | `#64748b` | Labels, captions |
| `--color-success` | `#059669` | Approved, positive amounts |
| `--color-warning` | `#d97706` | Pending |
| `--color-error` | `#dc2626` | Offline/error states |

### Spacing
- Outer page padding: `16px`
- Card padding: `16px`
- Card border-radius: `16px` (`rounded-2xl`)
- Grid gaps: `12px`
- Section gaps: `16px`

### Elevation
- Cards: `box-shadow: 0 2px 6px rgba(0,0,0,0.04)`
- Credit balance card: `0 4px 14px rgba(124,58,237,0.25)`

### Typography
- Page greeting: `16px`, weight 700
- Section titles: `14px`, weight 700
- Metric numbers: `24px`, weight 800
- Labels: `10px`, uppercase, letter-spacing 0.5px

---

## 4. Components

### 4.1 Mobile Dashboard (`components/mobile/mobile-dashboard.tsx`)

Replace the current stacked-card layout with a single scrolling feed:

1. **Header row**
   - Greeting + user avatar (first letter)
2. **Credit balance card**
   - Full-width purple gradient card
   - Large balance
   - Two actions: "Top Up" and "History"
3. **Quick actions grid**
   - 4 icons: New Bill, New Contract, Reports, Forecast
   - White circular/rounded-square buttons with emoji or Lucide icons
4. **Key metrics**
   - 2-column grid: Active Contracts, Bills Generated
   - Optional third row for This Month / Revenue
5. **Recent activity**
   - Compact list items with status icon, title, subtitle, date, amount
   - "View all" link

### 4.2 Bottom Navigation (`components/mobile/mobile-navigation.tsx`)

Replace the hamburger Sheet with a fixed bottom tab bar:

| Tab | Icon | Route |
|---|---|---|
| Home | Home | `/dashboard` |
| Bills | FileText | `/bills` |
| Contracts | Building2 | `/contracts` |
| More | Menu | opens side sheet with remaining links + sign out |

- Active tab: purple icon + label
- Inactive tab: gray icon + label
- 4 equal columns, safe-area padding for notched devices
- The "More" sheet keeps the existing full navigation but is now secondary

### 4.3 Install Prompt (`components/pwa/install-prompt.tsx`)

Update to match the Clean Professional style:
- White card, rounded-2xl, soft shadow
- App icon + title + one-line description
- Primary "Install" button + text "Later" link
- Show only on supported mobile browsers

### 4.4 Offline Indicator (`components/mobile/offline-indicator.tsx`)

Simplify the current banner:
- Smaller height
- No large icon circle
- Red background tint when offline
- Green tint when back online, auto-hide after 3 seconds

### 4.5 Service Worker Update Toast (`components/service-worker-update.tsx`)

Keep the existing update toast but align colors to the Clean Professional palette.

---

## 5. Interaction & Motion

- Tab switching: instant, no animation required
- Card press: subtle scale `0.98` on active state
- Pull-to-refresh on dashboard: reuse existing `loadDashboardData` logic
- Bottom nav: fixed, `z-50`, adds `pb-safe` or equivalent padding

---

## 6. Accessibility

- Bottom nav icons paired with text labels
- Touch targets minimum `44px`
- Color contrast meets WCAG AA
- `aria-current="page"` on active tab

---

## 7. Out of Scope

- Desktop navigation redesign
- New pages or features
- Push notification payload changes
- Service worker caching strategy changes (already fixed separately)

---

## 8. Success Criteria

- [ ] Mobile dashboard renders the new Clean Professional layout
- [ ] Bottom navigation is visible on all authenticated mobile routes
- [ ] Active tab highlights correctly
- [ ] Install prompt and offline indicator use the new style
- [ ] `npx tsc --noEmit` and `npx next lint` pass
- [ ] Lighthouse PWA score remains ≥ 90
