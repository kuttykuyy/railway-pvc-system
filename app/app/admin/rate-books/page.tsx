'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Search, Download, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface RateBookRow {
  edition: string;
  code: string;
  subHead: string;
  subHeadName: string;
  description: string;
  unit: string;
  rate: number | null;
}

/**
 * Browse the published schedules of rates the app has loaded.
 *
 * This is where you check what the classifier actually read for an item: paste the code
 * off the bill and see the wording the book carries for it, which is the wording the
 * bill itself does not print.
 */
export default function RateBooksPage() {
  const [query, setQuery] = useState('');
  const [edition, setEdition] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RateBookRow[]>([]);
  const [editions, setEditions] = useState<Array<{ edition: string; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [notLoaded, setNotLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (searchPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(searchPage) });
      if (query.trim()) params.set('q', query.trim());
      if (edition) params.set('edition', edition);
      const res = await fetch(`/api/admin/dsr-items?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setRows(data.items || []);
      setEditions(data.editions || []);
      setTotal(data.total || 0);
      setPageSize(data.pageSize || 50);
      setNotLoaded(Boolean(data.notLoaded));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [query, edition, page]);

  useEffect(() => { load(1); setPage(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [edition]);
  useEffect(() => { load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/admin/dsr-items/import', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      toast.success(data.message || 'Loaded');
      await load(1);
      setPage(1);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  };

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-slate-600" />
          <h1 className="text-xl font-semibold">Schedules of rates</h1>
        </div>
        <Button onClick={runImport} disabled={importing}>
          <Download className="h-4 w-4 mr-1.5" />
          {importing ? 'Loading…' : 'Load / refresh books'}
        </Button>
      </div>

      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        A bill cites an item number and prints only the line that distinguishes the sub-item.
        The wording of the work itself lives in these books, and this is where the app reads it
        from when it classifies. Paste a code off a bill to see exactly what it read.
      </p>

      {notLoaded && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            No schedule is loaded yet. Apply the pending database change, then press
            <span className="font-medium"> Load / refresh books</span>.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-2 flex-1 min-w-[280px]">
          <Input
            placeholder="Item code (082011, 5.35) or words from the description"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { setPage(1); load(1); } }}
          />
          <Button variant="outline" onClick={() => { setPage(1); load(1); }} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={edition === '' ? 'default' : 'outline'} onClick={() => setEdition('')}>
            All
          </Button>
          {editions.map(row => (
            <Button
              key={row.edition}
              size="sm"
              variant={edition === row.edition ? 'default' : 'outline'}
              onClick={() => setEdition(row.edition)}
            >
              {row.edition} <span className="ml-1.5 opacity-60">{row.count}</span>
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-slate-600">
            {loading ? 'Searching…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Chapter</th>
                  <th className="px-3 py-2 font-medium">Description of work</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => (
                  <tr key={`${row.edition}-${row.code}`} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {row.code}
                      <span className="block text-[11px] font-normal text-slate-400">{row.edition}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                      <Badge variant="outline" className="font-normal">{row.subHead}</Badge>
                      <span className="block mt-1">{row.subHeadName}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700 leading-relaxed">{row.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{row.unit || '—'}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                      Nothing matched.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading}
            onClick={() => { const next = page - 1; setPage(next); load(next); }}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-slate-500">Page {page} of {lastPage}</span>
          <Button variant="outline" size="sm" disabled={page >= lastPage || loading}
            onClick={() => { const next = page + 1; setPage(next); load(next); }}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
