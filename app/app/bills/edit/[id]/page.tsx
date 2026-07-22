'use client';

import { useState, useEffect, Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Save, Calendar, Info, AlertTriangle, Building2, ClipboardList, Package, Layers, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import { toast } from 'react-hot-toast';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { DsrCementCalculator, type CementSchedule } from '@/components/bills/dsr-cement-calculator';
import { scheduleNames, normalizeSchedules } from '@/lib/contract-schedules';
import { inferMainClassification } from '@/lib/work-classification';
import { applyCementSplit, type CementBreakdownItem } from '@/lib/cement-split';

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
  isDerivedCement?: boolean;
  manualClassification?: boolean;
}

const STEEL_FIELDS = [
  { key: 'steelTmtBarsAmount', label: 'TMT Bars (Rs)' },
  { key: 'steelAngleChannelAmount', label: 'Angle / Channel (Rs)' },
  { key: 'steelPlatesAmount', label: 'Plates (Rs)' },
  { key: 'steelOtherSectionsAmount', label: 'Other Sections (Rs)' },
] as const;

const TABS = [
  { id: 'basic', label: 'Basics', icon: Building2 },
  { id: 'classification', label: 'Work & items', icon: ClipboardList },
  { id: 'cement', label: 'Cement & steel', icon: Package },
  { id: 'optional', label: 'Optional', icon: Layers },
];

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
  const [activeTab, setActiveTab] = useState('basic');
  const [classificationEntries, setClassificationEntries] = useState<ClassificationEntry[]>([]);
  const [nonScheduleItems, setNonScheduleItems] = useState<Array<{ description: string; amount: string }>>([]);

  // Cement-from-items (DSR) state — mirrors the new-bill form.
  const [cementSchedules, setCementSchedules] = useState<CementSchedule[]>([]);
  const [derivingCement, setDerivingCement] = useState(false);
  const [cementUnmatched, setCementUnmatched] = useState<string[]>([]);

  const [form, setForm] = useState({
    contractId: '', billNo: '', dateOfMeasurement: '', zone: '',
    fuelPriceType: 'four_city_avg', isFinalPvc: false, dateOfCompletion: '',
    pvcNumber: '', cementAmount: '',
    steelTmtBarsAmount: '', steelAngleChannelAmount: '', steelPlatesAmount: '', steelOtherSectionsAmount: '',
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
        steelAngleChannelAmount: billData.steelAngleChannelAmount?.toString() || '',
        steelPlatesAmount: billData.steelPlatesAmount?.toString() || '',
        steelOtherSectionsAmount: billData.steelOtherSectionsAmount?.toString() || '',
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

  const selectedContract = contracts.find(c => c.id === form.contractId);

  const deriveCementFromItems = async () => {
    const items: Array<{ dsrCode: string; description: string; unit: string; quantity: number; schedule: string }> = [];
    for (const entry of classificationEntries) {
      const schedule = entry.scheduleItem || 'Default';
      const rows = entry.itemRows && entry.itemRows.length > 0
        ? entry.itemRows
        : [{ itemNumber: entry.itemNumber, quantity: entry.quantity }];
      for (const row of rows) {
        const qty = Number(row.quantity) || 0;
        const code = String(row.itemNumber || '').trim();
        if (code && qty > 0) {
          items.push({ dsrCode: code, description: entry.description || '', unit: '', quantity: qty, schedule });
        }
      }
    }
    if (items.length === 0) {
      toast.error('Add item numbers and quantities to your classification items first.');
      return;
    }
    setDerivingCement(true);
    try {
      const res = await fetch('/api/bills/cement-from-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not derive cement.'); return; }
      setCementUnmatched(data.unmatchedCodes || []);
      if (!data.schedules?.length) {
        setCementSchedules([]);
        toast.error('No cement found — none of these item numbers are in the cement coefficient list.', { duration: 5000 });
        return;
      }
      setCementSchedules(data.schedules);
      toast.success(
        `Found ${data.matchedCount} cement item(s) across ${data.schedules.length} schedule(s).`
        + (data.unmatchedCount ? ` ${data.unmatchedCount} item(s) had no coefficient.` : ''),
      );
    } catch {
      toast.error('The request failed. Please try again.');
    } finally {
      setDerivingCement(false);
    }
  };

  // Split derived cement into a classification row (like the AI upload), keeping total same.
  const applyDerivedCement = (total: number, breakdown: CementBreakdownItem[]) => {
    const allSubs = classificationGroups.flatMap((g: any) => g.subClassifications);
    const mainCode = ((classificationEntries[0] as any)?.subClassification?.code
      || (selectedContract?.workDescription ? inferMainClassification(selectedContract.workDescription).code : '')
      || '').charAt(0).toUpperCase();
    const cementSub = allSubs.find((s: any) => s.code?.toUpperCase() === `${mainCode}C`)
      || allSubs.find((s: any) => /c$/i.test(s.code || ''));
    if (!cementSub) {
      setForm(p => ({ ...p, cementAmount: total.toFixed(2) }));
      toast.success(`Cement cost applied to the dedicated field: ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      return;
    }
    const makeCementEntry = (item: CementBreakdownItem, amount: number): ClassificationEntry => {
      const qty = item.cementQtyMT ?? 0;
      const rate = item.ratePerMt ?? 0;
      const breakup = qty > 0 && rate > 0
        ? ` · ${qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT × ₹${rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/MT`
          + (item.affectedItemCount ? ` (${item.affectedItemCount} items)` : '')
        : '';
      const cementRow = { itemNumber: 'DSR 5.35 (Cement)', quantity: qty || '', agreementRate: rate || '' };
      return {
        subClassificationId: cementSub.id,
        subClassification: cementSub,
        amount,
        description: `Cement (derived) — ${item.schedule}${breakup}`,
        scheduleItem: item.schedule === 'Default' ? '' : item.schedule,
        isDerivedCement: true,
        manualClassification: true,
        itemNumber: cementRow.itemNumber,
        quantity: cementRow.quantity,
        agreementRate: cementRow.agreementRate,
        itemRows: [cementRow],
        classificationJustification: `Cement portion split from the work items using DSR 2021 cement coefficients${breakup ? `:${breakup.replace(' · ', ' ')} = ₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '.'}`,
      };
    };
    setClassificationEntries(applyCementSplit(classificationEntries, breakdown, makeCementEntry));
    setForm(p => ({ ...p, cementAmount: '' }));
    toast.success(`Cement split into ${breakdown.filter(b => b.amount > 0).length} classification row(s): ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  };

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

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading bill..." /></div>;

  if (!bill) return (
    <div className="text-center py-16 text-gray-500">
      <p>Bill not found.</p>
      <BackButton href="/bills" label="Back to Bills" />
    </div>
  );

  const activeIndex = Math.max(0, TABS.findIndex(t => t.id === activeTab));
  const panelCls = (id: string) => (activeTab === id ? 'block' : 'hidden');

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

      {/* Contract (read-only) */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-600 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-emerald-600" />
        {selectedContract ? `${selectedContract.agreementNo} — ${selectedContract.contractorName}` : form.contractId}
        <span className="ml-1 text-xs text-gray-400">(cannot be changed)</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Tab strip */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-1 border-b border-slate-200 min-w-max">
            {TABS.map((tb) => {
              const Icon = tb.icon;
              const isActive = activeTab === tb.id;
              return (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setActiveTab(tb.id)}
                  className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    isActive ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tb.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Basics */}
        <div className={panelCls('basic')}>
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600">Bill Number *</Label>
                <Input value={form.billNo} onChange={e => setForm(p => ({ ...p, billNo: e.target.value }))}
                  placeholder="e.g. RA/001/2024" className="mt-1" />
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
                  onKeyDown={e => e.preventDefault()} className="mt-1 cursor-pointer" />
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
                    onKeyDown={e => e.preventDefault()} className="mt-1 cursor-pointer" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Work & items */}
        <div className={panelCls('classification')}>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <BillClassificationEntries
              value={classificationEntries}
              onChange={setClassificationEntries}
              classificationGroups={classificationGroups}
              workDescription={selectedContract?.workDescription}
              contractSchedules={scheduleNames(selectedContract?.schedules)}
              scheduleRates={normalizeSchedules(selectedContract?.schedules)}
              contractId={form.contractId || undefined}
              measurementDate={form.dateOfMeasurement || undefined}
              aiJustificationFee={99}
            />
          </div>
        </div>

        {/* Cement & steel */}
        <div className={panelCls('cement')}>
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            {/* Cement — derive from items via DSR */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">No direct cement item? Derive it from your items.</p>
                  <p className="text-[11px] text-slate-500">Uses the item numbers &amp; quantities entered in Work &amp; items + DSR 2021 cement coefficients.</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={derivingCement}
                  onClick={deriveCementFromItems}
                  className="border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100">
                  {derivingCement ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deriving…</>) : (<><ClipboardList className="mr-2 h-4 w-4" /> Derive cement from items</>)}
                </Button>
              </div>
              {cementUnmatched.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                  <p className="font-semibold text-amber-900">
                    No cement coefficient for {cementUnmatched.length} item number{cementUnmatched.length > 1 ? 's' : ''}:
                  </p>
                  <p className="mt-1 font-mono text-amber-800">{cementUnmatched.join(', ')}</p>
                  <p className="mt-1.5 text-amber-700">
                    Add them in{' '}
                    <Link href="/admin/dsr-cement-coefficients" target="_blank" className="underline font-medium">Admin → Cement Coefficients</Link>
                    , then press Derive again.
                  </p>
                </div>
              )}
              {cementSchedules.length > 0 && (
                <DsrCementCalculator
                  schedules={cementSchedules}
                  contractId={form.contractId || undefined}
                  contractSchedules={selectedContract?.schedules}
                  contractRebate={selectedContract?.rebatePercentage}
                  onApply={applyDerivedCement}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600">Cement Work Amount (Rs)</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="number" step="0.01" value={form.cementAmount}
                    onChange={e => setForm(p => ({ ...p, cementAmount: e.target.value }))} placeholder="0.00" />
                  <BillAmountCalculator onInsertTotal={t => setForm(p => ({ ...p, cementAmount: t.toString() }))} />
                </div>
              </div>
              {STEEL_FIELDS.map(f => (
                <div key={f.key}>
                  <Label className="text-xs text-gray-600">{f.label}</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="number" step="0.01" value={(form as any)[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder="0.00" />
                    <BillAmountCalculator onInsertTotal={t => setForm(p => ({ ...p, [f.key]: t.toString() }))} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">Dedicated cement / steel components are paid 85% PVC.</p>
          </div>
        </div>

        {/* Optional — non-schedule items + summary */}
        <div className={panelCls('optional')}>
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="space-y-3 p-3 border border-orange-200 rounded-lg bg-orange-50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold text-orange-900">Non-Schedule Items</Label>
                  <p className="text-xs text-orange-700 mt-0.5">Extra items deducted from the gross before PVC.</p>
                </div>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setNonScheduleItems([...nonScheduleItems, { description: '', amount: '' }])}
                  className="bg-white hover:bg-orange-100 h-8 text-xs">+ Add</Button>
              </div>
              {nonScheduleItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end p-2 bg-white rounded border border-gray-200">
                  <div className="col-span-7">
                    <Label className="text-xs text-gray-600 mb-1">Description</Label>
                    <Input value={item.description}
                      onChange={e => { const n = [...nonScheduleItems]; n[index].description = e.target.value; setNonScheduleItems(n); }}
                      placeholder="e.g. Special materials..." className="h-8 text-xs" />
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs text-gray-600 mb-1">Amount (Rs)</Label>
                    <Input type="number" step="0.01" value={item.amount}
                      onChange={e => { const n = [...nonScheduleItems]; n[index].amount = e.target.value; setNonScheduleItems(n); }}
                      placeholder="0.00" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-1 flex">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setNonScheduleItems(nonScheduleItems.filter((_, i) => i !== index))}
                      className="h-8 px-1 text-red-600 hover:text-red-700 hover:bg-red-50">×</Button>
                  </div>
                </div>
              ))}
              {nonScheduleItems.length === 0 && (
                <p className="text-xs text-orange-700/70 italic text-center py-1">No non-schedule items.</p>
              )}
            </div>

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
          </div>
        </div>

        {/* Tab step navigation */}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline"
            onClick={() => setActiveTab(TABS[Math.max(0, activeIndex - 1)].id)}
            disabled={activeIndex === 0} className="rounded-xl px-5">Back</Button>
          <div className="flex items-center gap-1.5">
            {TABS.map((tb, i) => (
              <span key={tb.id} className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-5 bg-emerald-600' : 'w-1.5 bg-slate-300'}`} />
            ))}
          </div>
          {activeIndex < TABS.length - 1 ? (
            <Button type="button" onClick={() => setActiveTab(TABS[Math.min(TABS.length - 1, activeIndex + 1)].id)}
              className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl px-5">Next</Button>
          ) : <span className="w-[64px]" />}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> PVC will be recalculated on save
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.back()}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center space-y-4">
              <div className="relative inline-flex items-center justify-center p-4 bg-red-50 rounded-2xl text-red-600 shadow-sm">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Validation Error</h2>
                <div className="text-sm text-slate-700 max-h-[30vh] overflow-y-auto leading-relaxed text-left bg-slate-50 border border-slate-100 rounded-xl p-4 mt-2 font-semibold whitespace-pre-line shadow-inner">
                  {error}
                </div>
              </div>
            </div>
            <div className="pt-2">
              <button type="button" onClick={() => setError('')}
                className="w-full h-11 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl shadow-md transition-all active:scale-[0.98] inline-flex items-center justify-center">
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
