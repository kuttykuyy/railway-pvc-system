'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertCircle, CheckCircle2, Plus, Trash2, Sparkles, Pencil, X, Upload, Download, ChevronRight } from 'lucide-react';

import { BillAmountCalculator } from './bill-amount-calculator';
import { ClassificationComparisonDialog } from './classification-comparison-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inferMainClassification } from '@/lib/work-classification';
import { findScheduleRates, findSubWorkRates, type ContractSchedule } from '@/lib/contract-schedules';
import { scheduleTag } from '@/lib/bill-schedule-matching';

interface SubClassification {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  groupId: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  isActive?: boolean;
  isDefault?: boolean;
}

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  subClassifications: SubClassification[];
}

interface ItemRow {
  itemNumber: string;
  quantity: number | string | '';
  agreementRate: number | string | '';
  /** The billed amount, where extraction saved it — differs from Qty x Rate under a special condition. */
  amount?: number | string | '';
  /**
   * What this item is. Items sharing a classification merge into one entry, and the
   * entry then shows the sub-work's name — so five rows of ballast, track-lifting and
   * rail-laying all read "Provision of CC apron and Complete Track renewal" with
   * nothing to say what each figure was for.
   */
  description?: string;
  /** Which page of the bill PDF this row was read from. */
  pageNumber?: number;
  rateBookEdition?: string;
  rateBookCode?: string;
}

interface ClassificationEntry {
  id?: string;
  mainClassificationGroupId?: string;
  subClassificationId: string;
  subClassification?: SubClassification;
  amount: number | string | '';
  description?: string;
  steelTypes?: string[];
  scheduleItem?: string;
  itemNumber?: string;
  quantity?: number | string | '';
  agreementRate?: number | string | '';
  itemRows?: ItemRow[];
  classificationJustification?: string;
  /** True when the AI reviewed/wrote this item's classification (vs rule-based). */
  aiReviewed?: boolean;
  /** True once the user manually picks a classification — rebuilds and the automatic
   * PVC comparison must never override a manual choice. */
  manualClassification?: boolean;
  /** True for a "Cement (derived)" row split out of the work items by the DSR calculator,
   * so re-applying can fold it back in first (keeps the bill total stable). */
  isDerivedCement?: boolean;
}

interface BillClassificationEntriesProps {
  value: ClassificationEntry[];
  onChange: (entries: ClassificationEntry[]) => void;
  classificationGroups: ClassificationGroup[];
  workDescription?: string;
  grossBillAmount?: number;
  /** When provided, the "Gross bill" figure becomes an editable field the user types the bill amount into. */
  onGrossBillAmountChange?: (value: number) => void;
  /** Show a floating summary bar (classification total / gross bill / difference) fixed at the bottom. */
  floatingSummary?: boolean;
  contractSchedules?: string[];
  /** Full schedule rate settings (name + escalation % + bid rate %) from the contract,
   * used to adjust each entry's amount by its schedule's rates before PVC. */
  scheduleRates?: ContractSchedule[];
  indicesData?: { base: { [key: string]: number }; current: { [key: string]: number } } | null;
  contractId?: string;
  measurementDate?: string;
  /** When true (bill built from a PDF extraction), entries render read-only and each
   * one needs its Edit button clicked before it can be changed. */
  lockEntries?: boolean;
  /** Fee (₹) charged each time "Generate with AI" is used, shown as a hint.
   * The charge itself is taken server-side when the AI runs. 0 hides the hint. */
  aiJustificationFee?: number;
}

const STEEL_TYPES = [
  { value: 'TMT', label: 'TMT' },
  { value: 'ANGLE_CHANNEL', label: 'Structural' },
  { value: 'PLATES', label: 'Plates' },
  { value: 'OTHER_SECTIONS', label: 'Other' },
];

// Mirrors GST_RATE in lib/billing. Defined locally on purpose: lib/billing imports
// prisma, and importing it here would pull the server DB chain into the client bundle.
const AGREEMENT_GST_RATE = 0.18;

function formatMoney(value: number) {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BillClassificationEntries({
  value = [],
  onChange,
  classificationGroups = [],
  workDescription,
  grossBillAmount,
  onGrossBillAmountChange,
  floatingSummary = false,
  contractSchedules = [],
  scheduleRates = [],
  indicesData = null,
  contractId,
  measurementDate,
  lockEntries = false,
  aiJustificationFee = 0,
}: BillClassificationEntriesProps) {
  // Fully controlled: `value` is the single source of truth (aliased to `entries` for
  // readability). Every edit goes straight to onChange, so a manual classification change
  // can't be reverted by a local-copy/prop mismatch.
  const entries = value;
  // Which locked entries the user has explicitly opened for editing (by index).
  const [unlockedEntries, setUnlockedEntries] = useState<Set<number>>(new Set());
  // Per-entry state for the on-demand AI justification button.
  const [justifyingIndex, setJustifyingIndex] = useState<number | null>(null);
  // Whether the entered agreement rates already include GST (varies by agreement).
  const [ratesIncludeGst, setRatesIncludeGst] = useState(false);
  // Accordion: which entry is expanded for editing (one at a time). null = all collapsed.
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const requiredMainCode = useMemo(
    () => workDescription ? inferMainClassification(workDescription).code : '',
    [workDescription],
  );
  const requiredGroup = useMemo(
    () => classificationGroups.find(group => group.code.toUpperCase() === requiredMainCode.toUpperCase()),
    [classificationGroups, requiredMainCode],
  );

  const commit = (nextEntries: ClassificationEntry[]) => {
    onChange(nextEntries);
  };

  const getRows = (entry: ClassificationEntry): ItemRow[] => {
    if (entry.itemRows?.length) return entry.itemRows;
    if (entry.itemNumber || entry.quantity || entry.agreementRate) {
      return [{
        itemNumber: entry.itemNumber || '',
        quantity: entry.quantity ?? '',
        agreementRate: entry.agreementRate ?? '',
      }];
    }
    return [{ itemNumber: '', quantity: '', agreementRate: '' }];
  };

  // Agreement rates are quoted either with or without GST depending on the agreement.
  // PVC must be computed on the work value EXCLUDING GST, so when the rates include
  // it, strip GST back out of the row total.
  const rowsTotal = (rows: ItemRow[], includeGst: boolean = ratesIncludeGst) => {
    const gross = rows.reduce((sum, row) => {
      const byRate = (Number(row.quantity) || 0) * (Number(row.agreementRate) || 0);
      // A special-condition row pays an amount Qty x Rate cannot reproduce — a rate
      // revision has quantity zero. Where the extraction saved the billed amount, that
      // is the figure; multiplying would price the row at nothing.
      return sum + (byRate !== 0 ? byRate : Number(row.amount) || 0);
    }, 0);
    const net = includeGst ? gross / (1 + AGREEMENT_GST_RATE) : gross;
    return Math.round(net * 100) / 100;
  };

  // Per-schedule rate adjustment: the amount is the estimate value, and the agreed
  // bid rate % and escalation % (from the contract, for this entry's schedule) are
  // applied on top before PVC — factor = (1 + bid/100) x (1 + escalation/100).
  // By sub-work, not only by schedule: the LOA awards each sub-work its own bid and
  // escalation, and one schedule of SR/TPJ/Civil/2025/0067 carries three escalations.
  // The entry's description holds the bill's sub-work heading, which is the same work
  // the LOA priced.
  const scheduleFactor = (scheduleItem?: string, subWork?: string) => {
    const rates = findSubWorkRates(scheduleRates, scheduleItem || '', subWork);
    if (!rates) return 1;
    const bid = Number(rates.bidRate) || 0;
    const esc = Number(rates.escalation) || 0;
    return (1 + bid / 100) * (1 + esc / 100);
  };
  const factorPct = (scheduleItem?: string, subWork?: string) =>
    Math.round((scheduleFactor(scheduleItem, subWork) - 1) * 10000) / 100;

  // Amount actually stored for an entry: row total (GST-adjusted) x its schedule factor.
  // Derived-cement rows already have escalation/bid/rebate baked into the DSR cement rate,
  // so the schedule factor must NOT be applied again to them.
  const deriveAmount = (entry: ClassificationEntry, rows: ItemRow[], includeGst: boolean = ratesIncludeGst) => {
    const factor = entry.isDerivedCement ? 1 : scheduleFactor(entry.scheduleItem, entry.description);
    return Math.round(rowsTotal(rows, includeGst) * factor * 100) / 100;
  };

  // Switching the GST basis re-derives every amount from its rows, so the toggle is
  // lossless — the raw entered rates never change and it can be flipped back. Entries
  // whose amount was typed directly (no quantity x rate) are left untouched.
  const applyGstBasis = (nextIncludeGst: boolean) => {
    setRatesIncludeGst(nextIncludeGst);
    const nextEntries = entries.map(entry => {
      const rows = getRows(entry);
      const derivable = rows.some(r => (Number(r.quantity) || 0) > 0 && (Number(r.agreementRate) || 0) > 0);
      if (!derivable) return entry;
      return { ...entry, amount: deriveAmount(entry, rows, nextIncludeGst) };
    });
    commit(nextEntries);
  };

  const updateEntry = (entryIndex: number, patch: Partial<ClassificationEntry>) => {
    const nextEntries = [...entries];
    const nextEntry = { ...nextEntries[entryIndex], ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'subClassificationId')) {
      const selectedSub = classificationGroups
        .flatMap(group => group.subClassifications)
        .find(sub => sub.id === patch.subClassificationId);
      const previousSubId = nextEntries[entryIndex]?.subClassificationId;
      if (selectedSub) {
        nextEntry.subClassification = selectedSub;
        nextEntry.mainClassificationGroupId = selectedSub.groupId;
        // The previous justification (including its "price variation" comparison) was
        // written for the OLD classification, so it is now stale. When the user picks a
        // different class, replace it with a formal GCC-clause note for the newly-selected
        // classification (matching the railway documentation format used elsewhere).
        if (previousSubId && previousSubId !== selectedSub.id) {
          const group = classificationGroups.find(g => g.id === selectedSub.groupId);
          nextEntry.classificationJustification = group
            ? `The item is classified under GCC 46A as Group ${group.code} - ${group.name}, Sub-classification ${selectedSub.code} (${selectedSub.name}), as manually selected.`
            : `The item is classified under GCC 46A as Sub-classification ${selectedSub.code} (${selectedSub.name}), as manually selected.`;
        }
      }
      // When the patched id can't be resolved (e.g. an empty group), keep the previous
      // subClassification object — it carries the code used to self-heal stale ids.
      // A user-picked classification is final: entry rebuilds (re-extraction, cement
      // apply) and the automatic PVC comparison must not override it.
      nextEntry.manualClassification = true;
    }
    // Changing the schedule changes the bid/escalation factor, so re-derive the amount
    // from the raw rows under the new schedule (only when the rows drive the amount).
    if (Object.prototype.hasOwnProperty.call(patch, 'scheduleItem')) {
      const rows = getRows(nextEntry);
      const derivable = rows.some(r => (Number(r.quantity) || 0) > 0 && (Number(r.agreementRate) || 0) > 0);
      if (derivable) nextEntry.amount = deriveAmount(nextEntry, rows);
    }
    nextEntries[entryIndex] = nextEntry;
    commit(nextEntries);
  };

  // Fully resets an entry's classification (group + sub + attached object) so the
  // user can re-select from scratch — the escape hatch for any stuck/orphaned state.
  const clearClassification = (entryIndex: number) => {
    const nextEntries = [...entries];
    nextEntries[entryIndex] = {
      ...nextEntries[entryIndex],
      mainClassificationGroupId: undefined,
      subClassificationId: '',
      subClassification: undefined,
      // Deliberate user action: keep the entry out of the automatic PVC comparison
      // until they pick a classification themselves.
      manualClassification: true,
    };
    commit(nextEntries);
  };

  // Ask the AI to write the "why this classification" justification for an item.
  // On-demand only (button click) so it never burns AI credit on every dropdown change.
  const generateJustification = async (entryIndex: number) => {
    const entry = entries[entryIndex];
    const sub = classificationGroups.flatMap(group => group.subClassifications)
      .find(s => s.id === entry.subClassificationId) || entry.subClassification;
    if (!sub) return;
    const group = classificationGroups.find(g => g.id === sub.groupId);
    setJustifyingIndex(entryIndex);
    try {
      const res = await fetch('/api/bills/classification-justification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemDescription: entry.description || '',
          itemNumber: entry.itemNumber || '',
          amount: entry.amount,
          subCode: sub.code,
          subName: sub.name,
          groupCode: group?.code || '',
          groupName: group?.name || '',
          workDescription: workDescription || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.justification) {
        toast.error(data.error || 'Could not generate a justification. Please try again.');
        return;
      }
      updateEntry(entryIndex, { classificationJustification: data.justification });
      toast.success(data.charged > 0
        ? `AI justification added — ₹${data.charged} charged.`
        : 'AI justification added to this item.');
    } catch {
      toast.error('The request failed. Please try again.');
    } finally {
      setJustifyingIndex(null);
    }
  };

  const updateItemRow = (entryIndex: number, rowIndex: number, patch: Partial<ItemRow>) => {
    const nextEntries = [...entries];
    const rows = [...getRows(nextEntries[entryIndex])];
    rows[rowIndex] = { ...rows[rowIndex], ...patch };
    const firstRow = rows[0];
    nextEntries[entryIndex] = {
      ...nextEntries[entryIndex],
      itemRows: rows,
      itemNumber: firstRow?.itemNumber || '',
      quantity: firstRow?.quantity ?? '',
      agreementRate: firstRow?.agreementRate ?? '',
      amount: deriveAmount(nextEntries[entryIndex], rows),
    };
    commit(nextEntries);
  };

  const addEntry = () => {
    const group = requiredGroup || classificationGroups[0];
    const sub = group?.subClassifications.find(item => item.isDefault) || group?.subClassifications[0];
    // A freshly added entry is the user's own — editable immediately even in locked mode.
    setUnlockedEntries(prev => new Set(prev).add(entries.length));
    setExpandedEntry(entries.length); // open the new one for editing
    commit([...entries, {
      subClassificationId: sub?.id || '',
      subClassification: sub,
      amount: 0,
      description: '',
      itemRows: [{ itemNumber: '', quantity: '', agreementRate: '' }],
    }]);
  };

  // Import item rows (item number + quantity + agreement rate) from an Excel/CSV file into
  // a new classification entry, so the user doesn't type each row. Header names are matched
  // loosely (Item No / Qty / Agreement Rate, etc.), so most sheets work as-is.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const pickField = (row: Record<string, any>, keys: string[]) => {
    for (const k of Object.keys(row)) {
      const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keys.includes(norm)) return row[k];
    }
    return '';
  };

  const handleImportItems = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      // Parse each row: item + optional classification code + optional schedule.
      const allSubs = classificationGroups.flatMap(g => g.subClassifications);
      const findSub = (raw: any) => {
        const norm = String(raw || '').trim().toLowerCase();
        if (!norm) return null;
        return allSubs.find(s => (s.code || '').toLowerCase() === norm)
          || allSubs.find(s => (s.name || '').toLowerCase() === norm)
          || allSubs.find(s => {
            const c = (s.code || '').toLowerCase();
            return !!c && (c.startsWith(norm) || norm.startsWith(c));
          })
          || null;
      };

      type Parsed = { itemNumber: string; quantity: number | ''; agreementRate: number | ''; classCode: string; schedule: string };
      const parsed: Parsed[] = rows
        .map(r => {
          const q = pickField(r, ['quantity', 'qty', 'quantityexecuted', 'quantitysincelastbill']);
          const rate = pickField(r, ['agreementrate', 'rate', 'rateinrs', 'agreementrateinrs', 'agrate']);
          return {
            itemNumber: String(pickField(r, ['itemnumber', 'itemno', 'item', 'itemcode', 'dsrcode', 'no']) || '').trim(),
            quantity: q === '' ? '' as const : (Number(q) || ''),
            agreementRate: rate === '' ? '' as const : (Number(rate) || ''),
            classCode: String(pickField(r, ['classification', 'class', 'classificationcode', 'subclassification', 'subclass', 'classcode']) || '').trim(),
            schedule: String(pickField(r, ['schedule', 'scheduleitem', 'schedulename']) || '').trim(),
          };
        })
        .filter(r => r.itemNumber || Number(r.quantity) > 0 || Number(r.agreementRate) > 0);

      if (parsed.length === 0) {
        toast.error('No items found. Expected columns: Item No, Quantity, Agreement Rate (optional: Classification, Schedule).');
        return;
      }

      // Group by classification + schedule so each combination becomes one row. When no
      // classification column is present, everything lands in a single default entry.
      const groups = new Map<string, Parsed[]>();
      for (const p of parsed) {
        const key = `${p.classCode.toLowerCase()}||${p.schedule.toLowerCase()}`;
        (groups.get(key) || groups.set(key, []).get(key)!).push(p);
      }

      const defGroup = requiredGroup || classificationGroups[0];
      const defSub = defGroup?.subClassifications.find(s => s.isDefault) || defGroup?.subClassifications[0];
      let unmatchedClass = 0;
      const newEntries: ClassificationEntry[] = [];
      for (const list of groups.values()) {
        const itemRows: ItemRow[] = list.map(p => ({ itemNumber: p.itemNumber, quantity: p.quantity, agreementRate: p.agreementRate }));
        const classCode = list[0].classCode;
        const sub = (classCode && findSub(classCode)) || defSub;
        if (classCode && !findSub(classCode)) unmatchedClass++;
        const scheduleItem = list[0].schedule;
        const first = itemRows[0];
        newEntries.push({
          subClassificationId: sub?.id || '',
          subClassification: sub,
          mainClassificationGroupId: sub?.groupId,
          amount: deriveAmount({ scheduleItem } as ClassificationEntry, itemRows),
          description: '',
          scheduleItem,
          manualClassification: !!(classCode && findSub(classCode)),
          itemNumber: first.itemNumber,
          quantity: first.quantity,
          agreementRate: first.agreementRate,
          itemRows,
        });
      }

      setUnlockedEntries(prev => {
        const nextSet = new Set(prev);
        newEntries.forEach((_, i) => nextSet.add(entries.length + i));
        return nextSet;
      });
      commit([...entries, ...newEntries]);
      const itemCount = parsed.length;
      toast.success(
        `Imported ${itemCount} item(s) into ${newEntries.length} classification row(s).`
        + (unmatchedClass ? ` ${unmatchedClass} used the default class (code not found) — please check.` : ''),
      );
    } catch (err) {
      console.error('item import failed:', err);
      toast.error('Could not read that file. Please use the template.');
    } finally {
      setImporting(false);
    }
  };

  const downloadItemsTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet([
      { 'Item No': '1130 10 (G)', 'Quantity': 100, 'Agreement Rate': 4500.5, 'Classification': '', 'Schedule': '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'bill-items-template.xlsx');
  };

  const addItemRow = (entryIndex: number) => {
    const rows = [...getRows(entries[entryIndex]), { itemNumber: '', quantity: '', agreementRate: '' }];
    updateEntry(entryIndex, { itemRows: rows });
  };

  const removeItemRow = (entryIndex: number, rowIndex: number) => {
    const rows = getRows(entries[entryIndex]).filter((_, index) => index !== rowIndex);
    if (!rows.length) rows.push({ itemNumber: '', quantity: '', agreementRate: '' });
    const firstRow = rows[0];
    updateEntry(entryIndex, {
      itemRows: rows,
      itemNumber: firstRow.itemNumber,
      quantity: firstRow.quantity,
      agreementRate: firstRow.agreementRate,
      amount: deriveAmount(entries[entryIndex], rows),
    });
  };

  const totalAmount = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const amountDifference = grossBillAmount ? totalAmount - grossBillAmount : 0;
  const amountMatches = !grossBillAmount || Math.abs(amountDifference) < 0.01;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Work classifications</h2>
            <Badge variant="outline">{entries.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">Review classification, item values, and payable amount.</p>
        </div>
        {requiredGroup && (
          <div className="text-right text-xs">
            <div className="text-slate-500">Work group from Name of Work</div>
            <div className="font-semibold text-slate-800">{requiredGroup.code} - {requiredGroup.name}</div>
          </div>
        )}
      </div>

      {/* Some agreements quote rates with GST, some without. PVC needs the GST-free value. */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-600">Agreement rate:</span>
        <div className="flex overflow-hidden rounded-md border border-slate-300">
          <button
            type="button"
            onClick={() => applyGstBasis(false)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${!ratesIncludeGst ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            Excluding GST
          </button>
          <button
            type="button"
            onClick={() => applyGstBasis(true)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${ratesIncludeGst ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            Including GST
          </button>
        </div>
        {/* GCC-2022 defines W as the "Gross value of work done as per on-account bill(s)",
            and lists what comes out of it — the supply buckets and railway-supplied
            material. GST is not among them, and IREPS bills are raised at rates marked
            "Rate is inclusive of GST: Yes". So the bill value as billed IS the base, and
            stripping 18% understates the PVC. The old wording asserted the opposite
            ("PVC uses the GST-free value"), which is how this became a trap. */}
        {/* basis-full min-w-0: a flex item will not shrink below its content by default,
            so this paragraph — the longest string on the panel — set the width of the
            whole dialog and put a horizontal scrollbar under it, with its own last
            words cut off. It gets a line of its own and wraps. */}
        <span className={`basis-full min-w-0 text-[11px] ${ratesIncludeGst ? 'text-amber-700' : 'text-slate-500'}`}>
          {ratesIncludeGst
            ? `Caution: this removes ${(AGREEMENT_GST_RATE * 100).toFixed(0)}% from items entered as quantity × rate. GCC Cl.46A takes W as the gross value per the on-account bill and does not exclude GST, so on a bill raised at GST-inclusive rates this understates the PVC by ${(AGREEMENT_GST_RATE * 100).toFixed(0)}%. Use only if your accounts office has directed a GST-free base in writing.`
            : 'Items are used for PVC exactly as billed — the correct basis under GCC Cl.46A.'}
          {' '}Only items with a quantity × rate are recalculated; amounts you type in directly stay unchanged.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-sm md:grid-cols-3">
        <div className="bg-white px-3 py-2">
          <div className="text-xs text-slate-500">Classification total</div>
          <div className="font-semibold">Rs {formatMoney(totalAmount)}</div>
        </div>
        <div className="bg-white px-3 py-2">
          <div className="text-xs text-slate-500">Gross bill (enter bill amount)</div>
          {onGrossBillAmountChange ? (
            <Input
              type="number"
              step="0.01"
              value={grossBillAmount ? String(grossBillAmount) : ''}
              onChange={(e) => onGrossBillAmountChange(e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="Enter bill amount"
              className="h-8 text-sm font-semibold mt-0.5"
            />
          ) : (
            <div className="font-semibold">{grossBillAmount ? `Rs ${formatMoney(grossBillAmount)}` : '-'}</div>
          )}
        </div>
        <div className="col-span-2 flex items-center justify-between bg-white px-3 py-2 md:col-span-1">
          <div>
            <div className="text-xs text-slate-500">Difference</div>
            <div className={amountMatches ? 'font-semibold text-green-700' : 'font-semibold text-orange-700'}>
              Rs {formatMoney(Math.abs(amountDifference))}
            </div>
          </div>
          {amountMatches
            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
            : <AlertCircle className="h-4 w-4 text-orange-600" />}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="divide-y divide-slate-200">
          {entries.map((entry, entryIndex) => {
            const allSubs = classificationGroups.flatMap(group => group.subClassifications);
            // Resolve the entry's classification by id; when the stored id doesn't match
            // any loaded sub (stale id from an older dataset), fall back to the attached
            // classification object's CODE, which is stable. Without this, the sub select
            // rendered blank and the main select fell back to the inferred group — making
            // the classification look stuck/unchangeable.
            const currentSub = allSubs.find(sub => sub.id === entry.subClassificationId)
              || (entry.subClassification?.code
                ? allSubs.find(sub => sub.code.toUpperCase() === entry.subClassification!.code.toUpperCase())
                : undefined);
            const explicitGroup = classificationGroups.find(
              group => group.id === entry.mainClassificationGroupId,
            );
            const subGroup = currentSub
              ? classificationGroups.find(group => group.id === currentSub.groupId)
              : undefined;
            // The group that actually contains the entry's sub-classification wins.
            // If mainClassificationGroupId ever disagrees with the sub (a half-applied
            // update), trusting the explicit group would render a blank Sub select and
            // a Main select that looks stuck on the wrong group — the entry's real
            // classification is the sub, so display its group and stay editable.
            // No inferred-group fallback: an entry without a resolvable classification
            // (e.g. just cleared) shows the "Select group" placeholder, not a guess.
            const selectedGroup = subGroup || explicitGroup;
            const selectedSub = currentSub?.groupId === selectedGroup?.id ? currentSub : undefined;
            const scheduleInList = !entry.scheduleItem || contractSchedules.includes(entry.scheduleItem);
            const rows = getRows(entry);
            const displayedAmount = typeof entry.amount === 'number'
              ? Number(entry.amount.toFixed(2))
              : entry.amount;
            const locked = lockEntries && !unlockedEntries.has(entryIndex);
            const isExpanded = expandedEntry === entryIndex;
            const summaryCode = selectedSub?.code || selectedGroup?.code || '—';
            const classificationName = selectedSub?.name || selectedGroup?.name || 'Select classification';
            // What this entry is FOR, not what its class is called. The class name is the
            // same words on every row sharing a class — nine rows reading "All Items
            // (excluding 5B/5C/5D/5E)" tell you nothing about which is which. The bill's
            // own sub-work heading is what separates them, and the entry carries it.
            const subWork = String(entry.description || '').trim();
            const summaryName = subWork && subWork !== classificationName ? subWork : classificationName;
            const rowCount = (rows || []).filter(r => r.itemNumber || r.quantity || r.agreementRate).length;

            return (
              <section key={entry.id || entryIndex} className="p-3">
                {/* Clickable summary row — collapsed view */}
                <div
                  onClick={() => setExpandedEntry(isExpanded ? null : entryIndex)}
                  className="flex items-center gap-3 cursor-pointer select-none"
                >
                  <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{summaryCode}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{summaryName}</span>
                  {/* The bill names a schedule in a whole sentence, and when the contract
                      lists none of its own that sentence is what gets stored. Printed
                      whole and told never to wrap, it set the width of every row. Only
                      the tag tells one schedule from another; the rest is on hover. */}
                  <span
                    className="hidden sm:block max-w-[14rem] shrink-0 truncate text-xs text-slate-400"
                    title={entry.scheduleItem || undefined}
                  >
                    {entry.scheduleItem ? `Sch ${scheduleTag(entry.scheduleItem)} · ` : ''}{rowCount || 0} item{rowCount === 1 ? '' : 's'}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">Rs {formatMoney(Number(entry.amount) || 0)}</span>
                  {entry.aiReviewed && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">AI</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={locked}
                    onClick={(e) => { e.stopPropagation(); commit(entries.filter((_, index) => index !== entryIndex)); }}
                    className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    title="Delete entry"
                    aria-label={`Delete entry ${entryIndex + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {isExpanded && (
                <div className="space-y-4 pt-3 mt-3 border-t border-slate-100">
                {locked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUnlockedEntries(prev => new Set(prev).add(entryIndex))}
                    className="h-8 px-2 text-xs"
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Enable editing
                  </Button>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5 min-w-0">
                    <label htmlFor={`main-classification-${entryIndex}`} className="text-xs font-medium text-slate-600">Main classification</label>
                    <div className="flex items-center gap-1">
                      <select
                        id={`main-classification-${entryIndex}`}
                        data-testid={`main-classification-${entryIndex}`}
                        value={selectedGroup?.id || ''}
                        onChange={event => {
                          const groupId = event.target.value;
                          const group = classificationGroups.find(item => item.id === groupId);
                          const defaultSub = group?.subClassifications.find(sub => sub.isDefault)
                            || group?.subClassifications[0];
                          // Never write an empty sub id: if the picked group has no subs
                          // loaded, keep the current sub instead of blanking the entry.
                          updateEntry(entryIndex, {
                            mainClassificationGroupId: groupId,
                            ...(defaultSub ? { subClassificationId: defaultSub.id } : {}),
                          });
                        }}
                        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        <option value="" disabled>Select group</option>
                        {classificationGroups.map(group => (
                          <option key={group.id} value={group.id}>{group.code} - {group.name}</option>
                        ))}
                      </select>
                      {(entry.subClassificationId || entry.mainClassificationGroupId) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={locked}
                          onClick={() => clearClassification(entryIndex)}
                          className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600 disabled:opacity-40"
                          title="Clear classification (reset both dropdowns)"
                          aria-label={`Clear classification for entry ${entryIndex + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-xs font-medium text-slate-600">Sub classification</label>
                    <div className="flex items-center gap-1">
                      <Select
                        value={currentSub && selectedGroup?.subClassifications.some(sub => sub.id === currentSub.id)
                          ? currentSub.id
                          : ''}
                        onValueChange={subClassificationId => {
                          // Ignore the spurious empty callback Radix fires when the group
                          // changes and the previously-selected sub leaves the item list —
                          // it would otherwise wipe the classification the user just picked.
                          // (Clearing is done via the dedicated Clear button, not here.)
                          if (subClassificationId) updateEntry(entryIndex, { subClassificationId });
                        }}
                      >
                        <SelectTrigger className="h-9 bg-white text-sm">
                          <SelectValue placeholder="Select classification" />
                        </SelectTrigger>
                        <SelectContent>
                          {(selectedGroup?.subClassifications || []).map(sub => (
                            <SelectItem key={sub.id} value={sub.id}>{sub.code} - {sub.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(entry.subClassificationId || entry.mainClassificationGroupId) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={locked}
                          onClick={() => clearClassification(entryIndex)}
                          className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600 disabled:opacity-40"
                          title="Clear classification (reset both dropdowns)"
                          aria-label={`Clear sub classification for entry ${entryIndex + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {!currentSub && entry.subClassificationId && (
                      // Diagnostic: the stored reference doesn't match any loaded
                      // classification. Surface exactly what is broken instead of a
                      // silent blank, so the user (and support) can see and fix it.
                      <p className="text-[11px] leading-snug text-red-600">
                        Saved classification {entry.subClassification?.code ? `"${entry.subClassification.code}"` : ''} (ref {String(entry.subClassificationId).slice(0, 8)}…) was not found in the current list — please pick a classification.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-xs font-medium text-slate-600">Schedule</label>
                    {contractSchedules.length ? (
                      <Select
                        disabled={locked}
                        value={entry.scheduleItem || '_none_'}
                        onValueChange={scheduleItem => updateEntry(entryIndex, {
                          scheduleItem: scheduleItem === '_none_' ? '' : scheduleItem,
                        })}
                      >
                        <SelectTrigger className="h-9 bg-white text-sm">
                          <SelectValue placeholder="Select schedule" />
                        </SelectTrigger>
                        <SelectContent className="w-[220px] max-w-[92vw]">
                          <SelectItem value="_none_" className="whitespace-normal break-words leading-snug">No schedule</SelectItem>
                          {!scheduleInList && entry.scheduleItem && (
                            <SelectItem value={entry.scheduleItem} className="whitespace-normal break-words leading-snug">{entry.scheduleItem}</SelectItem>
                          )}
                          {contractSchedules.map((schedule, index) => (
                            <SelectItem key={`${schedule}-${index}`} value={schedule} className="whitespace-normal break-words leading-snug">{schedule}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        disabled={locked}
                        value={entry.scheduleItem || ''}
                        onChange={event => updateEntry(entryIndex, { scheduleItem: event.target.value })}
                        placeholder="e.g. Schedule A2"
                        className="h-9 bg-white text-sm"
                      />
                    )}
                    {(() => {
                      // Derived-cement rows already bake escalation/bid into the DSR rate, so no factor note.
                      if (entry.isDerivedCement) return null;
                      const rates = findSubWorkRates(scheduleRates, entry.scheduleItem || '', entry.description);
                      if (!rates || (!rates.bidRate && !rates.escalation)) return null;
                      const pct = factorPct(entry.scheduleItem, entry.description);
                      return (
                        <p className="text-[11px] text-emerald-700">
                          Bid {rates.bidRate ? `${rates.bidRate}%` : '—'} · Escalation {rates.escalation ? `${rates.escalation}%` : '—'}
                          {' '}applied ({pct >= 0 ? '+' : ''}{pct}% to amount)
                        </p>
                      );
                    })()}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-xs font-medium text-slate-600">Payable amount (Rs)</label>
                    <Input
                      disabled={locked}
                      type="number"
                      step="0.01"
                      value={displayedAmount === 0 ? '0' : (displayedAmount || '')}
                      onChange={event => updateEntry(entryIndex, {
                        amount: event.target.value === '' ? '' : Number(event.target.value),
                      })}
                      placeholder="0.00"
                      className="h-9 bg-white text-sm font-semibold"
                    />
                  </div>
                </div>

                <details className="rounded-md border border-slate-150 bg-slate-50/40 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600 select-none">Work description and justification</summary>
                  <div className="mt-3 space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Work description</label>
                  <textarea
                    disabled={locked}
                    value={entry.description || ''}
                    onChange={event => updateEntry(entryIndex, { description: event.target.value })}
                    rows={2}
                    placeholder="Item description or reference notes"
                    className="min-h-[58px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5 mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-600">Justification for classification</label>
                    {selectedSub && !locked && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generateJustification(entryIndex)}
                        disabled={justifyingIndex === entryIndex}
                        className="h-7 px-2 text-xs"
                        title={aiJustificationFee > 0
                          ? `Write this justification using AI. Charges ₹${aiJustificationFee} each time.`
                          : 'Write this justification using AI.'}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        {justifyingIndex === entryIndex ? 'Generating…' : 'Generate with AI'}
                      </Button>
                    )}
                  </div>
                  {selectedSub && !locked && aiJustificationFee > 0 && (
                    <p className="text-[11px] text-slate-500">
                      Generate with AI charges ₹{aiJustificationFee} each time, deducted from your credit wallet (free accounts excluded).
                    </p>
                  )}
                  <textarea
                    disabled={locked}
                    value={entry.classificationJustification || ''}
                    onChange={event => updateEntry(entryIndex, { classificationJustification: event.target.value })}
                    rows={2}
                    placeholder="Why this classification was chosen for this item"
                    className="min-h-[58px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                </details>

                {selectedSub && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">Components:</span>
                    {selectedSub.fixed > 0 && <span>Fixed {selectedSub.fixed}%</span>}
                    {selectedSub.labour > 0 && <span>Labour {selectedSub.labour}%</span>}
                    {selectedSub.plantMachinery > 0 && <span>P&M {selectedSub.plantMachinery}%</span>}
                    {selectedSub.fuel > 0 && <span>Fuel {selectedSub.fuel}%</span>}
                    {selectedSub.steel > 0 && <span>Steel {selectedSub.steel}%</span>}
                    {selectedSub.cement > 0 && <span>Cement {selectedSub.cement}%</span>}
                  </div>
                )}

                {selectedSub && selectedSub.steel > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-medium text-slate-600">Steel index:</span>
                    {STEEL_TYPES.map(steelType => (
                      <label key={steelType.value} className="flex cursor-pointer items-center gap-1.5">
                        <Checkbox
                          disabled={locked}
                          checked={(entry.steelTypes || []).includes(steelType.value)}
                          onCheckedChange={checked => {
                            const current = entry.steelTypes || [];
                            updateEntry(entryIndex, {
                              steelTypes: checked
                                ? [...current, steelType.value]
                                : current.filter(type => type !== steelType.value),
                            });
                          }}
                        />
                        <span>{steelType.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="hidden grid-cols-[minmax(90px,0.7fr)_minmax(100px,1fr)_24px_minmax(120px,1fr)_minmax(110px,0.8fr)_32px] gap-2 px-1 text-[11px] font-medium text-slate-500 sm:grid">
                    <span>Item / DSR No.</span>
                    <span>Quantity</span>
                    <span />
                    <span>Agreement rate</span>
                    <span className="text-right">Calculated</span>
                    <span />
                  </div>

                  {rows.map((row, rowIndex) => {
                    // Show the same GST basis as the entry amount, so the row maths ties out.
                    const calculated = rowsTotal([row]);
                    return (
                      <div key={rowIndex} className="space-y-1">
                      <div className="grid gap-2 sm:grid-cols-[minmax(90px,0.7fr)_minmax(100px,1fr)_24px_minmax(120px,1fr)_minmax(110px,0.8fr)_32px] sm:items-center">
                        <Input
                          disabled={locked}
                          value={row.itemNumber || ''}
                          onChange={event => updateItemRow(entryIndex, rowIndex, { itemNumber: event.target.value })}
                          placeholder="Item No."
                          className="h-9 bg-white text-sm"
                        />
                        <Input
                          disabled={locked}
                          type="number"
                          step="0.00001"
                          value={row.quantity === 0 ? '0' : (row.quantity || '')}
                          onChange={event => updateItemRow(entryIndex, rowIndex, { quantity: event.target.value })}
                          placeholder="Quantity"
                          className="h-9 bg-white text-sm"
                        />
                        <span className="hidden text-center text-slate-400 sm:block">x</span>
                        <Input
                          disabled={locked}
                          type="number"
                          step="0.00001"
                          value={row.agreementRate === 0 ? '0' : (row.agreementRate || '')}
                          onChange={event => updateItemRow(entryIndex, rowIndex, { agreementRate: event.target.value })}
                          placeholder="Agreement rate"
                          className="h-9 bg-white text-sm"
                        />
                        <div className="flex h-9 items-center justify-end rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-700"
                          title={row.description || undefined}>
                          {calculated > 0 ? `Rs ${formatMoney(calculated)}` : '-'}
                        </div>
                        {rows.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={locked}
                            onClick={() => removeItemRow(entryIndex, rowIndex)}
                            className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                            title="Delete item row"
                            aria-label="Delete item row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : <span />}
                      </div>
                      {/* What this particular item is. The entry above it names the
                          sub-work, which is the same sentence for every row under it. */}
                      {(row.description || row.pageNumber) && (
                        <div className="flex flex-wrap items-baseline gap-x-2 pl-1 text-[11px] leading-snug text-slate-500">
                          {row.pageNumber ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                              bill p.{row.pageNumber}
                            </span>
                          ) : null}
                          {row.rateBookEdition ? (
                            <span className="text-sky-600" title="The bill prints only this sub-item's own line; the rest is the schedule's wording.">
                              {row.rateBookEdition} {row.rateBookCode}
                            </span>
                          ) : null}
                          <span className="flex-1 min-w-[200px]">{row.description}</span>
                        </div>
                      )}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      onClick={() => addItemRow(entryIndex)}
                      className="h-8 px-2 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add another item
                    </Button>
                    <div className="flex items-center gap-2">
                      {selectedSub && (Number(entry.amount) || 0) > 0 && (
                        <ClassificationComparisonDialog
                          currentClassification={selectedSub}
                          entryAmount={Number(entry.amount) || 0}
                          indicesData={indicesData}
                          contractId={contractId}
                          measurementDate={measurementDate}
                        />
                      )}
                      {!locked && (
                        <BillAmountCalculator
                          label=""
                          onInsertTotal={total => updateEntry(entryIndex, { amount: total })}
                        />
                      )}
                    </div>
                  </div>
                </div>
                </div>
                )}
              </section>
            );
          })}
        </div>

        {!entries.length && (
          <div className="p-8 text-center text-sm text-slate-500">No classification entries added.</div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button type="button" variant="outline" onClick={addEntry} className="flex-1">
          <Plus className="mr-2 h-4 w-4" />
          Add classification entry
        </Button>
        <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportItems} />
        <Button type="button" variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()} className="flex-1 sm:flex-none">
          <Upload className="mr-2 h-4 w-4" />
          {importing ? 'Importing…' : 'Import items (Excel)'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={downloadItemsTemplate} className="text-slate-500 hover:text-slate-700">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Template
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">
        Excel/CSV columns: <span className="font-medium">Item No</span>, <span className="font-medium">Quantity</span>, <span className="font-medium">Agreement Rate</span>, and optionally <span className="font-medium">Classification</span> (code, e.g. A1) and <span className="font-medium">Schedule</span>. Items are grouped by classification + schedule; rows without a valid classification use the default one.
      </p>

      {/* Floating summary bar — stays visible while adding items so the total can be matched. */}
      {floatingSummary && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <div>
            <div className="text-[11px] text-slate-500">Classification total</div>
            <div className="font-semibold text-slate-900">Rs {formatMoney(totalAmount)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Gross bill</div>
            <div className="font-semibold text-slate-900">{grossBillAmount ? `Rs ${formatMoney(grossBillAmount)}` : '-'}</div>
          </div>
          <div className="flex items-center gap-2">
            <div>
              <div className="text-[11px] text-slate-500">Difference</div>
              <div className={amountMatches ? 'font-semibold text-green-700' : 'font-semibold text-orange-700'}>Rs {formatMoney(Math.abs(amountDifference))}</div>
            </div>
            {amountMatches
              ? <CheckCircle2 className="h-5 w-5 text-green-600" />
              : <AlertCircle className="h-5 w-5 text-orange-600" />}
          </div>
        </div>
      )}
    </div>
  );
}
