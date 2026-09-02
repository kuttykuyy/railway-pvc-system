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
import { estimateCostUsd, rateForModel } from '@/lib/ai-pricing';

interface UsageBucket { calls: number; promptTokens: number; completionTokens: number; tokens: number; costUsd: number }
interface RecentCall {
  id: string;
  operation: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  success: boolean;
  errorType: string | null;
  createdAt: string;
}
interface UsageSummary {
  total: UsageBucket & { failures: number };
  today: UsageBucket;
  month: UsageBucket;
  byOperation: Array<{ operation: string; calls: number; promptTokens: number; completionTokens: number; tokens: number; failures: number; costUsd: number }>;
  byModel: Array<{ model: string; label: string; known: boolean; calls: number; promptTokens: number; completionTokens: number; tokens: number; costUsd: number }>;
  untokenedCalls: number;
  recent: RecentCall[];
  lastFailureAt: string | null;
}

/** What each recorded operation is, in the words a person uses for it. */
const OPERATION_LABEL: Record<string, string> = {
  'bill-extraction': 'Bill PDF reading (AI fallback)',
  'agreement-extraction': 'LOA / agreement reading',
  'jpc-extraction': 'JPC steel sheet reading',
  'classification-justification': 'Classification justification',
  'find-classifications': 'Classification search',
  'tendering-insights': 'Tendering estimator insights (feature removed)',
  'ppac-fuel-fetch': 'Diesel price fetch (nightly)',
};
type ProviderStatus = 'working' | 'payment_required' | 'out_of_credit' | 'not_configured' | 'error';

const STATUS_META: Record<ProviderStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  working: { label: 'Working', className: 'bg-green-100 text-green-800 border-green-300', Icon: CheckCircle2 },
  payment_required: { label: 'Payment method required', className: 'bg-red-100 text-red-800 border-red-300', Icon: XCircle },
  out_of_credit: { label: 'Out of credit', className: 'bg-red-100 text-red-800 border-red-300', Icon: XCircle },
  not_configured: { label: 'Not configured', className: 'bg-gray-100 text-gray-800 border-gray-300', Icon: AlertTriangle },
  error: { label: 'Error', className: 'bg-amber-100 text-amber-800 border-amber-300', Icon: AlertTriangle },
};

const numberFmt = new Intl.NumberFormat('en-IN');
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 });

// Costs are priced per routed model (see lib/ai-pricing.ts) — Abacus bills each call
// under the model it routed to, at that model's rate. The server sums them per period.

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
            <Sparkles className="h-6 w-6 text-emerald-600" /> AI Usage & Credit
          </h1>
          <p className="text-muted-foreground">AI bill-extraction consumption and provider status (Abacus RouteLLM). Costs are priced per routed model at Abacus's own rates; calls recorded before the model was written down are estimated at the GPT-4.1 rate.</p>
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
            What this page can and cannot tell you. It <b>can</b> show every AI call the app made, with its tokens, by feature.
            It <b>cannot</b> show the rupee balance: Abacus has no API for it and only says when credit has run out. The
            balance lives in the Abacus dashboard; the check below tells you whether AI calls are working right now.
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
              className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1"
            >
              Open Abacus dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {status && <p className="text-sm text-muted-foreground">{status.detail}</p>}
        </CardContent>
      </Card>

      {/* Usage stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tokens today" value={usage ? numberFmt.format(usage.today.tokens) : '—'} sub={usage ? `${numberFmt.format(usage.today.calls)} calls · ${usdFmt.format(usage.today.costUsd || 0)}` : ''} />
        <StatCard title="Tokens this month" value={usage ? numberFmt.format(usage.month.tokens) : '—'} sub={usage ? `${numberFmt.format(usage.month.calls)} calls · ${usdFmt.format(usage.month.costUsd || 0)}` : ''} />
        <StatCard title="Tokens all-time" value={usage ? numberFmt.format(usage.total.tokens) : '—'} sub={usage ? `${numberFmt.format(usage.total.calls)} calls · ${usdFmt.format(usage.total.costUsd || 0)}` : ''} />
        <StatCard title="Failed calls" value={usage ? numberFmt.format(usage.total.failures) : '—'} sub={usage?.lastFailureAt ? `last ${format(new Date(usage.lastFailureAt), 'dd MMM, HH:mm')}` : 'none'} />
      </div>

      {/* Which feature is spending it */}
      <Card>
        <CardHeader>
          <CardTitle>This month, by feature</CardTitle>
          <CardDescription>Where the tokens went. Seven features call the provider; each is listed when it has been used this month.</CardDescription>
        </CardHeader>
        <CardContent>
          {usage?.untokenedCalls ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {numberFmt.format(usage.untokenedCalls)} successful {usage.untokenedCalls === 1 ? 'call' : 'calls'} this month
              carried no token count, so the totals are an undercount by that much. (Before 22 Aug 2026 three features
              recorded their calls as 0 tokens and three recorded nothing at all; both are fixed from that date.)
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage && usage.byOperation.length > 0 ? (
                usage.byOperation.map((row) => (
                  <TableRow key={row.operation}>
                    <TableCell>
                      {OPERATION_LABEL[row.operation] || row.operation}
                      <span className="block text-xs text-muted-foreground">{row.operation}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{numberFmt.format(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numberFmt.format(row.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{usdFmt.format(row.costUsd || 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.failures ? <span className="text-red-700">{numberFmt.format(row.failures)}</span> : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usage.month.tokens > 0 ? `${((row.tokens / usage.month.tokens) * 100).toFixed(0)}%` : '—'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {loading ? 'Loading…' : 'No AI calls this month.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Which model answered — the same cut as the Abacus usage page, for checking against the bill */}
      <Card>
        <CardHeader>
          <CardTitle>By model this month</CardTitle>
          <CardDescription>Abacus bills each call under the model it routed to. Lay this beside the Abacus usage page to check the estimate.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">In tokens</TableHead>
                <TableHead className="text-right">Out tokens</TableHead>
                <TableHead className="text-right">Rate (in / out per 1K)</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage && usage.byModel && usage.byModel.length > 0 ? (
                usage.byModel.map((row) => {
                  const { rate } = rateForModel(row.model);
                  return (
                    <TableRow key={row.model}>
                      <TableCell>
                        {row.label}
                        <span className="block text-xs text-muted-foreground">{row.model}{row.known ? '' : ' · rate estimated'}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{numberFmt.format(row.calls)}</TableCell>
                      <TableCell className="text-right tabular-nums">{numberFmt.format(row.promptTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{numberFmt.format(row.completionTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">${rate.input.toFixed(4)} / ${rate.output.toFixed(4)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{usdFmt.format(row.costUsd || 0)}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {loading ? 'Loading…' : 'No AI calls this month.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                <TableHead className="text-right">In tokens</TableHead>
                <TableHead className="text-right">Out tokens</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage && usage.recent.length > 0 ? (
                usage.recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(row.createdAt), 'dd MMM, HH:mm:ss')}</TableCell>
                    <TableCell>{OPERATION_LABEL[row.operation] || row.operation}</TableCell>
                    <TableCell className="text-xs">{row.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{numberFmt.format(row.promptTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numberFmt.format(row.completionTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{usdFmt.format(estimateCostUsd(row.model, row.promptTokens, row.completionTokens))}</TableCell>
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
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
