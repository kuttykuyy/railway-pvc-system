'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Send, Users, Activity, FileText, CreditCard } from 'lucide-react';
import { format } from 'date-fns';

interface RecentChat {
  chatId: string;
  step: string;
  lastMessageAt: string;
  linked: boolean;
  account: string | null;
  agreementNo: string | null;
  awaitingPayment: boolean;
}

interface Stats {
  totalChats: number;
  linkedChats: number;
  guestChats: number;
  active24h: number;
  active7d: number;
  pvcContracts: number;
  pvcContracts7d: number;
  awaitingPayment: number;
}

export default function TelegramUsagePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/telegram-usage');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStats(data.stats);
      setRecent(data.recent || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cards = stats ? [
    { label: 'Total chats', value: stats.totalChats, icon: Users, sub: `${stats.linkedChats} linked · ${stats.guestChats} guest` },
    { label: 'Active (24h)', value: stats.active24h, icon: Activity, sub: `${stats.active7d} in last 7 days` },
    { label: 'PVC flows', value: stats.pvcContracts, icon: FileText, sub: `${stats.pvcContracts7d} in last 7 days` },
    { label: 'Awaiting payment', value: stats.awaitingPayment, icon: CreditCard, sub: 'reports quoted, not yet paid' },
  ] : [];

  const stepLabel = (s: string) => s
    .replace(/^AWAITING_/, '')
    .replace(/_/g, ' ')
    .toLowerCase();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-sky-600" />
          <h1 className="text-xl font-semibold">Telegram bot usage</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <c.icon className="h-4 w-4" /> {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{c.value}</div>
              <div className="text-xs text-slate-500 mt-1">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent chats</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chat ID</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Agreement</TableHead>
                <TableHead>Current step</TableHead>
                <TableHead>Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && !loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-slate-500 py-8">No Telegram activity yet.</TableCell></TableRow>
              )}
              {recent.map((r) => (
                <TableRow key={r.chatId}>
                  <TableCell className="font-mono text-xs">{r.chatId}</TableCell>
                  <TableCell className="text-sm">
                    {r.linked
                      ? <span title={r.account || ''}>{r.account || 'Linked account'}</span>
                      : <span className="text-slate-400">Guest</span>}
                  </TableCell>
                  <TableCell className="text-sm">{r.agreementNo || <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell>
                    {r.awaitingPayment
                      ? <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">awaiting payment</Badge>
                      : <span className="text-xs text-slate-600">{stepLabel(r.step)}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {format(new Date(r.lastMessageAt), 'dd MMM, HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Each row is one Telegram chat. “PVC flows” counts contracts created from Telegram uploads.
        Paid reports are delivered per payment; “awaiting payment” shows quoted-but-unpaid ones.
      </p>
    </div>
  );
}
