'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Loader2, FileUp, ArrowRight,
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────── */
interface ParsedRow {
  rowIndex: number;
  agreementNo: string;
  loaNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: string;
  contractValue: string;
  tenderAdvertisedValue: string;
  completionPeriodMonths: string;
  _error?: string;
}

interface ImportResult {
  rowIndex: number;
  agreementNo: string;
  status: 'success' | 'error';
  error?: string;
}

const REQUIRED_COLS = ['agreementNo', 'contractorName', 'workDescription', 'dateOfOpening'];
const ALL_COLS = [
  { key: 'agreementNo', label: 'Agreement No *', example: 'SC/P/AGR/2024/001' },
  { key: 'loaNo', label: 'LOA No', example: 'LOA/2024/100' },
  { key: 'contractorName', label: 'Contractor Name *', example: 'M/s ABC Constructions' },
  { key: 'workDescription', label: 'Work Description *', example: 'Construction of platform...' },
  { key: 'dateOfOpening', label: 'Date of Opening *', example: '15-06-2024' },
  { key: 'contractValue', label: 'Contract Value (₹)', example: '5000000' },
  { key: 'tenderAdvertisedValue', label: 'Tender Advertised Value (₹)', example: '4800000' },
  { key: 'completionPeriodMonths', label: 'Completion Period (months)', example: '18' },
];

/* ── Template download ──────────────────────────────────────────────── */
async function downloadTemplate() {
  const XLSX = await import('xlsx'); // loaded on demand — keeps xlsx (~1 MB) out of the initial bundle
  const ws = XLSX.utils.aoa_to_sheet([
    ALL_COLS.map(c => c.label),
    ALL_COLS.map(c => c.example),
  ]);
  ws['!cols'] = ALL_COLS.map(() => ({ wch: 28 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
  XLSX.writeFile(wb, 'contracts_import_template.xlsx');
}

/* ── Row validation ─────────────────────────────────────────────────── */
function validateRow(row: ParsedRow): string | null {
  if (!row.agreementNo?.trim()) return 'Agreement No is required';
  if (!row.contractorName?.trim()) return 'Contractor Name is required';
  if (!row.workDescription?.trim()) return 'Work Description is required';
  if (!row.dateOfOpening?.trim()) return 'Date of Opening is required (DD-MM-YYYY)';
  return null;
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function ContractImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);

  /* ── Parse uploaded file ────────────────────────────────────────── */
  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx'); // on-demand — only when a file is actually picked
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (raw.length < 2) {
          toast.error('File is empty or has no data rows');
          return;
        }

        // First row = headers — map to known keys
        const headers: string[] = (raw[0] as string[]).map(h =>
          ALL_COLS.find(c => c.label.replace(' *', '').toLowerCase() === String(h).replace(' *', '').toLowerCase())?.key || ''
        );

        const parsed: ParsedRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i] as any[];
          // Skip completely empty rows
          if (r.every(cell => cell === '' || cell == null)) continue;

          const obj: any = { rowIndex: i };
          headers.forEach((key, idx) => {
            if (key) obj[key] = r[idx] != null ? String(r[idx]).trim() : '';
          });

          // Handle date object from xlsx
          if (obj.dateOfOpening instanceof Date) {
            const d = obj.dateOfOpening as Date;
            obj.dateOfOpening = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
          }

          obj._error = validateRow(obj as ParsedRow) || undefined;
          parsed.push(obj as ParsedRow);
        }

        if (parsed.length === 0) {
          toast.error('No data rows found in the file');
          return;
        }

        setRows(parsed);
        setStep('preview');
      } catch {
        toast.error('Failed to parse file. Please use the template.');
      }
    };
    // Without this a file the browser cannot read — locked by another program, on a
    // drive that has gone away, blocked by permissions — ran no handler at all: no
    // message, no change on screen, nothing to suggest the click had registered.
    reader.onerror = () => {
      toast.error(
        `${file.name} could not be read. If it is open in Excel, close it and try again.`,
        { duration: 8000 },
      );
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  /* ── Submit import ──────────────────────────────────────────────── */
  const handleImport = async () => {
    const validRows = rows.filter(r => !r._error);
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    setImporting(true);
    try {
      const payload = validRows.map(r => ({
        rowIndex: r.rowIndex,
        agreementNo: r.agreementNo,
        loaNo: r.loaNo || undefined,
        contractorName: r.contractorName,
        workDescription: r.workDescription,
        dateOfOpening: r.dateOfOpening,
        contractValue: r.contractValue ? Number(r.contractValue.replace(/,/g, '')) : undefined,
        tenderAdvertisedValue: r.tenderAdvertisedValue ? Number(r.tenderAdvertisedValue.replace(/,/g, '')) : undefined,
        completionPeriodMonths: r.completionPeriodMonths ? Number(r.completionPeriodMonths) : undefined,
      }));

      const res = await fetch('/api/contracts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Import failed');
        return;
      }

      setResults(data.results);
      setStep('result');

      if (data.succeeded > 0) {
        toast.success(`${data.succeeded} contract${data.succeeded > 1 ? 's' : ''} imported successfully`);
      }
    } catch {
      toast.error('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const errorRows = rows.filter(r => r._error);
  const validRows = rows.filter(r => !r._error);
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-emerald-100 p-2.5">
          <FileSpreadsheet className="h-6 w-6 text-emerald-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Import Contracts</h1>
          <p className="text-sm text-slate-500">Upload an Excel or CSV file to bulk-import contracts</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        {(['upload', 'preview', 'result'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s ? 'bg-emerald-600 text-white' : i < ['upload', 'preview', 'result'].indexOf(step) ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {i + 1}
            </div>
            <span className={step === s ? 'text-slate-800' : 'text-slate-400'}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 2 && <ArrowRight className="h-3 w-3 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Template download */}
          <Card className="border-slate-100 rounded-2xl">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Download Template First</p>
                <p className="text-xs text-slate-500 mt-0.5">Fill in the Excel template — columns with * are required</p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="rounded-xl gap-2 shrink-0">
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {/* Column reference */}
          <Card className="border-slate-100 rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm">Required Columns</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_COLS.map(c => (
                  <div key={c.key} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${REQUIRED_COLS.includes(c.key) ? 'bg-red-500' : 'bg-slate-300'}`} />
                    <div>
                      <span className="font-semibold text-slate-700">{c.label.replace(' *', '')}</span>
                      {REQUIRED_COLS.includes(c.key) && <span className="text-red-500 ml-1">*</span>}
                      <span className="text-slate-400 ml-1">e.g. {c.example}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'}`}
          >
            <FileUp className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-700 text-center">Drop your Excel or CSV file here</p>
            <p className="text-xs text-slate-400 mt-1 text-center">or click to browse · Max 200 rows</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ───────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-sm font-semibold text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {validRows.length} valid
            </div>
            {errorRows.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">
                <XCircle className="h-4 w-4" />
                {errorRows.length} with errors (will be skipped)
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600 w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Agreement No</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Contractor</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600 max-w-[200px]">Work Description</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Date of Opening</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Contract Value</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.rowIndex} className={`border-b border-slate-50 ${row._error ? 'bg-red-50/50' : 'hover:bg-slate-50/50'}`}>
                    <td className="px-3 py-2 text-slate-400">{row.rowIndex}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{row.agreementNo || <span className="text-red-400 italic">missing</span>}</td>
                    <td className="px-3 py-2 text-slate-700">{row.contractorName || <span className="text-red-400 italic">missing</span>}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{row.workDescription || <span className="text-red-400 italic">missing</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.dateOfOpening || <span className="text-red-400 italic">missing</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.contractValue ? `₹${Number(row.contractValue).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-3 py-2">
                      {row._error
                        ? <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="h-3 w-3" />{row._error}</span>
                        : <span className="inline-flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="h-3 w-3" />Ready</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setRows([]); setStep('upload'); }} className="rounded-xl">
              <Upload className="h-4 w-4 mr-2" />
              Upload Different File
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {importing ? <><Loader2 className="h-4 w-4 animate-spin" />Importing…</> : <>{`Import ${validRows.length} Contract${validRows.length !== 1 ? 's' : ''}`}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ────────────────────────────────────────── */}
      {step === 'result' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center">
              <p className="text-3xl font-black text-green-700">{succeeded}</p>
              <p className="text-sm font-semibold text-green-600 mt-1">Imported successfully</p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center">
              <p className="text-3xl font-black text-red-700">{failed}</p>
              <p className="text-sm font-semibold text-red-600 mt-1">Failed</p>
            </div>
          </div>

          {/* Detailed results */}
          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Agreement No</th>
                  <th className="px-3 py-2.5 text-left font-bold text-slate-600">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.rowIndex} className={`border-b border-slate-50 ${r.status === 'error' ? 'bg-red-50/50' : ''}`}>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{r.agreementNo}</td>
                    <td className="px-3 py-2">
                      {r.status === 'success'
                        ? <span className="inline-flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="h-3 w-3" />Imported</span>
                        : <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><XCircle className="h-3 w-3" />{r.error}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end">
            {failed > 0 && (
              <Button variant="outline" onClick={() => { setRows([]); setResults([]); setStep('upload'); }} className="rounded-xl">
                Import Again
              </Button>
            )}
            <Button onClick={() => router.push('/contracts')} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
              View Contracts
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
