'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Delete a bill from a server-rendered table.
 *
 * The contract page's bills table is server-rendered and offered no way to delete —
 * the only path was hunting the bill down on the bills list. This is the one
 * interactive cell: confirm, delete, refresh the page data. The API enforces who may
 * delete; this button just asks.
 */
export function DeleteBillButton({ billId, billNo }: { billId: string; billNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete bill ${billNo}? This cannot be undone, and a used free-trial bill is not returned.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bills/${billId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not delete the bill.');
        return;
      }
      toast.success(`Bill ${billNo} deleted.`);
      router.refresh();
    } catch {
      toast.error('Could not delete the bill. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      title="Delete bill"
      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors inline-flex disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
