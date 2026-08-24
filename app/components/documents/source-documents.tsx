'use client';

import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';

/**
 * The PDF a bill or contract was read from, when one is still being held.
 *
 * Renders nothing at all when there is nothing kept — which is most of the time at
 * first, and always for records typed in by hand. A heading over an empty box would
 * read as something broken.
 */

interface KeptDocument {
  id: number;
  kind: string;
  fileName: string;
  byteSize: number;
  createdAt: string;
  expiresAt: string;
  hasFile: boolean;
  note: string | null;
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function SourceDocuments({ billId, contractId }: { billId?: string; contractId?: string }) {
  const [documents, setDocuments] = useState<KeptDocument[] | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  /** Delete a kept file before its ninety days are up. The privacy policy promises this. */
  const remove = async (id: number) => {
    if (!confirm('Delete this file? The bill and its figures are not affected.')) return;
    setRemoving(id);
    try {
      const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (response.ok) setDocuments(current => (current || []).filter(doc => doc.id !== id));
    } finally {
      setRemoving(null);
    }
  };

  useEffect(() => {
    if (!billId && !contractId) return;
    const query = billId ? `billId=${encodeURIComponent(billId)}` : `contractId=${encodeURIComponent(contractId!)}`;
    let cancelled = false;
    fetch(`/api/documents?${query}`)
      .then(response => (response.ok ? response.json() : { documents: [] }))
      .then(json => { if (!cancelled) setDocuments(json.documents || []); })
      // Silent: the file is a convenience, and the table may not be applied yet.
      .catch(() => { if (!cancelled) setDocuments([]); });
    return () => { cancelled = true; };
  }, [billId, contractId]);

  if (!documents || documents.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-semibold text-slate-800">Uploaded document</h3>
      <p className="mb-3 text-xs text-slate-500">
        The file this was read from. Uploads are kept for 90 days, then deleted.
      </p>
      <ul className="space-y-2">
        {documents.map(doc => (
          <li key={doc.id} className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-800">{doc.fileName}</p>
              <p className="text-[11px] text-slate-500">
                {doc.kind === 'agreement' ? 'Agreement / LOA' : 'Bill'}
                {formatSize(doc.byteSize) ? ` · ${formatSize(doc.byteSize)}` : ''}
                {` · deleted in ${daysLeft(doc.expiresAt)} day${daysLeft(doc.expiresAt) === 1 ? '' : 's'}`}
              </p>
              {!doc.hasFile && doc.note && (
                <p className="mt-1 text-[11px] text-amber-700">{doc.note}</p>
              )}
            </div>
            {doc.hasFile && (
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/api/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Open
                </a>
                <a
                  href={`/api/documents/${doc.id}?download=1`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3 w-3" />
                  Save
                </a>
                <button
                  type="button"
                  onClick={() => remove(doc.id)}
                  disabled={removing === doc.id}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                >
                  {removing === doc.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
