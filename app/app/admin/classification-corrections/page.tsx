'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { CorrectionsReport } from '@/lib/classification-corrections';

/**
 * Which classifications people keep having to correct.
 *
 * The app's accuracy measured from real bills, not guessed at: every entry records the
 * code the app proposed as well as the one that was accepted, so the corrections
 * themselves say where the rules are wrong and how much money is behind each one.
 */
export default function ClassificationCorrectionsPage() {
  const [report, setReport] = useState<CorrectionsReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/classification-corrections');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Report failed');
      setReport(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Classifications people corrected</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every entry records what the app suggested and what was accepted. Where they differ, someone
            looked at the item and decided the app was wrong. The move at the top is the rule worth fixing next.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {report && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Corrected</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{report.corrected}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Accepted as suggested</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{report.accepted}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Correction rate</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {report.correctionRate === null ? '—' : `${(report.correctionRate * 100).toFixed(1)}%`}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {report && report.moves.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {report.accepted === 0
              ? 'No bills have been classified since corrections started being recorded. This fills up as bills are processed.'
              : 'Nothing has been corrected yet. Every classification the app suggested was accepted as it stood.'}
          </CardContent>
        </Card>
      )}

      {report?.moves.map(move => (
        <Card key={`${move.suggested}->${move.accepted}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-amber-600" />
              <span className="font-mono">{move.suggested}</span>
              <span className="text-muted-foreground">changed to</span>
              <span className="font-mono">{move.accepted}</span>
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {move.count} {move.count === 1 ? 'entry' : 'entries'} · {rupees(move.amount)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {move.items.map(item => (
                <li key={item.itemNumber} className="flex gap-3">
                  <span className="font-mono shrink-0 w-24 text-muted-foreground">{item.itemNumber}</span>
                  <span className="shrink-0 w-10 text-muted-foreground">×{item.count}</span>
                  <span className="truncate">{item.description}</span>
                </li>
              ))}
              {move.items.length === 0 && (
                <li className="text-muted-foreground">No item numbers recorded on these entries.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
