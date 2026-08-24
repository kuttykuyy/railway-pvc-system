'use client';

import { useState, useEffect, Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Save, Calendar, Info, AlertTriangle, Building2, ClipboardList, Package, Layers, Loader2, Calculator } from 'lucide-react';
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
import { CEMENT_DERIVATION_ENABLED } from '@/lib/cement-derivation';
import { scheduleNames, normalizeSchedules } from '@/lib/contract-schedules';
import { inferMainClassification } from '@/lib/work-classification';
import { applyCementSplit, undoCementSplit, isDerivedCementEntry, type CementBreakdownItem } from '@/lib/cement-split';
import { BillPdfCementAnalyzer, type CementAnalysisData } from '@/components/bills/bill-pdf-cement-analyzer';
import { buildClassificationEntriesFromExtractedBill } from '@/lib/extracted-bill-entries';
import { computeRebateFactor, scaleComponentsWithRebate } from '@/lib/rebate';

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

  // PVC preview — the same endpoint the new-bill and bulk forms use. Editing used to be
  // blind: you changed a classification and only found out what it did to the PVC after
  // saving, which on a submitted bill is exactly when you don't want a surprise.
  const [preview, setPreview] = useState<{ totalPvc: number; quarter: string; isProvisional: boolean } | { error: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

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
      fetch('/api/contracts?lean=1').then(r => r.json()),
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
      const rate4 = rate ? Math.round(rate * 10000) / 10000 : '';
      const perItem: any[] = (item.items && item.items.length > 0)
        ? item.items.map(it => ({ itemNumber: `${it.code} (Cement)`, quantity: it.cementQtyMT || '', agreementRate: rate4, sourceQty: it.sourceQty, coefficient: it.coefficient, workUnit: it.workUnit }))
        : [{ itemNumber: 'DSR 5.35 (Cement)', quantity: qty || '', agreementRate: rate4 }];
      const computed = Math.round(perItem.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.agreementRate) || 0), 0) * 100) / 100 || amount;
      const first = perItem[0];
      return {
        subClassificationId: cementSub.id,
        subClassification: cementSub,
        amount: computed,
        description: `Cement (derived) — ${item.schedule}${breakup}`,
        scheduleItem: item.schedule === 'Default' ? '' : item.schedule,
        isDerivedCement: true,
        manualClassification: true,
        itemNumber: first.itemNumber,
        quantity: first.quantity,
        agreementRate: first.agreementRate,
        itemRows: perItem,
        classificationJustification: `Cement portion split from the work items using DSR 2021 cement coefficients${breakup ? `:${breakup.replace(' · ', ' ')} = ₹${computed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '.'}`,
      };
    };
    setClassificationEntries(applyCementSplit(classificationEntries, breakdown, makeCementEntry));
    setForm(p => ({ ...p, cementAmount: '' }));
    toast.success(`Cement split into ${breakdown.filter(b => b.amount > 0).length} classification row(s): ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  };

  const runPreview = async () => {
    if (!form.dateOfMeasurement || classificationEntries.length === 0) {
      toast.error('A measurement date and at least one classification are needed first.');
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch('/api/bills/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: form.contractId,
          grossBillAmount: totalClassification,
          billAmount: netBillAmount,
          dateOfMeasurement: form.dateOfMeasurement,
          zone: form.zone,
          fuelPriceType: form.fuelPriceType || 'four_city_avg',
          calculationMethod: 'auto',
          classificationEntries,
        }),
      });
      const data = await res.json();
      setPreview(res.ok
        ? { totalPvc: Number(data.totalPvc) || 0, quarter: data.quarter, isProvisional: !!data.isProvisional }
        : { error: data.error || 'Preview failed' });
    } catch {
      setPreview({ error: 'Preview failed' });
    } finally {
      setPreviewing(false);
    }
  };

  /**
   * Re-read this bill's PDF and rebuild its items.
   *
   * Until now a bill could only be fixed by hand or by deleting it and uploading
   * again — so every improvement to the PDF reader was out of reach for bills already
   * saved. Entries are rebuilt from the PDF wholesale, which is the point: the
   * classification the reader produces today is what the user is asking for.
   */
  const applyExtractedBillDetails = (data: CementAnalysisData) => {
    const billDetails = data.billDetails;

    // Guard against re-reading the wrong file. The agreement number is printed on
    // every IREPS bill, so a mismatch means this PDF belongs to another contract and
    // applying it would silently replace this bill's items with someone else's.
    const normalize = (value?: string | null) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const fromPdf = normalize(billDetails?.agreementNo);
    const onContract = normalize(selectedContract?.agreementNo);
    if (fromPdf && onContract && fromPdf !== onContract
      && !fromPdf.includes(onContract) && !onContract.includes(fromPdf)) {
      toast.error(
        `That PDF is for agreement ${billDetails?.agreementNo}, but this bill belongs to ${selectedContract?.agreementNo}. Nothing was changed.`,
        { duration: 6000 },
      );
      return;
    }

    let entries = buildClassificationEntriesFromExtractedBill(data, {
      classificationGroups: classificationGroups as any,
      contractSchedules: selectedContract?.schedules,
    }) as ClassificationEntry[];

    if (entries.length === 0) {
      toast.error('No items could be mapped from that PDF, so the bill was left as it was.');
      return;
    }

    // Rebate: when the work was awarded below the estimate the printed gross is
    // reduced to the net payable, so every component scales by the same factor.
    const rebateFactor = computeRebateFactor({
      grossTotal: billDetails?.grossBillAmount,
      netBillAmount: billDetails?.netBillAmount,
      rebatePercentage: billDetails?.rebatePercentage,
    });
    if (rebateFactor < 1) {
      const scaled = scaleComponentsWithRebate(entries.map(e => Number(e.amount || 0)), rebateFactor);
      entries = entries.map((entry, index) => ({ ...entry, amount: scaled[index] }));
      toast.success(
        `Rebate${billDetails?.rebatePercentage ? ` of ${billDetails.rebatePercentage}%` : ''} applied — components scaled to the net Bill Amount`,
        { icon: '↓', duration: 4000 },
      );
    }

    setClassificationEntries(entries);

    // The measurement date decides the quarter, so it follows the PDF. The bill number
    // is left alone: it may have been corrected by hand, and it doesn't affect the PVC.
    const extractedDate = String(billDetails?.measurementDate || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
    if (extractedDate && extractedDate !== form.dateOfMeasurement) {
      setForm(p => ({ ...p, dateOfMeasurement: extractedDate }));
      toast(`Measurement date updated to ${extractedDate} from the PDF.`, { icon: '📅' });
    }
    // Extracted items already carry cement and steel, so the dedicated fields would
    // double-count them.
    setForm(p => ({
      ...p, cementAmount: '',
      steelTmtBarsAmount: '', steelAngleChannelAmount: '', steelPlatesAmount: '', steelOtherSectionsAmount: '',
    }));

    toast.success(`Re-read the bill — ${entries.length} item section(s) replaced. Check them, then Update Bill.`);
    setActiveTab('classification');
  };

  // Whether this bill carries a derived-cement split at all. A saved bill has lost the
  // isDerivedCement flag, so the rows are recognised by their description.
  const derivedCementRows = classificationEntries.filter(isDerivedCementEntry);
  const derivedCementTotal = derivedCementRows.reduce(
    (sum, e) => sum + (e.amount === '' || e.amount == null ? 0 : Number(e.amount) || 0), 0,
  );

  /**
   * Puts the derived cement back where it came from and drops the cement rows.
   *
   * A DSR/USSOR item's rate already includes its cement, and the item's own work
   * classification already carries a cement share — so on an agreement read that way,
   * splitting the cement into a "C" sub-classification prices the same cement twice.
   */
  const removeCementSplit = () => {
    setClassificationEntries(undoCementSplit(classificationEntries) as ClassificationEntry[]);
    setCementSchedules([]);
    setCementUnmatched([]);
    toast.success(
      `Cement split removed — ₹${derivedCementTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} put back into the work items. Press Update Bill to save.`,
      { duration: 6000 },
    );
    setActiveTab('classification');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.billNo || !form.dateOfMeasurement || classificationEntries.length === 0) {
      setError('Bill number, measurement date and at least one classification are required.');
      return;
    }

    // Saving rewrites the bill's gross as whatever the rows now total, so drifting away
    // from the figure printed on the bill has to be deliberate. Deleting a cement row
    // worth lakhs used to shrink the bill with nothing said.
    const savedGross = Number(bill?.grossBillAmount) || 0;
    const drift = Math.round((totalClassification - savedGross) * 100) / 100;
    if (savedGross > 0 && Math.abs(drift) >= 1) {
      const money = (v: number) => `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const ok = window.confirm(
        `The classification rows now total ${money(totalClassification)}, but this bill was saved at ${money(savedGross)}`
        + ` — ${drift < 0 ? 'down' : 'up'} ${money(drift)}.\n\n`
        + `Saving will set the bill's gross to the new figure. If you removed a cement row, its amount has to go back`
        + ` into the work items it came from (Cement & steel → Remove the cement split) or the bill will be short.\n\n`
        + `Save anyway?`,
      );
      if (!ok) return;
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
              ...(r.sourceQty !== undefined ? { sourceQty: r.sourceQty, coefficient: r.coefficient, workUnit: r.workUnit } : {}),
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
    // Full width. The page is mostly the classification table — item rows, quantities,
    // rates and per-component amounts — and a 4xl cap squeezed it into a horizontal
    // scroll on the one screen where the numbers most need to be read across.
    <div className="w-full px-4 py-6 space-y-5">

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
          <div className="space-y-4">
            {/* Re-read the bill PDF. Without this the only way to pick up a fix to the
                PDF reader was to delete the bill and upload it again. */}
            <BillPdfCementAnalyzer
              title="Re-read this bill from its PDF"
              contractId={form.contractId}
              disabled={isSaving}
              billId={billId}
              onApplyBillDetails={applyExtractedBillDetails}
            />
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Applying a PDF <b>replaces</b> the item sections below with what the reader finds.
              Anything typed in by hand here is lost — the bill number, dates and the fields on the other tabs are kept.
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
            <BillClassificationEntries
              value={classificationEntries}
              onChange={setClassificationEntries}
              classificationGroups={classificationGroups}
              // The bill's SAVED gross, so the Difference panel guards the edit. Without
              // it the panel showed "-" and reported Rs 0.00 whatever you did — deleting
              // a cement row worth lakhs raised nothing, and the save then redefined the
              // bill's gross as whatever the rows happened to total.
              grossBillAmount={Number(bill?.grossBillAmount) || undefined}
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
            {/* Already split? Offer to put it back. Some agreements are read as not
                requiring a cement split on DSR items at all, and the split then has to
                come off the bills it was applied to. */}
            {derivedCementRows.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-900">
                    This bill has a derived cement split — {derivedCementRows.length} row(s), ₹{derivedCementTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    If this agreement does not split cement out of DSR items, remove it. The money goes
                    back to the items it came from and the bill total does not change.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={removeCementSplit}
                  className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100">
                  Remove the cement split
                </Button>
              </div>
            )}

            {/* Deriving cement out of DSR items is off — see lib/cement-derivation.ts. */}
            {CEMENT_DERIVATION_ENABLED && (
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
            )}

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

        {/* PVC preview — what this edit does to the figure, before committing it */}
        {preview && (
          'error' in preview ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t work out the PVC: {preview.error}
            </div>
          ) : (() => {
            const savedPvc = Number(bill?.pvcCalculation?.totalPvc);
            const change = Number.isFinite(savedPvc) ? preview.totalPvc - savedPvc : null;
            const money = (v: number) => `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            return (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-emerald-900">
                    PVC after this edit: {preview.totalPvc < 0 ? '−' : ''}{money(preview.totalPvc)}
                  </span>
                  <span className="text-xs text-emerald-700">Quarter {preview.quarter}</span>
                </div>
                {change !== null && (
                  <p className="text-xs text-emerald-800">
                    {Math.abs(change) < 0.005
                      ? 'Same as the saved figure.'
                      : `${change > 0 ? 'Up' : 'Down'} ${money(change)} from the saved ${savedPvc < 0 ? '−' : ''}${money(savedPvc)}.`}
                  </p>
                )}
                {preview.isProvisional && (
                  <p className="text-xs text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Some indices for this quarter are still provisional — the figure can change when they go final.
                  </p>
                )}
                <p className="text-[11px] text-emerald-700/80">Nothing is saved yet. Press Update Bill to keep it.</p>
              </div>
            );
          })()
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> PVC will be recalculated on save
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={runPreview}
              disabled={previewing || !form.dateOfMeasurement || classificationEntries.length === 0}
              className="rounded-lg">
              {previewing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking…</> : <><Calculator className="h-4 w-4 mr-2" /> Check PVC</>}
            </Button>
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
