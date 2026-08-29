
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Save, AlertCircle, Edit, Upload, Sparkles, ClipboardList, Loader2, Calculator } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { InsufficientCreditDialog } from '@/components/ui/insufficient-credit-dialog';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { scheduleNames, normalizeSchedules } from '@/lib/contract-schedules';
import { DsrCementCalculator, type CementSchedule } from '@/components/bills/dsr-cement-calculator';
import { CEMENT_DERIVATION_ENABLED } from '@/lib/cement-derivation';
import { applyCementSplit, type CementBreakdownItem } from '@/lib/cement-split';
import { inferMainClassification } from '@/lib/work-classification';
import { BillPdfCementAnalyzer, type AppliedExtractionContext, type CementAnalysisData, type ExtractedBillItem } from '@/components/bills/bill-pdf-cement-analyzer';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import { parseAgreementNumber } from '@/lib/railway-division-helper';
import { matchExtractedSchedule } from '@/lib/bill-schedule-matching';
import {
  buildClassificationEntriesFromExtractedBill as buildEntriesFromExtractedBill,
  findSubClassificationForExtractedItem as findSubClassificationForItem,
} from '@/lib/extracted-bill-entries';
import { calculateTotalPvc, formatPvcAmount, pvcComparisonAllowsSuffix } from '@/lib/classification-pvc';
import { computeRebateFactor, scaleComponentsWithRebate } from '@/lib/rebate';
import { AddExtensionDialog, type ExtensionRequired } from '@/components/contracts/add-extension-dialog';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: string;
  baseMonth: string;
  schedules?: unknown;
  rebatePercentage?: number | null;
  fuelPriceType?: string | null;
}

interface SubClassification {
  id: string;
  code: string;
  name: string;
  groupId: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
}

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  subClassifications: SubClassification[];
}

interface ItemRow {
  itemNumber: string;
  quantity: number | string | '';
  agreementRate: number | string | '';
}

interface ClassificationEntry {
  subClassificationId: string;
  subClassification?: SubClassification;
  amount: number | string | '';
  description?: string;
  classificationJustification?: string;
  steelTypes?: string[];
  scheduleItem?: string;
  itemNumber?: string;
  quantity?: number | string | '';
  agreementRate?: number | string | '';
  itemRows?: ItemRow[];
  aiReviewed?: boolean;
  manualClassification?: boolean;
  isDerivedCement?: boolean;
}

interface BillRow {
  id: string;
  billNo: string;
  dateOfMeasurement: string;
  isAiUploaded?: boolean;
  /** The kept copy of the PDF this row was read from, claimed when the batch is saved. */
  uploadedDocumentId?: number | null;
  /** Cl.46A.1(b): extra items ordered under Cl.39(1)(b), outside price variation. */
  extraItemsOutsidePvc?: string;
  cementAmount: number | string | '';
  steelTmtBarsAmount: number | string | '';
  steelAngleChannelAmount: number | string | '';
  steelPlatesAmount: number | string | '';
  steelOtherSectionsAmount: number | string | '';
  classificationEntries: ClassificationEntry[];
}

function createEmptyBillRow(id?: string): BillRow {
  return {
    id: id || Math.random().toString(36).substr(2, 9),
    billNo: '',
    dateOfMeasurement: '',
    extraItemsOutsidePvc: '',
    cementAmount: '',
    steelTmtBarsAmount: '',
    steelAngleChannelAmount: '',
    steelPlatesAmount: '',
    steelOtherSectionsAmount: '',
    classificationEntries: [],
  };
}

export default function BulkBillCreationPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [processingFee, setProcessingFee] = useState<number>(0);
  const [aiProcessingFee, setAiProcessingFee] = useState<number>(0);

  // Global zone and fuel — selected once for all bills
  const [globalZone, setGlobalZone] = useState<string>('');
  const [globalFuelPriceType, setGlobalFuelPriceType] = useState<string>('four_city_avg');
  // Per-row PVC preview, keyed by row id. The single-bill form has always been able to
  // show the PVC before saving; entering bills in bulk meant committing them unseen.
  const [previews, setPreviews] = useState<Record<string, { totalPvc: number; quarter: string; isProvisional: boolean; single?: any } | { error: string }>>({});
  const [previewingRows, setPreviewingRows] = useState(false);
  // Opens the PDF analyzer's file picker from the sticky bar, so the analyzer stays the
  // single place that knows how to take a bill PDF.
  const openPdfPickerRef = useRef<(() => void) | null>(null);
  // How the user wants to build the bills: pick first, then show the rest.
  const [billMode, setBillMode] = useState<'choose' | 'manual' | 'ai'>('choose');

  const [billRows, setBillRows] = useState<BillRow[]>([createEmptyBillRow()]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);

  const [showInsufficientCredit, setShowInsufficientCredit] = useState(false);
  const [creditInfo, setCreditInfo] = useState({ currentBalance: 0, requiredAmount: 0, shortfall: 0 });

  const [showClassificationDialog, setShowClassificationDialog] = useState(false);
  const [extensionInfo, setExtensionInfo] = useState<ExtensionRequired | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  useEffect(() => { loadInitialData(); }, []);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  // Pick the zone from the contract's agreement number the moment a contract is chosen,
  // the same way the single-bill form does. The number carries the zone (SCR/…, SR/…),
  // so making the user re-pick it here was just a chance to pick the wrong one. Only
  // auto-fill while the field is untouched, so a deliberate override is never clobbered.
  useEffect(() => {
    if (globalZone || !selectedContract?.agreementNo) return;
    const parsed = parseAgreementNumber(selectedContract.agreementNo);
    if (parsed?.zone && getRailwayZoneOptions().some(option => option.value === parsed.zone)) {
      setGlobalZone(parsed.zone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract?.agreementNo]);

  // Fuel basis is agreed per contract (SWR takes the four-city average, Sr.DFM/MDU the
  // Chennai rate), so honour whatever the contract stored instead of always defaulting.
  // Keyed on the contract id so switching contracts re-applies the new one.
  useEffect(() => {
    if (selectedContract?.fuelPriceType) {
      setGlobalFuelPriceType(selectedContract.fuelPriceType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract?.id]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError('');

      try {
        const maintenanceRes = await fetch('/api/settings/maintenance-status');
        if (maintenanceRes.ok) {
          const maintenanceData = await maintenanceRes.json();
          if (maintenanceData.maintenanceStatus?.bulkBillingMaintenance) {
            setIsMaintenanceMode(true);
            toast.error('Bulk billing is currently under maintenance. Please try again later.');
            setTimeout(() => router.push('/bills'), 2000);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking maintenance mode:', err);
      }

      const contractsRes = await fetch('/api/contracts?lean=1');
      if (!contractsRes.ok) throw new Error('Failed to load contracts');
      setContracts(await contractsRes.json());

      const classificationsRes = await fetch('/api/classification-groups');
      if (!classificationsRes.ok) throw new Error('Failed to load classifications');
      const classificationsData = await classificationsRes.json();
      const groupsArray = classificationsData.groups || classificationsData;
      setClassificationGroups(Array.isArray(groupsArray) ? groupsArray : []);

      try {
        const feeRes = await fetch('/api/user/processing-fee');
        if (feeRes.ok) {
          const feeData = await feeRes.json();
          setProcessingFee(feeData.manualFee ?? feeData.processingFee ?? 0);
          setAiProcessingFee(feeData.aiFee ?? feeData.processingFee ?? 0);
        } else {
          const settingsRes = await fetch('/api/admin/settings');
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            const billProcessingCost = settings.find((s: any) => s.key === 'BILL_PROCESSING_COST');
            if (billProcessingCost) setProcessingFee(parseFloat(billProcessingCost.value) || 10);
            const aiBillProcessingCost = settings.find((s: any) => s.key === 'AI_BILL_PROCESSING_COST');
            if (aiBillProcessingCost) setAiProcessingFee(parseFloat(aiBillProcessingCost.value) || 10);
          }
        }
      } catch {
        setProcessingFee(10);
        setAiProcessingFee(10);
      }

      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      setIsLoading(false);
    }
  };

  const addBillRow = () => {
    setBillRows([...billRows, createEmptyBillRow()]);
  };

  const removeBillRow = (id: string) => {
    if (billRows.length === 1) { toast.error('At least one bill is required'); return; }
    setBillRows(billRows.filter((row) => row.id !== id));
  };

  const updateBillRow = (id: string, field: keyof BillRow, value: any) => {
    setBillRows((prev) => prev.map((row) => row.id === id ? { ...row, [field]: value } : row));
    // Any edit invalidates that row's preview — a figure computed from earlier values
    // is worse than none, because it still looks authoritative.
    setPreviews((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Runs each row through the same preview endpoint the single-bill form uses, one at
  // a time so a long list cannot flood the server.
  const previewAllRows = async () => {
    if (!selectedContract?.id) { toast.error('Please select a contract first'); return; }
    if (!globalZone) { toast.error('Please select a Railway Zone first'); return; }
    const ready = billRows.filter(row => row.dateOfMeasurement && row.classificationEntries.length > 0);
    if (ready.length === 0) { toast.error('Add a date of measurement and classifications first'); return; }

    setPreviewingRows(true);
    setPreviews({});
    try {
      for (const row of ready) {
        const total = getClassificationTotal(row);
        try {
          const res = await fetch('/api/bills/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contractId: selectedContract.id,
              grossBillAmount: total,
              billAmount: total,
              dateOfMeasurement: row.dateOfMeasurement,
              zone: globalZone,
              fuelPriceType: globalFuelPriceType || 'four_city_avg',
              calculationMethod: 'auto',
              classificationEntries: row.classificationEntries,
              isAiUploaded: row.isAiUploaded || false,
            }),
          });
          const data = await res.json();
          setPreviews(prev => ({
            ...prev,
            [row.id]: res.ok
              ? { totalPvc: Number(data.totalPvc) || 0, quarter: data.quarter, isProvisional: !!data.isProvisional, single: data.singleClassification || null }
              : { error: data.error || 'Preview failed' },
          }));
        } catch {
          setPreviews(prev => ({ ...prev, [row.id]: { error: 'Preview failed' } }));
        }
      }
    } finally {
      setPreviewingRows(false);
    }
  };

  const parseAmount = (value: number | string | null | undefined): number => {
    if (value === '' || value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = parseFloat(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getClassificationTotal = (row: BillRow): number =>
    row.classificationEntries.reduce((sum, entry) => sum + parseAmount(entry.amount), 0);

  const formatAmount = (amount: number): string =>
    amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const findSubClassification = (rawValue: unknown): SubClassification | undefined => {
    const value = String(rawValue || '').trim().toLowerCase();
    if (!value) return undefined;
    const allSubs = classificationGroups.flatMap(g => g.subClassifications);
    return allSubs.find(sub =>
      sub.id.toLowerCase() === value ||
      sub.code.toLowerCase() === value ||
      sub.name.toLowerCase() === value ||
      `${sub.code} ${sub.name}`.toLowerCase() === value
    );
  };

  const getImportValue = (row: Record<string, any>, keys: string[]): any => {
    const normalizedEntries = Object.entries(row).map(([k, v]) => [
      k.trim().toLowerCase().replace(/[\s_-]/g, ''), v
    ]);
    for (const key of keys) {
      const nk = key.toLowerCase().replace(/[\s_-]/g, '');
      const match = normalizedEntries.find(([ek]) => ek === nk);
      if (match) return match[1];
    }
    return undefined;
  };

  const normalizeImportedDate = (value: unknown): string => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
    }
    return String(value || '').trim();
  };


  const openClassificationDialog = (billId: string) => {
    setEditingBillId(billId);
    setCementSchedules([]);      // clear any derive result from a previous bill
    setCementUnmatched([]);
    setShowClassificationDialog(true);
  };

  const updateClassificationEntries = (billId: string, entries: ClassificationEntry[]) => {
    setBillRows((prev) => prev.map((row) => row.id === billId ? { ...row, classificationEntries: entries } : row));
  };

  // Rebuild ONE bill's entries grouped under a single "All items" class (from the
  // preview comparison): general items collapse into one entry of that class, while
  // steel (…B/…D, or steel-majority typed) and cement (…C) entries are kept untouched —
  // the same split the comparison priced. The stale preview for the row is cleared so
  // the shown PVC can't belong to the old entries.
  const groupRowUnderClass = (rowId: string, best: any) => {
    const row = billRows.find(r => r.id === rowId);
    if (!row || !best?.id) return;
    const allSubs = classificationGroups.flatMap(g => g.subClassifications);
    const subOf = (e: ClassificationEntry) => allSubs.find(s => s.id === e.subClassificationId);
    const suffixOf = (e: ClassificationEntry) => String(subOf(e)?.code || '').trim().slice(-1).toUpperCase();
    const isSteelEntry = (e: ClassificationEntry) => {
      const s = suffixOf(e);
      if (s === 'B' || s === 'D') return true;
      const types = Array.isArray(e.steelTypes) ? e.steelTypes : [];
      return types.length > 0 && ((subOf(e) as any)?.steel ?? 0) >= 50;
    };
    // RECLASSIFY each general entry rather than collapsing: descriptions, item rows and
    // AI justifications survive (with a note), so the statement's Section D stays full.
    const isKept = (e: ClassificationEntry) => isSteelEntry(e) || (suffixOf(e) === 'C' && !isSteelEntry(e));
    let changed = 0;
    const next = row.classificationEntries.map(e => {
      if (isKept(e) || parseAmount(e.amount) === 0) return e;
      const origCode = subOf(e)?.code;
      changed++;
      const note = `[Grouped under ${best.code} by user for single-class pricing; original classification ${origCode || '—'}.]`;
      return {
        ...e,
        subClassificationId: best.id,
        subClassification: {
          id: best.id, code: best.code, name: best.name, groupId: best.groupId,
          fixed: best.fixed, labour: best.labour, steel: best.steel, cement: best.cement,
          plantMachinery: best.plantMachinery, fuel: best.fuel,
          otherMaterials: best.otherMaterials, explosives: best.explosives,
        } as any,
        classificationJustification: `${(e.classificationJustification || '').trim()} ${note}`.trim(),
      };
    });
    if (changed === 0) {
      toast.error('Nothing to group — every item on this bill is steel or cement supply.');
      return;
    }
    updateClassificationEntries(rowId, next);
    setPreviews(prev => { const nxt = { ...prev }; delete nxt[rowId]; return nxt; });
    toast.success(`Bill ${row.billNo || rowId}: ${changed} general item(s) reclassified to ${best.code} — details kept. Preview again to see the new PVC.`);
  };

  const getEditingBill = () => billRows.find(row => row.id === editingBillId);

  // Cement-from-items (DSR) for the bill being edited in the dialog — mirrors the single form.
  const [cementSchedules, setCementSchedules] = useState<CementSchedule[]>([]);
  const [derivingCement, setDerivingCement] = useState(false);
  const [cementUnmatched, setCementUnmatched] = useState<string[]>([]);

  const deriveCementFromItems = async () => {
    const editing = getEditingBill();
    if (!editing) return;
    const items: Array<{ dsrCode: string; description: string; unit: string; quantity: number; schedule: string }> = [];
    for (const entry of editing.classificationEntries) {
      const schedule = entry.scheduleItem || 'Default';
      const rows = entry.itemRows && entry.itemRows.length > 0
        ? entry.itemRows
        : [{ itemNumber: entry.itemNumber, quantity: entry.quantity }];
      for (const row of rows) {
        const qty = Number(row.quantity) || 0;
        const code = String(row.itemNumber || '').trim();
        if (code && qty > 0) items.push({ dsrCode: code, description: entry.description || '', unit: '', quantity: qty, schedule });
      }
    }
    if (items.length === 0) { toast.error('Add item numbers and quantities to your classification items first.'); return; }
    setDerivingCement(true);
    try {
      const res = await fetch('/api/bills/cement-from-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
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
      toast.success(`Found ${data.matchedCount} cement item(s) across ${data.schedules.length} schedule(s).`
        + (data.unmatchedCount ? ` ${data.unmatchedCount} item(s) had no coefficient.` : ''));
    } catch {
      toast.error('The request failed. Please try again.');
    } finally {
      setDerivingCement(false);
    }
  };

  const applyDerivedCement = (total: number, breakdown: CementBreakdownItem[]) => {
    const editing = getEditingBill();
    if (!editing) return;
    const allSubs = classificationGroups.flatMap((g: any) => g.subClassifications);
    const mainCode = ((editing.classificationEntries[0] as any)?.subClassification?.code
      || (selectedContract?.workDescription ? inferMainClassification(selectedContract.workDescription).code : '')
      || '').charAt(0).toUpperCase();
    const cementSub = allSubs.find((s: any) => s.code?.toUpperCase() === `${mainCode}C`)
      || allSubs.find((s: any) => /c$/i.test(s.code || ''));
    if (!cementSub) {
      updateBillRow(editing.id, 'cementAmount', total.toFixed(2));
      toast.success(`Cement cost applied to the dedicated field: ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      return;
    }
    const makeCementEntry = (item: CementBreakdownItem, amount: number): ClassificationEntry => {
      const qty = item.cementQtyMT ?? 0;
      const rate = item.ratePerMt ?? 0;
      const rate4 = rate ? Math.round(rate * 10000) / 10000 : '';
      const breakup = qty > 0 && rate > 0
        ? ` · ${qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT × ₹${rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/MT`
          + (item.affectedItemCount ? ` (${item.affectedItemCount} items)` : '')
        : '';
      const perItem: any[] = (item.items && item.items.length > 0)
        ? item.items.map(it => ({ itemNumber: `${it.code} (Cement)`, quantity: it.cementQtyMT || '', agreementRate: rate4, sourceQty: it.sourceQty, coefficient: it.coefficient, workUnit: it.workUnit }))
        : [{ itemNumber: 'DSR 5.35 (Cement)', quantity: qty || '', agreementRate: rate4 }];
      const computed = Math.round(perItem.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.agreementRate) || 0), 0) * 100) / 100 || amount;
      const first = perItem[0];
      return {
        subClassificationId: cementSub.id, subClassification: cementSub, amount: computed,
        description: `Cement (derived) — ${item.schedule}${breakup}`,
        scheduleItem: item.schedule === 'Default' ? '' : item.schedule,
        isDerivedCement: true, manualClassification: true,
        itemNumber: first.itemNumber, quantity: first.quantity, agreementRate: first.agreementRate, itemRows: perItem,
        classificationJustification: `Cement portion split from the work items using DSR 2021 cement coefficients${breakup ? `:${breakup.replace(' · ', ' ')} = ₹${computed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '.'}`,
      };
    };
    updateClassificationEntries(editing.id, applyCementSplit(editing.classificationEntries, breakdown, makeCementEntry));
    updateBillRow(editing.id, 'cementAmount', '');
    toast.success(`Cement split into ${breakdown.filter(b => b.amount > 0).length} classification row(s): ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  };

  const normalizeExtractedDate = (value?: string) => {
    if (!value) return '';
    const isoMatch = value.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  };

  // Shared with the single-bill form and the edit page — see lib/extracted-bill-entries.ts.
  // This page had its own copy that had lost the cement split, so applying the cement
  // calculation here deducted the cement from every item and then dropped it.
  const findSubClassificationForExtractedItem = (item: ExtractedBillItem) =>
    findSubClassificationForItem(item, classificationGroups as any);

  const buildClassificationEntriesFromExtractedBill = (data: CementAnalysisData): ClassificationEntry[] =>
    buildEntriesFromExtractedBill(data, {
      classificationGroups: classificationGroups as any,
      contractSchedules: selectedContract?.schedules,
    }) as ClassificationEntry[];

  // Compares PVC across the sub-classifications of the entry's group and keeps the one
  // with the least negative PVC, recording the comparison in the justification.
  // Supply classifications (B/C) are never switched away from or into automatically.
  const applyPvcComparisonToEntries = async (
    mappedEntries: ClassificationEntry[],
    measurementDate: string,
  ): Promise<ClassificationEntry[]> => {
    if (!selectedContract?.id || !measurementDate || mappedEntries.length === 0) return mappedEntries;
    try {
      const response = await fetch(
        `/api/indices/comparison?contractId=${selectedContract.id}&measurementDate=${measurementDate}`,
      );
      if (!response.ok) return mappedEntries;
      const indices = await response.json();
      if (!indices.base || !indices.current) return mappedEntries;
      const indicesData = { base: indices.base, current: indices.current };

      return mappedEntries.map(entry => {
        // Never second-guess a classification the user picked by hand.
        if (entry.manualClassification) return entry;
        const currentSub = entry.subClassification;
        const amount = Number(entry.amount) || 0;
        if (!currentSub || amount <= 0) return entry;
        const currentSuffix = currentSub.code.slice(-1).toUpperCase();
        if (currentSuffix === 'B' || currentSuffix === 'C') return entry;

        const group = classificationGroups.find(item => item.id === currentSub.groupId);
        if (!group) return entry;
        // Compare across all non-supply sub-classes (A/D/E) so the justification stays
        // transparent about what each option would pay. Selection still follows the
        // nature of the work — never turn a general item into Fabrication & Erection
        // just for a bigger PVC.
        const compareSet = group.subClassifications.filter(sub => {
          const suffix = sub.code.slice(-1).toUpperCase();
          return sub.id === currentSub.id || !['B', 'C'].includes(suffix);
        });
        if (compareSet.length < 2) return entry;

        const results = compareSet
          .map(sub => ({ sub, pvc: calculateTotalPvc(sub, amount, indicesData) }))
          .sort((left, right) => right.pvc - left.pvc);
        if (results.every(result => result.pvc === 0)) return entry;

        const best = results[0];
        const canSwitch = best.sub.id !== currentSub.id
          && pvcComparisonAllowsSuffix(currentSuffix, best.sub.code.slice(-1));
        const selected = canSwitch ? best.sub : currentSub;

        const comparisonText = results.map(result => `${result.sub.code} → ${formatPvcAmount(result.pvc)}`).join(', ');
        const note = selected.id === best.sub.id
          ? `${selected.code} matches the nature of the work.`
          : `${best.sub.code} would yield a higher PVC, but classification follows the nature of the work rather than the payout, so this item stays ${selected.code}.`;
        const amountLabel = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const justification = [
          entry.classificationJustification || '',
          `Checking the price variation on Rs ${amountLabel}: ${comparisonText}. ${note}`,
        ].filter(Boolean).join(' ');

        if (canSwitch) {
          return {
            ...entry,
            subClassificationId: best.sub.id,
            subClassification: best.sub,
            classificationJustification: justification,
          };
        }
        return { ...entry, classificationJustification: justification };
      });
    } catch {
      return mappedEntries;
    }
  };

  const applyExtractedBillDetailsToBulkRow = async (data: CementAnalysisData, context?: AppliedExtractionContext) => {
    const billDetails = data.billDetails;

    // Auto-select the contract from the extracted Agreement No. when none is chosen yet
    // (parity with the single-bill form, so bulk fills the contract for you).
    const extractedAgreementNo = (billDetails?.agreementNo || '').trim();
    if (extractedAgreementNo && !selectedContract) {
      const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const target = normalize(extractedAgreementNo);
      const matchedContract = contracts.find(contract => normalize(contract.agreementNo) === target)
        || contracts.find(contract => {
          const code = normalize(contract.agreementNo);
          return code.length > 0 && (code.includes(target) || target.includes(code));
        });
      if (matchedContract) {
        setSelectedContract(matchedContract);
        toast.success(`Matched contract ${matchedContract.agreementNo} from the bill`, { icon: '🔗' });
      }
    }

    let mappedEntries = buildClassificationEntriesFromExtractedBill(data);
    mappedEntries = await applyPvcComparisonToEntries(
      mappedEntries,
      normalizeExtractedDate(billDetails?.measurementDate) || '',
    );

    // Rebate: scale components to the net Bill Amount so PVC uses the post-rebate value.
    const rebateFactor = computeRebateFactor({
      grossTotal: billDetails?.grossBillAmount,
      netBillAmount: billDetails?.netBillAmount,
      rebatePercentage: billDetails?.rebatePercentage,
    });
    if (rebateFactor < 1) {
      const scaledAmounts = scaleComponentsWithRebate(
        mappedEntries.map(entry => Number(entry.amount || 0)),
        rebateFactor,
      );
      mappedEntries = mappedEntries.map((entry, index) => ({ ...entry, amount: scaledAmounts[index] }));
      const pct = billDetails?.rebatePercentage;
      toast.success(`Rebate${pct ? ` of ${pct}%` : ''} applied — components scaled to the net Bill Amount`, { icon: '↓' });
    }

    // Each upload owns one bill, named after the upload. Everything that upload produces
    // later — an unlock, a cement figure derived from its DSR items — carries the same id
    // and so keeps landing on that bill rather than starting another.
    const boundRowId = context ? `pdf-${context.uploadId}` : null;

    const fillRow = (row: BillRow): BillRow => ({
      ...row,
      id: boundRowId || row.id,
      billNo: billDetails?.billNo || row.billNo,
      dateOfMeasurement: normalizeExtractedDate(billDetails?.measurementDate) || row.dateOfMeasurement,
      isAiUploaded: true,
      uploadedDocumentId: context?.documentId ?? null,
      // AI items stay in classification entries; dedicated component
      // inputs are only for additional manually entered amounts.
      cementAmount: '',
      steelTmtBarsAmount: '',
      steelAngleChannelAmount: '',
      steelPlatesAmount: '',
      steelOtherSectionsAmount: '',
      classificationEntries: mappedEntries.length > 0 ? mappedEntries : row.classificationEntries,
    });

    setBillRows((prev) => {
      const boundIndex = boundRowId ? prev.findIndex(row => row.id === boundRowId) : -1;
      if (boundIndex >= 0) {
        return prev.map((row, index) => index === boundIndex ? fillRow(row) : row);
      }

      const emptyIndex = prev.findIndex(row => !row.billNo.trim() && row.classificationEntries.length === 0);
      // Nothing blank left to fill — the previous PDFs took the rows. Add one. Falling
      // back to the first row, as this used to, overwrote a bill already read: uploading
      // a second PDF replaced the first bill instead of adding to the batch.
      if (emptyIndex < 0) {
        return [...prev, fillRow(createEmptyBillRow(boundRowId || undefined))];
      }
      return prev.map((row, index) => index === emptyIndex ? fillRow(row) : row);
    });

    // The bill just changed underneath any PVC already previewed for it — deriving a
    // cement cost after previewing the batch is the usual way in. A figure computed from
    // the earlier amounts still reads as authoritative, so drop it.
    if (boundRowId) {
      setPreviews((prev) => {
        if (!prev[boundRowId]) return prev;
        const next = { ...prev };
        delete next[boundRowId];
        return next;
      });
    }

    if (mappedEntries.length === 0) {
      toast(`${context?.fileName || 'Bill'}: details extracted, classification mapping needs review.`);
    } else if (!context?.batch) {
      // A run of PDFs already reports itself per file and once at the end; one more toast
      // per bill would bury those.
      toast.success(`Applied bill details and ${mappedEntries.length} classification item(s)`);
    }
  };

  const validateBills = (): string | null => {
    if (!selectedContract) return 'Please select a contract';
    if (!globalZone) return 'Please select a Railway Zone';

    for (let i = 0; i < billRows.length; i++) {
      const row = billRows[i];
      if (!row.billNo.trim()) return `Bill ${i + 1}: Bill number is required`;
      if (!row.dateOfMeasurement) return `Bill ${i + 1}: Date of measurement is required`;
      if (!row.classificationEntries || row.classificationEntries.length === 0) return `Bill ${i + 1}: At least one classification entry is required`;

      const classificationTotal = getClassificationTotal(row);
      if (classificationTotal <= 0) return `Bill ${i + 1}: Classification total must be greater than 0`;

      for (let j = 0; j < row.classificationEntries.length; j++) {
        const entry = row.classificationEntries[j];
        // Recover the id from the classification object if the id string was lost upstream.
        const subId = entry.subClassificationId || (entry.subClassification as any)?.id || '';
        if (!subId) return `Bill ${i + 1}: Classification ${j + 1} must have a sub-classification`;
        // A single entry may be negative — a running bill reverses an earlier
        // over-measurement with a minus quantity. The classification total above is
        // what has to stay positive.
      }
    }

    const billNos = billRows.map((r) => r.billNo.trim());
    const duplicates = billNos.filter((item, index) => billNos.indexOf(item) !== index);
    if (duplicates.length > 0) return `Duplicate bill numbers found: ${duplicates.join(', ')}`;

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateBills();
    if (validationError) { toast.error(validationError); return; }

    try {
      setIsSaving(true);

      const payload = {
        contractId: selectedContract!.id,
        bills: billRows.map((row) => {
          const classificationTotal = getClassificationTotal(row);
          return {
            billNo: row.billNo.trim(),
            dateOfMeasurement: row.dateOfMeasurement,
            isAiUploaded: row.isAiUploaded || false,
            uploadedDocumentId: row.uploadedDocumentId ?? null,
            zone: globalZone,
            fuelPriceType: globalFuelPriceType || 'four_city_avg',
            grossBillAmount: classificationTotal,
            billAmount: classificationTotal,
            extraItemsOutsidePvc: parseFloat(row.extraItemsOutsidePvc || '') || 0,
            steelTmtBarsAmount: parseAmount(row.steelTmtBarsAmount),
            steelAngleChannelAmount: parseAmount(row.steelAngleChannelAmount),
            steelPlatesAmount: parseAmount(row.steelPlatesAmount),
            steelOtherSectionsAmount: parseAmount(row.steelOtherSectionsAmount),
            cementAmount: parseAmount(row.cementAmount),
            classificationEntries: row.classificationEntries.map(entry => ({
              subClassificationId: entry.subClassificationId || (entry.subClassification as any)?.id || '',
              amount: entry.amount === '' || entry.amount === null || entry.amount === undefined
                ? 0 : typeof entry.amount === 'string' ? parseFloat(entry.amount) || 0 : entry.amount,
              description: entry.description || '',
              classificationJustification: entry.classificationJustification || null,
              steelTypes: entry.steelTypes || [],
              itemNumber: entry.itemNumber || null,
              quantity: entry.quantity === '' || entry.quantity === null || entry.quantity === undefined ? null : parseFloat(String(entry.quantity)) || null,
              agreementRate: entry.agreementRate === '' || entry.agreementRate === null || entry.agreementRate === undefined ? null : parseFloat(String(entry.agreementRate)) || null,
              // The rows are the statement: each carries its billed amount (which
              // Qty x Rate cannot reproduce under a special condition), its own
              // description, and the bill page it was read from.
              itemRows: entry.itemRows && entry.itemRows.length > 0 ? entry.itemRows.map(r => ({
                itemNumber: r.itemNumber || '',
                quantity: r.quantity === '' || r.quantity === null || r.quantity === undefined ? null : parseFloat(String(r.quantity)) || null,
                agreementRate: r.agreementRate === '' || r.agreementRate === null || r.agreementRate === undefined ? null : parseFloat(String(r.agreementRate)) || null,
                ...((r as any).amount !== undefined && (r as any).amount !== '' ? { amount: Number((r as any).amount) } : {}),
                ...((r as any).description ? { description: (r as any).description } : {}),
                ...((r as any).pageNumber ? { pageNumber: (r as any).pageNumber } : {}),
                ...((r as any).sourceQty !== undefined ? { sourceQty: (r as any).sourceQty, coefficient: (r as any).coefficient, workUnit: (r as any).workUnit } : {}),
              })) : null,
            })),
            processingFee: processingFee,
          };
        }),
      };

      const response = await fetch('/api/bills/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const error: any = new Error(errorData.error || 'Failed to create bills');
        error.duplicateBills = errorData.duplicateBills;
        error.validationErrors = errorData.validationErrors;
        error.details = errorData.details;
        error.extensionRequired = errorData.extensionRequired;
        throw error;
      }

      const result = await response.json();

      if (result.creditInfo) {
        const { cost, remainingBalance } = result.creditInfo;
        if (remainingBalance === -1) {
          toast.success(`Successfully created ${result.count} bills! (Free Account)`);
        } else {
          toast.success(`Successfully created ${result.count} bills!\n${cost} credits deducted. Remaining balance: ${remainingBalance} credits`);
        }
      } else {
        toast.success(`Successfully created ${result.count} bills!`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      router.push(`/bills?contractId=${selectedContract!.id}&refresh=${Date.now()}`);
    } catch (err: any) {
      const errorMessage = err.message || '';
      if (errorMessage.includes('Insufficient balance') || errorMessage.includes('insufficient credit')) {
        const requiredMatch = errorMessage.match(/Required:\s*₹?([\d,]+\.?\d*)/);
        const availableMatch = errorMessage.match(/Available:\s*₹?([\d,]+\.?\d*)/);
        if (requiredMatch && availableMatch) {
          const required = parseFloat(requiredMatch[1].replace(/,/g, ''));
          const available = parseFloat(availableMatch[1].replace(/,/g, ''));
          setCreditInfo({ currentBalance: available, requiredAmount: required, shortfall: required - available });
          setShowInsufficientCredit(true);
          setIsSaving(false);
          return;
        }
      }
      // A missing time extension is the one blocking reason with a one-click fix, so it
      // gets the inline dialog instead of a wall of red text.
      if (err.extensionRequired) {
        setExtensionInfo(err.extensionRequired);
        toast('These bills run past the contract’s completion date — record the extension to continue.', { icon: '📅', duration: 7000 });
      } else if (err.duplicateBills || err.validationErrors) {
        let msg = 'Failed to create bills:\n\n';
        if (err.duplicateBills?.length > 0) msg += `⚠️ Duplicate bill numbers found:\n${err.duplicateBills.join(', ')}\n\n`;
        if (err.validationErrors?.length > 0) msg += `\n❌ Validation errors:\n${err.validationErrors.join('\n')}`;
        toast.error(msg, { duration: 10000 });
      } else {
        toast.error(err.message || 'Failed to create bills');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="container mx-auto p-6"><LoadingSpinner /></div>;

  return (
    // pb-24 keeps the page's own submit button clear of the sticky bar below.
    <div className="container mx-auto p-6 pb-24 max-w-7xl">
      <nav className="text-sm text-gray-500 flex items-center gap-1.5 mb-6" aria-label="Breadcrumb">
        <Link href="/bills" className="text-emerald-700 font-semibold hover:underline">Bills</Link>
        <span aria-hidden>›</span>
        <span>Bulk bills</span>
      </nav>

      {/* Same page chrome as the single New Bill page: a bold heading over the breadcrumb,
          not a title buried inside a card. */}
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 mt-1 mb-6">Create Multiple Bills</h1>

      {isMaintenanceMode && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Bulk Billing Under Maintenance</h3>
              <p className="mt-2 text-sm text-yellow-700">
                Bulk billing is currently unavailable due to system maintenance. Please try again later.
              </p>
            </div>
          </div>
        </div>
      )}

      <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
          <CardTitle className="flex items-center gap-3 text-lg font-bold text-slate-900">
            <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
              <ClipboardList className="h-6 w-6" />
            </div>
            Bill Details
          </CardTitle>
          <CardDescription className="text-sm text-slate-500 mt-1">
            Create multiple bills for the same contract at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {error && (
            <div ref={errorRef} className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 0 — choose how to build the bills */}
          {billMode === 'choose' && (
            <div className="py-2">
              <h2 className="text-lg font-bold text-slate-900 text-center">How do you want to create these bills?</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Pick one option. You can change it later.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 max-w-3xl mx-auto">
                <button
                  type="button"
                  onClick={() => setBillMode('manual')}
                  className="text-left rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all p-5 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-600 p-2.5 rounded-xl transition-colors">
                      <Edit className="h-6 w-6" />
                    </div>
                    <div className="font-bold text-slate-900">Enter details manually</div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">Add rows yourself or import an Excel sheet.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setBillMode('ai')}
                  className="text-left rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all p-5 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 p-2.5 rounded-xl transition-colors">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div className="font-bold text-slate-900">Upload signed bill PDFs</div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">Pick the whole batch at once. Each PDF is read in turn and becomes its own bill. Charged the AI rate only when you save.</p>
                </button>
              </div>
            </div>
          )}

          {billMode !== 'choose' && (
            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-2.5">
              <span className="text-sm text-muted-foreground">
                Method: <span className="font-semibold text-slate-900">{billMode === 'ai' ? 'PDF upload (AI)' : 'Manual'}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setBillMode('choose')}>Change</Button>
            </div>
          )}

          {billMode !== 'choose' && (
          <>
          {/* Contract Selection */}
          <div className="space-y-2">
            <Label>Select Contract *</Label>
            <Select value={selectedContract?.id} onValueChange={(value) => setSelectedContract(contracts.find(c => c.id === value) || null)}>
              <SelectTrigger><SelectValue placeholder="Select a contract" /></SelectTrigger>
              <SelectContent>
                {contracts.length > 0 ? (
                  contracts.map(contract => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.agreementNo} - {contract.contractorName}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1 text-sm text-muted-foreground">No contracts available</div>
                )}
              </SelectContent>
            </Select>
            {selectedContract && (
              <div className="text-sm text-muted-foreground mt-2 p-3 bg-muted rounded-lg">
                <p><strong>Work:</strong> {selectedContract.workDescription}</p>
                <p><strong>Base Month:</strong> {new Date(selectedContract.baseMonth).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })}</p>
              </div>
            )}
          </div>

          {/* Global Zone & Fuel — selected once for all bills */}
          {selectedContract && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg border">
              <div className="space-y-2">
                <Label>Railway Zone * <span className="text-xs text-muted-foreground">(auto-filled from the contract · applies to all bills)</span></Label>
                <Select value={globalZone || undefined} onValueChange={setGlobalZone} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {getRailwayZoneOptions().map(zone => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.value} ({zone.steelCity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fuel Basis <span className="text-xs text-muted-foreground">(from the contract · applies to all bills)</span></Label>
                <Select value={globalFuelPriceType} onValueChange={setGlobalFuelPriceType} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Fuel basis" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="four_city_avg">4-City Average</SelectItem>
                    <SelectItem value="zone_city">Zone City</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Bills Table */}
          {selectedContract && (
            <div className="space-y-4">
              <Label className="text-lg">Bills</Label>

              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                <p className="text-sm text-emerald-900">
                  <strong>Processing Fee:</strong>{' '}
                  {aiProcessingFee === processingFee ? (
                    <>{processingFee} credits per bill, however it is entered.</>
                  ) : (
                    <>
                      {processingFee} credits for a bill you type in yourself,{' '}
                      {aiProcessingFee} credits for a bill read from a PDF by AI.
                    </>
                  )}{' '}
                  Each bill is charged at its own rate, and the exact total is deducted on submit.
                </p>
              </div>

              {billMode === 'ai' && (
                <BillPdfCementAnalyzer
                  disabled={isSaving}
                  title="AI PDF Bill Extraction"
                  multiple
                  contractId={selectedContract?.id}
                  contractSchedules={selectedContract?.schedules}
                  contractRebate={selectedContract?.rebatePercentage}
                  onApplyBillDetails={applyExtractedBillDetailsToBulkRow}
                  openFilePickerRef={openPdfPickerRef}
                />
              )}

              {/* One card per bill. The table this replaced gave the bill number a 96px box
                  — every number in a batch shares the agreement prefix, so they all read
                  "SR/MDU/Civ…" — hid the classifications behind a dialog, and still scrolled
                  sideways. A card gives each field the width it actually needs. */}
              <div className="space-y-3">
                {billRows.map((row, index) => {
                  const preview = previews[row.id];
                  const codes = row.classificationEntries
                    .map(entry => classificationGroups
                      .flatMap(group => group.subClassifications)
                      .find(sub => sub.id === entry.subClassificationId)?.code || '')
                    .filter(Boolean);
                  // "1A, 1A, 1A, 1B" says less than "1A x3, 1B" and takes more room.
                  const codeCounts = codes.reduce<Record<string, number>>((counts, code) => {
                    counts[code] = (counts[code] || 0) + 1;
                    return counts;
                  }, {});
                  return (
                    <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <span className="text-xs text-slate-400 pb-2.5 w-4 shrink-0">{index + 1}</span>
                        <div className="flex-1 min-w-[200px]">
                          <Label className="text-xs text-slate-600">Bill No *</Label>
                          <Input
                            type="text"
                            value={row.billNo}
                            onChange={(e) => updateBillRow(row.id, 'billNo', e.target.value)}
                            placeholder="SR/MDU/Civil/2024/0037/B8"
                            disabled={isSaving}
                            className="mt-1 h-9"
                          />
                        </div>
                        <div className="w-44">
                          <Label className="text-xs text-slate-600">Date of Measurement *</Label>
                          <Input
                            type="date"
                            value={row.dateOfMeasurement}
                            onChange={(e) => updateBillRow(row.id, 'dateOfMeasurement', e.target.value)}
                            disabled={isSaving}
                            className="mt-1 h-9"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBillRow(row.id)}
                          disabled={isSaving || billRows.length === 1}
                          className="text-destructive hover:text-destructive h-9 w-9 p-0 shrink-0"
                          aria-label={`Remove bill ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {Object.entries(codeCounts).map(([code, count]) => (
                            <span
                              key={code}
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                code.endsWith('B') ? 'bg-emerald-50 text-emerald-800'
                                  : code.endsWith('C') ? 'bg-amber-50 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {code}{count > 1 ? ` ×${count}` : ''}
                            </span>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openClassificationDialog(row.id)}
                            disabled={isSaving}
                            className="h-7 text-xs"
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            {codes.length > 0 ? 'Edit' : 'Add Classifications'}
                          </Button>
                        </div>

                        <div className="flex items-start gap-6 shrink-0">
                          <div className="text-right">
                            <div className="text-[11px] text-slate-500">Bill value</div>
                            <div className="text-sm font-medium tabular-nums">₹{formatAmount(getClassificationTotal(row))}</div>
                          </div>
                          <div className="text-right min-w-[86px]">
                            <div className="text-[11px] text-slate-500">PVC</div>
                            {!preview ? (
                              <div className="text-sm text-slate-400">{previewingRows ? '…' : '—'}</div>
                            ) : 'error' in preview ? (
                              <div className="text-sm text-red-600" title={preview.error}>Failed</div>
                            ) : (
                              <>
                                <div className="text-sm font-medium tabular-nums text-emerald-700">₹{formatAmount(preview.totalPvc)}</div>
                                <div className="text-[10px] text-slate-500">
                                  {preview.quarter}{preview.isProvisional ? ' · provisional' : ''}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* One-line comparison from the preview: item-by-item vs grouped under
                          one class, with a per-bill Group action. Steel/cement stay separate. */}
                      {preview && !('error' in preview) && (preview as any).single?.best && (() => {
                        const s = (preview as any).single;
                        const grouped = Number(s.best.total) || 0;
                        const diff = grouped - preview.totalPvc;
                        return (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px]">
                            <span className="text-slate-600">
                              Grouped under <b>{s.best.code}</b>: <b className={diff > 0.005 ? 'text-indigo-700' : 'text-slate-700'}>₹{formatAmount(grouped)}</b>
                              <span className="text-slate-400"> ({diff >= 0 ? '+' : '−'}₹{formatAmount(Math.abs(diff))} vs item-by-item)</span>
                            </span>
                            {(s.candidates?.length ?? 0) > 1 && (
                              <span className="text-slate-400">tried: {s.candidates.map((c: any) => `${c.code} ₹${formatAmount(c.total)}${Number.isFinite(c.matchPct) ? ` (fits ${c.matchPct}%)` : ''}`).join(' · ')}</span>
                            )}
                            {s.guideline && (
                              <span className="text-slate-500">guideline: pick by match — group <b>{s.guideline.bestMatchDigit}</b> holds {s.guideline.bestMatchPct}% of this bill&apos;s general work</span>
                            )}
                            {s.composite && (
                              <span className="text-amber-700">composite work — item-by-item is the compliant method</span>
                            )}
                            <button
                              type="button"
                              onClick={() => groupRowUnderClass(row.id, s.best)}
                              disabled={isSaving}
                              className="ml-auto rounded border border-indigo-300 px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                              Group under {s.best.code}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                {/* The cards give up the table's totals row, so the batch is summed here
                    — a bulk entry is worth checking as a whole before it is committed. */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>Total Bills: <Badge variant="secondary">{billRows.length}</Badge></span>
                  <span>
                    Batch value: <span className="font-medium text-slate-800 tabular-nums">
                      ₹{formatAmount(billRows.reduce((sum, row) => sum + getClassificationTotal(row), 0))}
                    </span>
                  </span>
                  {(() => {
                    const priced = billRows.filter(row => {
                      const preview = previews[row.id];
                      return preview && !('error' in preview);
                    });
                    if (priced.length === 0) return null;
                    const total = priced.reduce((sum, row) => sum + (previews[row.id] as { totalPvc: number }).totalPvc, 0);
                    return (
                      <span>
                        PVC: <span className="font-medium text-emerald-700 tabular-nums">₹{formatAmount(total)}</span>
                        {priced.length < billRows.length && (
                          <span className="text-xs"> ({priced.length} of {billRows.length})</span>
                        )}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving ? (
                      <><LoadingSpinner className="mr-2" />Creating...</>
                    ) : (
                      <><Save className="h-4 w-4 mr-2" />Create {billRows.length} Bill{billRows.length > 1 ? 's' : ''}</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>

      <InsufficientCreditDialog
        open={showInsufficientCredit}
        onClose={() => setShowInsufficientCredit(false)}
        currentBalance={creditInfo.currentBalance}
        requiredAmount={creditInfo.requiredAmount}
        shortfall={creditInfo.shortfall}
      />

      <Dialog open={showClassificationDialog} onOpenChange={setShowClassificationDialog}>
        {/* overflow-x-hidden as a backstop: one over-wide child used to widen the whole
            dialog and leave a horizontal scrollbar across the bottom. */}
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Manage Bill Classifications</DialogTitle>
            <DialogDescription>
              {editingBillId && getEditingBill() && <>Bill: {getEditingBill()?.billNo || 'New Bill'}</>}
            </DialogDescription>
          </DialogHeader>
          {editingBillId && getEditingBill() && (
            <BillClassificationEntries
              value={getEditingBill()!.classificationEntries}
              onChange={(entries) => updateClassificationEntries(editingBillId, entries)}
              classificationGroups={classificationGroups}
              workDescription={selectedContract?.workDescription}
              contractSchedules={scheduleNames(selectedContract?.schedules)}
              scheduleRates={normalizeSchedules(selectedContract?.schedules)}
              contractId={selectedContract?.id}
              measurementDate={getEditingBill()?.dateOfMeasurement || undefined}
              lockEntries={!!getEditingBill()?.isAiUploaded}
            />
          )}

          {/* Per bill, because extra items are ordered per bill. */}
          {editingBillId && getEditingBill() && (
            <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Label htmlFor="bulkExtraItems" className="text-sm font-semibold text-amber-900">
                Extra items outside PVC (Cl. 39(1)(b))
              </Label>
              <p className="text-[11px] text-amber-800">
                Value of extra items ordered during execution, outside the tender&apos;s Bill of Quantities.
                Clause 46A.1(b) keeps these out of the value the variation is worked out on — unless PVC and a
                base month were specially agreed when their rates were fixed, in which case leave it blank.
                The bill is still paid in full; only the variation is not computed on this part.
              </p>
              <Input
                id="bulkExtraItems"
                type="number"
                step="0.01"
                min="0"
                value={getEditingBill()?.extraItemsOutsidePvc || ''}
                onChange={(event) => setBillRows(rows => rows.map(row => (
                  row.id === editingBillId ? { ...row, extraItemsOutsidePvc: event.target.value } : row
                )))}
                placeholder="0.00"
                className="bg-white max-w-xs"
              />
            </div>
          )}

          {/* Deriving cement out of DSR items is off — see lib/cement-derivation.ts. */}
          {CEMENT_DERIVATION_ENABLED && editingBillId && getEditingBill() && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">No direct cement item? Derive it from your items.</p>
                  <p className="text-[11px] text-slate-500">Uses the item numbers &amp; quantities above + DSR 2021 cement coefficients.</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={derivingCement}
                  onClick={deriveCementFromItems}
                  className="border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100">
                  {derivingCement ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deriving…</>) : (<><ClipboardList className="mr-2 h-4 w-4" /> Derive cement from items</>)}
                </Button>
              </div>
              {cementUnmatched.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                  <p className="font-semibold text-amber-900">No cement coefficient for {cementUnmatched.length} item number{cementUnmatched.length > 1 ? 's' : ''}:</p>
                  <p className="mt-1 font-mono text-amber-800">{cementUnmatched.join(', ')}</p>
                  <p className="mt-1.5 text-amber-700">Add them in{' '}
                    <Link href="/admin/dsr-cement-coefficients" target="_blank" className="underline font-medium">Admin → Cement Coefficients</Link>, then press Derive again.
                  </p>
                </div>
              )}
              {cementSchedules.length > 0 && (
                <DsrCementCalculator
                  schedules={cementSchedules}
                  contractId={selectedContract?.id || undefined}
                  contractSchedules={selectedContract?.schedules}
                  contractRebate={selectedContract?.rebatePercentage}
                  onApply={applyDerivedCement}
                />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowClassificationDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The two actions used over and over while filling a batch. A long list pushes
          them off the top of the screen, so they stay within reach at the bottom. */}
      {selectedContract && billMode !== 'choose' && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <Button type="button" size="sm" variant="outline" onClick={addBillRow} disabled={isSaving} className="rounded-full">
              <Plus className="h-4 w-4 mr-1.5" />Add Bill
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void previewAllRows()}
              disabled={isSaving || previewingRows}
              className="rounded-full"
            >
              {previewingRows
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Calculator className="h-4 w-4 mr-1.5" />}
              {previewingRows ? 'Checking PVC…' : 'Preview PVC'}
            </Button>
            {/* No "Upload bill PDFs" here: the big drop zone above already is the
                uploader in AI mode, and a second button that opens the same picker read
                as two ways to do one thing. */}
          </div>
        </div>
      )}

      <AddExtensionDialog
        open={!!extensionInfo}
        onOpenChange={(o) => { if (!o) setExtensionInfo(null); }}
        info={extensionInfo}
        onSaved={() => { setExtensionInfo(null); handleSubmit(); }}
      />
    </div>
  );
}
