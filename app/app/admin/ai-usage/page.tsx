'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Sparkles, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface UsageBucket { calls: number; tokens: number }
interface RecentCall {
  id: string;
  operation: string;
  model: string;
  totalTokens: number;
  success: boolean;
  errorType: string | null;
  createdAt: string;
}
interface UsageSummary {
  total: UsageBucket & { failures: number };
  today: UsageBucket;
  month: UsageBucket;
  recent: RecentCall[];
  lastFailureAt: string | null;
}
type ProviderStatus = 'working' | 'payment_required' | 'out_of_credit' | 'not_configured' | 'error';

const STATUS_META: Record<ProviderStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  working: { label: 'Working', className: 'bg-green-100 text-green-800 border-green-300', Icon: CheckCircle2 },
  payment_required: { label: 'Payment method required', className: 'bg-red-100 text-red-800 border-red-300', Icon: XCircle },
  out_of_credit: { label: 'Out of credit', className: 'bg-red-100 text-red-800 border-red-300', Icon: XCircle },
  not_configured: { label: 'Not configured', className: 'bg-gray-100 text-gray-800 border-gray-300', Icon: AlertTriangle },
  error: { label: 'Error', className: 'bg-amber-100 text-amber-800 border-amber-300', Icon: AlertTriangle },
};

const numberFmt = new Intl.NumberFormat('en-IN');

export default function AdminAiUsagePage() {
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ status: ProviderStatus; detail: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-usage');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load AI usage');
      setUsage(data.usage);
    } catch (error: any) {
      toast({ title: 'Could not load AI usage', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/admin/ai-usage', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status check failed');
      setStatus(data.status);
    } catch (error: any) {
      toast({ title: 'Status check failed', description: error.message, variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { loadUsage(); }, []);

  const meta = status ? STATUS_META[status.status] : null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-600" /> AI Usage & Credit
          </h1>
          <p className="text-muted-foreground">AI bill-extraction consumption and provider status (Abacus RouteLLM).</p>
        </div>
        <Button variant="outline" onClick={loadUsage} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Provider status */}
      <Card>
        <CardHeader>
          <CardTitle>Provider status</CardTitle>
          <CardDescription>
            Abacus does not expose a remaining-credit figure — it only reports when credit is exhausted. Use the check below to
            confirm whether AI extraction is currently working. The real balance lives in the Abacus dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={checkStatus} disabled={checking}>
              {checking ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Check now
            </Button>
            {meta && (
              <Badge variant="outline" className={`text-sm px-3 py-1 ${meta.className}`}>
                <meta.Icon className="h-4 w-4 mr-1 inline" /> {meta.label}
              </Badge>
            )}
            <a
              href="https://apps.abacus.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Open Abacus dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {status && <p className="text-sm text-muted-foreground">{status.detail}</p>}
        </CardContent>
      </Card>

      {/* Usage stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tokens today" value={usage ? numberFmt.format(usage.today.tokens) : '—'} sub={usage ? `${numberFmt.format(usage.today.calls)} calls` : ''} />
        <StatCard title="Tokens this month" value={usage ? numberFmt.format(usage.month.tokens) : '—'} sub={usage ? `${numberFmt.format(usage.month.calls)} calls` : ''} />
        <StatCard title="Tokens all-time" value={usage ? numberFmt.format(usage.total.tokens) : '—'} sub={usage ? `${numberFmt.format(usage.total.calls)} calls` : ''} />
        <StatCard title="Failed calls" value={usage ? numberFmt.format(usage.total.failures) : '—'} sub={usage?.lastFailureAt ? `last ${format(new Date(usage.lastFailureAt), 'dd MMM, HH:mm')}` : 'none'} />
      </div>

      {/* Recent calls */}
      <Card>
        <CardHeader>
          <CardTitle>Recent AI calls</CardTitle>
          <CardDescription>The most recent AI provider calls and their token cost.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage && usage.recent.length > 0 ? (
                usage.recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(row.createdAt), 'dd MMM, HH:mm:ss')}</TableCell>
                    <TableCell>{row.operation}</TableCell>
                    <TableCell>{row.model}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(row.totalTokens)}</TableCell>
                    <TableCell>
                      {row.success ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">OK</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">{row.errorType || 'failed'}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {loading ? 'Loading…' : 'No AI calls recorded yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
