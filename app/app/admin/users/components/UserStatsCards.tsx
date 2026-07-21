
/**
 * User Statistics Cards Component
 */

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, CreditCard, Award, Flame } from 'lucide-react';
import type { UserStats } from '../types';
import { formatCurrency } from '../utils/userUtils';

interface UserStatsCardsProps {
  stats: UserStats;
}

export function UserStatsCards({ stats }: UserStatsCardsProps) {
  const cards = [
    {
      title: 'Total Directory',
      value: stats.totalUsers,
      desc: 'Registered accounts',
      icon: Users,
      colorClass: 'text-emerald-600',
      bgGlow: 'bg-emerald-500/5',
      borderGlow: 'hover:border-emerald-200 hover:shadow-lg',
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
    },
    {
      title: 'Active Directory',
      value: stats.activeUsers,
      desc: 'Active system users',
      icon: Activity,
      colorClass: 'text-emerald-600',
      bgGlow: 'bg-emerald-500/5',
      borderGlow: 'hover:border-emerald-200 hover:shadow-lg',
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
    },
    {
      title: 'System Reserves',
      value: formatCurrency(stats.totalCredits),
      desc: 'Total credit reserves',
      icon: CreditCard,
      colorClass: 'text-amber-600',
      bgGlow: 'bg-amber-500/5',
      borderGlow: 'hover:border-amber-200 hover:shadow-lg',
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-100/50',
    },
    {
      title: 'Exempt Tiers',
      value: stats.freeAccounts,
      desc: 'Free / Official accounts',
      icon: Award,
      colorClass: 'text-emerald-600',
      bgGlow: 'bg-emerald-500/5',
      borderGlow: 'hover:border-emerald-200 hover:shadow-lg',
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
    },
    {
      title: 'Active Trials',
      value: stats.trialUsers,
      desc: 'Exploring sandbox',
      icon: Flame,
      colorClass: 'text-rose-600',
      bgGlow: 'bg-rose-500/5',
      borderGlow: 'hover:border-rose-200 hover:shadow-lg',
      iconBg: 'bg-rose-50 text-rose-600 border border-rose-100/50',
    },
  ];

  return (
    <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <Card 
            key={idx}
            className={`relative overflow-hidden border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl transition-all duration-300 transform hover:-translate-y-1 ${card.borderGlow}`}
          >
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none opacity-40 ${card.bgGlow}`} />
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {card.title}
                </span>
                <div className={`p-2.5 rounded-2xl ${card.iconBg}`}>
                  <IconComponent className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className={`text-3xl font-black tracking-tight ${card.colorClass}`}>
                  {card.value}
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-none">
                  {card.desc}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

