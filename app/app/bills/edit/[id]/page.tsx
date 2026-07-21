'use client';

import { useState, useEffect, Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Save, Calendar, Info, AlertTriangle } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import { toast } from 'react-hot-toast';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { scheduleNames } from '@/lib/contract-schedules';

interface ClassificationEntry {
  subClassificationId: string;
  subClassification?: any;
  amount: number | string | '';
  description?: string;
  classificationJustification?: string;
  steelTypes?: string[];
  scheduleItem?: string;
  itemNumber?: string;
  quantity?: number | string | '';
  agreementRate?: number | string | '';
  itemRows?: any[];
}

function EditBillPageContent() {
  const router = useRouter();
  const params = useParams();
  const billId = params?.id as string;

  const [bill, setBill] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [classificationEntries, setClassificationEntries] = useState<ClassificationEntry[]>([]);
  const [nonScheduleItems, setNonScheduleItems] = useState<Array<{ description: string; amount: string }>>([]);

  const [form, setForm] = useState({
    contractId: '', billNo: '', dateOfMeasurement: '', zone: '',
    fuelPriceType: 'four_city_avg', isFinalPvc: false, dateOfCompletion: '',
    pvcNumber: '', cementAmount: '', steelTmtBarsAmount: '',
  });

  useEffect(() => {
    if (!billId) return;
    Promise.all([
      fetch(`/api/bills/${billId}`).then(r => r.json()),
      fetch('/api/contracts').then(r => r.json()),
      fetch('/api/classification-groups').then(r => r.json()),
    ]).then(([billData, contractsData, groupsData]) => {
      setBill(billData);
      setContracts(contractsData);
      setClassificationGroups(groupsData.groups || groupsData);
      setForm({
        contractId: billData.contractId || '',
        billNo: billData.billNo || '',
        dateOfMeasurement: billData.dateOfMeasurement?.split('T')[0] || '',
        zone: billData.zone || '',
        fuelPriceType: billData.fuelPriceType || 'four_city_avg',
        isFinalPvc: billData.isFinalPvc || false,
        dateOfCompletion: billData.dateOfCompletion?.split('T')[0] || '',
        pvcNumber: billData.pvcNumber || '',
        cementAmount: billData.cementAmount?.toString() || '',
        steelTmtBarsAmount: billData.steelTmtBarsAmount?.toString() || '',
      });
      if (billData.classificationEntries?.length > 0) {
        setClassificationEntries(billData.classificationEntries.map((e: any) => ({
          subClassificationId: e.subClassificationId || '',
          amount: e.amount || 0,
          description: e.description || '',
          classificationJustification: e.classificationJustification || '',
          scheduleItem: e.scheduleItem || '',
          steelTypes: e.steelTypes || [],
          itemRows: e.itemRows || undefined,
        })));
      }
      if (billData.nonScheduleItems?.length > 0) {
        setNonScheduleItems(billData.nonScheduleItems.map((i: any) => ({
          description: i.description || '',
          amount: i.amount?.toString() || '',
        })));
      }
    }).catch(e => setError(e.message)).finally(() => setIsLoading(false));
  }, [billId]);

  const totalClassification = classificationEntries.reduce((s, e) => {
    const a = e.amount === '' || e.amount == null ? 0 : typeof e.amount === 'string' ? parseFloat(e.amount) || 0 : e.amount;
    return s + a;
  }, 0);
  const nonScheduleTotal = nonScheduleItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const netBillAmount = totalClassification - nonScheduleTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.billNo || !form.dateOfMeasurement || classificationEntries.length === 0) {
      setError('Bill number, measurement date and at least one classification are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/bills/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          contractId: bill.contractId, // immutable
          grossBillAmount: totalClassification,
          billAmount: netBillAmount,
          classificationEntries: classificationEntries.map(e => ({
            subClassificationId: e.subClassificationId,
            amount: e.amount,
            description: e.description || '',
            classificationJustification: e.classificationJustification || null,
            steelTypes: e.steelTypes || [],
            scheduleItem: e.scheduleItem || null,
            itemRows: e.itemRows?.length ? e.itemRows.map((r: any) => ({
              itemNumber: r.itemNumber || '',
              quantity: r.quantity === '' ? null : parseFloat(String(r.quantity)) || null,
              agreementRate: r.agreementRate === '' ? null : parseFloat(String(r.agreementRate)) || null,
            })) : null,
          })),
          nonScheduleItems: nonScheduleItems.filter(i => i.description && i.amount).map(i => ({
            description: i.description.trim(),
            amount: parseFloat(i.amount) || 0,
          })),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update'); }
      const updated = await res.json();
      toast.success(`Bill ${updated.billNo} updated`);
      router.push('/bills');
    } catch (err: any) {
      setError(err.message || 'Failed to update bill');
    } finally {
      setSaving(false);
    }
  };

  const selectedContract = contracts.find(c => c.id === form.contractId);

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading bill..." /></div>;

  if (!bill) return (
    <div className="text-center py-16 text-gray-500">
      <p>Bill not found.</p>
      <BackButton href="/bills" label="Back to Bills" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton href="/bills" label="Bills" variant="outline" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit Bill — {bill.billNo}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Created {format(toISTDate(new Date(bill.createdAt)), 'dd MMM yyyy')}
              · Last updated {format(toISTDate(new Date(bill.updatedAt)), 'dd MMM yyyy')}
              · Quarter {bill.quarter}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
          <AlertTriangle className="h-3.5 w-3.5" /> Edit Mode
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Contract (read-only) */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Contract</h2>
          <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-600">
            {selectedContract ? `${selectedContract.agreementNo} — ${selectedContract.contractorName}` : form.contractId}
            <span className="ml-2 text-xs text-gray-400">(cannot be changed)</span>
          </div>
        </div>

        {/* Basic info */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Bill Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-600">Bill Number *</Label>
              <Input value={form.billNo} onChange={e => setForm(p => ({ ...p, billNo: e.target.value }))}
                placeholder="e.g. RA/001/2024" required className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">PVC Number</Label>
              <Input value={form.pvcNumber} onChange={e => setForm(p => ({ ...p, pvcNumber: e.target.value }))}
                placeholder="e.g. PVC/2024/001" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Date of Measurement *</Label>
              <Input type="date" value={form.dateOfMeasurement}
                onChange={e => setForm(p => ({ ...p, dateOfMeasurement: e.target.value }))}
                onKeyDown={e => e.preventDefault()} required className="mt-1 cursor-pointer" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Railway Zone</Label>
              <Select value={form.zone || undefined} onValueChange={v => setForm(p => ({ ...p, zone: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>
                  {getRailwayZoneOptions().map(z => <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.zone && <p className="text-xs text-gray-400 mt-1">Steel city: {getSteelCityForZone(form.zone)}</p>}
            </div>
            <div>
              <Label className="text-xs text-gray-600">Fuel Price Basis</Label>
              <Select value={form.fuelPriceType} onValueChange={v => setForm(p => ({ ...p, fuelPriceType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="four_city_avg">Average of 4 Cities</SelectItem>
                  <SelectItem value="zone_city">Zone City ({form.zone ? getSteelCityForZone(form.zone) : '...'})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="isFinalPvc" checked={form.isFinalPvc}
                onChange={e => setForm(p => ({ ...p, isFinalPvc: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="isFinalPvc" className="text-sm cursor-pointer">This is a Final PVC</Label>
            </div>
            {form.isFinalPvc && (
              <div>
                <Label className="text-xs text-gray-600">Date of Completion *</Label>
                <Input type="date" value={form.dateOfCompletion}
                  onChange={e => setForm(p => ({ ...p, dateOfCompletion: e.target.value }))}
                  onKeyDown={e => e.preventDefault()} required className="mt-1 cursor-pointer" />
              </div>
            )}
          </div>
        </div>

        {/* Classifications */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Work Classifications *</h2>
          <BillClassificationEntries
            value={classificationEntries}
            onChange={setClassificationEntries}
            classificationGroups={classificationGroups}
            workDescription={selectedContract?.workDescription}
            contractSchedules={scheduleNames(selectedContract?.schedules)}
            contractId={form.contractId || undefined}
            measurementDate={form.dateOfMeasurement || undefined}
            aiJustificationFee={99}
          />
        </div>

        {/* Dedicated components */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Dedicated Components <span className="text-gray-400 font-normal">(optional, 85% PVC)</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-600">Cement Work Amount (₹)</Label>
              <div className="flex gap-2 mt-1">
                <Input type="number" step="0.01" value={form.cementAmount}
                  onChange={e => setForm(p => ({ ...p, cementAmount: e.target.value }))} placeholder="0.00" />
                <BillAmountCalculator onInsertTotal={t => setForm(p => ({ ...p, cementAmount: t.toString() }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-600">TMT Bars (₹)</Label>
              <div className="flex gap-2 mt-1">
                <Input type="number" step="0.01" value={form.steelTmtBarsAmount}
                  onChange={e => setForm(p => ({ ...p, steelTmtBarsAmount: e.target.value }))} placeholder="0.00" />
                <BillAmountCalculator onInsertTotal={t => setForm(p => ({ ...p, steelTmtBarsAmount: t.toString() }))} />
              </div>
            </div>
          </div>
        </div>

        {/* Amount summary */}
        {classificationEntries.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Total Classification Amount</span>
              <span className="font-medium">₹{totalClassification.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
            {nonScheduleTotal > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Less: Non-Schedule Items</span>
                <span>-₹{nonScheduleTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Net Bill Amount (for PVC)</span>
              <span>₹{netBillAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> PVC will be recalculated on save
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.back()}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSaving || !form.billNo || !form.dateOfMeasurement || classificationEntries.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {isSaving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Update Bill'}
            </button>
          </div>
        </div>
      </form>

      {/* Validation and Error Modal Popup */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 animate-in fade-in zoom-in">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center space-y-4">
              <div className="relative inline-flex items-center justify-center p-4 bg-red-50 rounded-2xl text-red-600 shadow-sm animate-bounce">
                <AlertTriangle className="h-8 w-8 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Validation Error</h2>
                <div className="text-sm text-slate-700 max-h-[30vh] overflow-y-auto leading-relaxed text-left bg-slate-50 border border-slate-100 rounded-xl p-4 mt-2 font-semibold whitespace-pre-line shadow-inner">
                  {error}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setError('')}
                className="w-full h-11 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl shadow-md transition-all active:scale-[0.98] inline-flex items-center justify-center"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditBillPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading..." /></div>}>
      <EditBillPageContent />
    </Suspense>
  );
}
