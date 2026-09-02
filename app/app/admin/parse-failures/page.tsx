'use client';

/**
 * The reader's failure queue. Every PDF that would not read sits here with its exact
 * error — download it, get it fixed, delete the row. What used to be "please send this
 * PDF to support" is now a table that filled itself.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Trash2, RefreshCw, Mail, Check, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface Failure {
  id: number;
  createdAt: string;
  userEmail: string | null;
  fileName: string | null;
  error: string;
  hasPdf: boolean;
  /** They pressed "Ask IR-PVC to check this bill" — somebody is waiting. */
  reviewRequested?: boolean;
  replied?: boolean;
  lastReply?: string | null;
}

interface ReplyTemplate {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export default function ParseFailuresPage() {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Which row's reply box is open, and what is in it. */
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  /** A line for the AI to build the reply around — "this is an MB, not the bill". */
  const [hint, setHint] = useState('');
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/parse-failures');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load');
      setFailures(data.failures || []);
      setTemplates(data.templates || []);
      setNote(data.note || null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReply = (failure: Failure) => {
    setReplyTo(failure.id);
    // Opens on the ready-made answer rather than a blank box: almost every reply is one
    // of two, and a blank box is what turns a two-minute job into a tomorrow job.
    const first = templates[0];
    setSubject(first?.subject || 'About your bill — IR-PVC');
    setMessage(first?.body || '');
    setHint('');
  };

  const draftWithAi = async (id: number) => {
    setDrafting(true);
    try {
      const res = await fetch('/api/admin/parse-failures/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, hint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not draft');
      setSubject(data.subject);
      setMessage(data.body);
      toast.success(data.sawPdfText ? 'Drafted from the error and the PDF text. Read it before sending.' : 'Drafted from the error. Read it before sending.');
    } catch (e: any) {
      toast.error(e.message, { duration: 8000 });
    } finally {
      setDrafting(false);
    }
  };

  const send = async (id: number) => {
    setSending(true);
    try {
      const res = await fetch('/api/admin/parse-failures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, subject, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send');
      toast.success(data.stamped
        ? `Sent to ${data.sentTo}`
        : `Sent to ${data.sentTo} — but this row could not be marked as replied.`);
      setReplyTo(null);
      load();
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this failure record (and its stored PDF)?')) return;
    const res = await fetch(`/api/admin/parse-failures?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Deleted'); load(); }
    else toast.error('Could not delete');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Parse failures</h1>
          <p className="text-sm text-muted-foreground">
            PDFs the bill reader could not read, collected automatically with their exact errors.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {note && <p className="text-sm text-amber-700">{note}</p>}
      {!loading && failures.length === 0 && !note && (
        <p className="text-sm text-muted-foreground">No failures collected — the reader is holding.</p>
      )}

      <div className="space-y-3">
        {failures.map(f => (
          <div key={f.id} className="border rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{f.fileName || '(unnamed PDF)'}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleString('en-IN')} · {f.userEmail || 'unknown user'}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {f.reviewRequested && !f.replied && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Waiting for an answer
                    </span>
                  )}
                  {f.replied && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      <Check className="h-3 w-3" /> Replied
                    </span>
                  )}
                </div>
                {f.replied && f.lastReply && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">Last said: {f.lastReply}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {f.userEmail && (
                  <Button variant="outline" size="sm" onClick={() => openReply(f)}>
                    <Mail className="h-4 w-4 mr-1" />{f.replied ? 'Reply again' : 'Reply'}
                  </Button>
                )}
                {f.hasPdf && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/admin/parse-failures?id=${f.id}`}>
                      <Download className="h-4 w-4 mr-1" />PDF
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => remove(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {replyTo === f.id && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">
                  Emailing <strong>{f.userEmail}</strong>
                  {f.fileName ? <> about <strong>{f.fileName}</strong></> : null}
                </p>

                {templates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {templates.map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => { setSubject(t.subject); setMessage(t.body); }}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                          message === t.body
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* A custom reply, written by the AI from the exact error, the PDF's own
                    text and whatever the admin wants said. It lands in the boxes below
                    for editing; nothing goes out until Send. */}
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-2 sm:flex-row sm:items-center">
                  <input
                    value={hint}
                    onChange={e => setHint(e.target.value)}
                    placeholder="Optional: what to tell them, e.g. “this is the Measurement Book, not the bill”"
                    className="flex-1 rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs"
                    disabled={drafting}
                  />
                  <Button size="sm" variant="outline" onClick={() => draftWithAi(f.id)} disabled={drafting || sending}
                    className="border-violet-300 text-violet-800 hover:bg-violet-100">
                    {drafting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Drafting…</> : <><Sparkles className="h-4 w-4 mr-1" />Draft with AI</>}
                  </Button>
                </div>

                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={9}
                  placeholder="What you want to say. Blank lines make paragraphs."
                  className="mt-2 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Sent from noreply@irpvc.in, and their reply comes back to it. The row is
                  marked replied only if the email actually goes.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => send(f.id)} disabled={sending || message.trim().length < 10}>
                    {sending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Sending…</> : <><Mail className="h-4 w-4 mr-1" />Send</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReplyTo(null)} disabled={sending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <pre className="mt-2 text-xs text-red-800 bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{f.error}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
