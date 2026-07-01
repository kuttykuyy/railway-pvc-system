'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Trash2 } from 'lucide-react';

import { BillAmountCalculator } from './bill-amount-calculator';
import { ClassificationComparisonDialog } from './classification-comparison-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inferMainClassification } from '@/lib/work-classification';

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
}

interface ClassificationEntry {
  id?: string;
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
}

interface BillClassificationEntriesProps {
  value: ClassificationEntry[];
  onChange: (entries: ClassificationEntry[]) => void;
  classificationGroups: ClassificationGroup[];
  workDescription?: string;
  grossBillAmount?: number;
  contractSchedules?: string[];
  indicesData?: { base: { [key: string]: number }; current: { [key: string]: number } } | null;
  contractId?: string;
  measurementDate?: string;
}

const STEEL_TYPES = [
  { value: 'TMT', label: 'TMT' },
  { value: 'ANGLE_CHANNEL', label: 'Structural' },
  { value: 'PLATES', label: 'Plates' },
  { value: 'OTHER_SECTIONS', label: 'Other' },
];

function formatMoney(value: number) {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BillClassificationEntries({
  value = [],
  onChange,
  classificationGroups = [],
  workDescription,
  grossBillAmount,
  contractSchedules = [],
  indicesData = null,
  contractId,
  measurementDate,
}: BillClassificationEntriesProps) {
  const [entries, setEntries] = useState<ClassificationEntry[]>(value);
  const requiredMainCode = useMemo(
    () => workDescription ? inferMainClassification(workDescription).code : '',
    [workDescription],
  );
  const requiredGroup = useMemo(
    () => classificationGroups.find(group => group.code.toUpperCase() === requiredMainCode.toUpperCase()),
    [classificationGroups, requiredMainCode],
  );

  useEffect(() => setEntries(value), [value]);

  const commit = (nextEntries: ClassificationEntry[]) => {
    setEntries(nextEntries);
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

  const rowsTotal = (rows: ItemRow[]) => Math.round(rows.reduce((sum, row) => (
    sum + (Number(row.quantity) || 0) * (Number(row.agreementRate) || 0)
  ), 0) * 100) / 100;

  const updateEntry = (entryIndex: number, patch: Partial<ClassificationEntry>) => {
    const nextEntries = [...entries];
    const nextEntry = { ...nextEntries[entryIndex], ...patch };
    if (patch.subClassificationId) {
      nextEntry.subClassification = classificationGroups
        .flatMap(group => group.subClassifications)
        .find(sub => sub.id === patch.subClassificationId);
    }
    nextEntries[entryIndex] = nextEntry;
    commit(nextEntries);
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
      amount: rowsTotal(rows),
    };
    commit(nextEntries);
  };

  const addEntry = () => {
    const group = requiredGroup || classificationGroups[0];
    const sub = group?.subClassifications.find(item => item.isDefault) || group?.subClassifications[0];
    commit([...entries, {
      subClassificationId: sub?.id || '',
      subClassification: sub,
      amount: 0,
      description: '',
      itemRows: [{ itemNumber: '', quantity: '', agreementRate: '' }],
    }]);
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
      amount: rowsTotal(rows),
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

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-sm md:grid-cols-3">
        <div className="bg-white px-3 py-2">
          <div className="text-xs text-slate-500">Classification total</div>
          <div className="font-semibold">Rs {formatMoney(totalAmount)}</div>
        </div>
        <div className="bg-white px-3 py-2">
          <div className="text-xs text-slate-500">Gross bill</div>
          <div className="font-semibold">{grossBillAmount ? `Rs ${formatMoney(grossBillAmount)}` : '-'}</div>
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
            const currentSub = classificationGroups
              .flatMap(group => group.subClassifications)
              .find(sub => sub.id === entry.subClassificationId);
            const selectedGroup = requiredGroup || (currentSub
              ? classificationGroups.find(group => group.id === currentSub.groupId)
              : classificationGroups[0]);
            const selectedSub = currentSub?.groupId === selectedGroup?.id ? currentSub : undefined;
            const rows = getRows(entry);
            const displayedAmount = typeof entry.amount === 'number'
              ? Number(entry.amount.toFixed(2))
              : entry.amount;

            return (
              <section key={entry.id || entryIndex} className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Entry {entryIndex + 1}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => commit(entries.filter((_, index) => index !== entryIndex))}
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    title="Delete entry"
                    aria-label={`Delete entry ${entryIndex + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_minmax(160px,0.7fr)]">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Classification</label>
                    <Select
                      value={selectedGroup?.subClassifications.some(sub => sub.id === entry.subClassificationId)
                        ? entry.subClassificationId
                        : ''}
                      onValueChange={subClassificationId => updateEntry(entryIndex, { subClassificationId })}
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
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Schedule</label>
                    {contractSchedules.length ? (
                      <Select
                        value={entry.scheduleItem || '_none_'}
                        onValueChange={scheduleItem => updateEntry(entryIndex, {
                          scheduleItem: scheduleItem === '_none_' ? '' : scheduleItem,
                        })}
                      >
                        <SelectTrigger className="h-9 bg-white text-sm">
                          <SelectValue placeholder="Select schedule" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none_">No schedule</SelectItem>
                          {contractSchedules.map((schedule, index) => (
                            <SelectItem key={`${schedule}-${index}`} value={schedule}>{schedule}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={entry.scheduleItem || ''}
                        onChange={event => updateEntry(entryIndex, { scheduleItem: event.target.value })}
                        placeholder="e.g. Schedule A2"
                        className="h-9 bg-white text-sm"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Payable amount (Rs)</label>
                    <Input
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

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Work description</label>
                  <textarea
                    value={entry.description || ''}
                    onChange={event => updateEntry(entryIndex, { description: event.target.value })}
                    rows={2}
                    placeholder="Item description or reference notes"
                    className="min-h-[58px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Justification for classification</label>
                  <textarea
                    value={entry.classificationJustification || ''}
                    onChange={event => updateEntry(entryIndex, { classificationJustification: event.target.value })}
                    rows={2}
                    placeholder="Why this classification was chosen for this item"
                    className="min-h-[58px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

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
                    const calculated = Math.round((Number(row.quantity) || 0) * (Number(row.agreementRate) || 0) * 100) / 100;
                    return (
                      <div key={rowIndex} className="grid gap-2 sm:grid-cols-[minmax(90px,0.7fr)_minmax(100px,1fr)_24px_minmax(120px,1fr)_minmax(110px,0.8fr)_32px] sm:items-center">
                        <Input
                          value={row.itemNumber || ''}
                          onChange={event => updateItemRow(entryIndex, rowIndex, { itemNumber: event.target.value })}
                          placeholder="Item No."
                          className="h-9 bg-white text-sm"
                        />
                        <Input
                          type="number"
                          step="0.00001"
                          value={row.quantity === 0 ? '0' : (row.quantity || '')}
                          onChange={event => updateItemRow(entryIndex, rowIndex, { quantity: event.target.value })}
                          placeholder="Quantity"
                          className="h-9 bg-white text-sm"
                        />
                        <span className="hidden text-center text-slate-400 sm:block">x</span>
                        <Input
                          type="number"
                          step="0.00001"
                          value={row.agreementRate === 0 ? '0' : (row.agreementRate || '')}
                          onChange={event => updateItemRow(entryIndex, rowIndex, { agreementRate: event.target.value })}
                          placeholder="Agreement rate"
                          className="h-9 bg-white text-sm"
                        />
                        <div className="flex h-9 items-center justify-end rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-700">
                          {calculated > 0 ? `Rs ${formatMoney(calculated)}` : '-'}
                        </div>
                        {rows.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItemRow(entryIndex, rowIndex)}
                            className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                            title="Delete item row"
                            aria-label="Delete item row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : <span />}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addItemRow(entryIndex)}
                      className="h-8 px-2 text-xs text-blue-700 hover:bg-blue-50"
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
                      <BillAmountCalculator
                        label=""
                        onInsertTotal={total => updateEntry(entryIndex, { amount: total })}
                      />
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {!entries.length && (
          <div className="p-8 text-center text-sm text-slate-500">No classification entries added.</div>
        )}
      </div>

      <Button type="button" variant="outline" onClick={addEntry} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Add classification entry
      </Button>
    </div>
  );
}
