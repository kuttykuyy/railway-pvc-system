'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, ChevronLeft, ChevronRight, Users } from 'lucide-react';

interface Transaction {
  id: string;
  userName: string | null;
  userEmail: string;
  amount: number;
  type: string;
  reason: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  adminUserEmail: string | null;
}

interface Summary {
  totalTopups: number;
  topupCount: number;
  totalUsage: number;
  usageCount: number;
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

type FilterType = 'all' | 'add' | 'deduct';

export default function CreditStatementsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (status === 'loading') return;
    const roleInfo = getClientRoleInfo(session);
    if (!roleInfo.isAdmin) { router.push('/dashboard'); return; }
    fetchData();
  }, [session, status, filter, selectedUserId, page]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const userParam = selectedUserId ? `&userId=${selectedUserId}` : '';
      const res = await fetch(`/api/admin/credit-statements?type=${filter}&page=${page}&limit=30${userParam}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setSummary(data.summary || null);
      setTotalPages(data.pagination?.totalPages || 1);
      if (data.users) setUsers(data.users);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
  const formatDate = (d: string) => new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-slate-500">Loading…</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Credit Statements</h1>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <ArrowUpCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Total Topups</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(summary.totalTopups)}</p>
              <p className="text-xs text-slate-400">{summary.topupCount} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <ArrowDownCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Total Usage</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(summary.totalUsage)}</p>
              <p className="text-xs text-slate-400">{summary.usageCount} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Net Revenue</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(summary.totalTopups - summary.totalUsage)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Wallet className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Total Transactions</p>
              <p className="text-lg font-bold text-emerald-700">{summary.topupCount + summary.usageCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(['all', 'add', 'deduct'] as FilterType[]).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setFilter(f); setPage(1); }}
              className="capitalize"
            >
              {f === 'add' ? 'Topups' : f === 'deduct' ? 'Usage' : 'All'}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <Select value={selectedUserId} onValueChange={(v) => { setSelectedUserId(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">Reason</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800 text-xs">{t.userName || '—'}</p>
                        <p className="text-[11px] text-slate-400">{t.userEmail}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={t.type === 'add' ? 'default' : 'destructive'} className={`text-[10px] ${t.type === 'add' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}`}>
                          {t.type === 'add' ? 'Topup' : 'Usage'}
                        </Badge>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${t.type === 'add' ? 'text-green-700' : 'text-red-600'}`}>
                        {t.type === 'add' ? '+' : '−'}{formatCurrency(t.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[250px] truncate hidden md:table-cell">{t.reason}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 font-medium text-xs hidden md:table-cell">{formatCurrency(t.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
