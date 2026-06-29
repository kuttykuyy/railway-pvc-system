
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BillAmountCalculator } from './bill-amount-calculator';
import { ClassificationComparisonDialog } from './classification-comparison-dialog';
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
  amount: number | string | '';  // Allow blank values
  description?: string;
  steelTypes?: string[];  // Array of selected steel types
  scheduleItem?: string;
  itemNumber?: string;     // Legacy single item (backward compat)
  quantity?: number | string | '';   // Legacy single qty
  agreementRate?: number | string | ''; // Legacy single rate
  itemRows?: ItemRow[];    // Multiple item rows
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

export function BillClassificationEntries({
  value = [],
  onChange,
  classificationGroups = [],
  workDescription,
  grossBillAmount,
  contractSchedules = [],
  indicesData = null,
  contractId,
  measurementDate
}: BillClassificationEntriesProps) {
  const [entries, setEntries] = useState<ClassificationEntry[]>(value);
  const requiredMainCode = useMemo(
    () => workDescription ? inferMainClassification(workDescription).code : '',
    [workDescription],
  );
  const allowedClassificationGroups = classificationGroups;

  useEffect(() => {
    setEntries(value);
  }, [value]);

  // Helper: ensure entry has itemRows (migrate from legacy single fields)
  const ensureItemRows = (entry: ClassificationEntry): ItemRow[] => {
    if (entry.itemRows && entry.itemRows.length > 0) return entry.itemRows;
    // Migrate legacy single item to itemRows
    if (entry.itemNumber || entry.quantity || entry.agreementRate) {
      return [{ itemNumber: entry.itemNumber || '', quantity: entry.quantity ?? '', agreementRate: entry.agreementRate ?? '' }];
    }
    return [{ itemNumber: '', quantity: '', agreementRate: '' }];
  };

  // Helper: compute total amount from itemRows
  const computeItemRowsTotal = (rows: ItemRow[]): number => {
    let total = 0;
    for (const row of rows) {
      const qty = parseFloat(String(row.quantity)) || 0;
      const rate = parseFloat(String(row.agreementRate)) || 0;
      total += qty * rate;
    }
    return Math.round(total * 100) / 100;
  };

  const addEntry = () => {
    const recommendedGroup = requiredMainCode
      ? allowedClassificationGroups.find(g => g.code.toUpperCase() === requiredMainCode.toUpperCase())
      : null;
    const requiredGroup = recommendedGroup || allowedClassificationGroups[0];
    const firstSub = requiredGroup?.subClassifications.find(sub => sub.isDefault)
      || requiredGroup?.subClassifications[0];
    const newEntry: ClassificationEntry = {
      subClassificationId: firstSub?.id || '',
      subClassification: firstSub,
      amount: 0,
      description: '',
      itemRows: [{ itemNumber: '', quantity: '', agreementRate: '' }],
    };
    const newEntries = [...entries, newEntry];
    setEntries(newEntries);
    onChange(newEntries);
  };

  const removeEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
    onChange(newEntries);
  };

  const addItemRow = (entryIndex: number) => {
    const newEntries = [...entries];
    const rows = ensureItemRows(newEntries[entryIndex]);
    rows.push({ itemNumber: '', quantity: '', agreementRate: '' });
    newEntries[entryIndex] = { ...newEntries[entryIndex], itemRows: rows };
    setEntries(newEntries);
    onChange(newEntries);
  };

  const removeItemRow = (entryIndex: number, rowIndex: number) => {
    const newEntries = [...entries];
    const rows = ensureItemRows(newEntries[entryIndex]).filter((_, i) => i !== rowIndex);
    if (rows.length === 0) rows.push({ itemNumber: '', quantity: '', agreementRate: '' });
    newEntries[entryIndex] = { ...newEntries[entryIndex], itemRows: rows };
    // Recalculate amount
    const total = computeItemRowsTotal(rows);
    if (total > 0) newEntries[entryIndex].amount = total;
    // Sync legacy fields from first row
    newEntries[entryIndex].itemNumber = rows[0]?.itemNumber || '';
    newEntries[entryIndex].quantity = rows[0]?.quantity ?? '';
    newEntries[entryIndex].agreementRate = rows[0]?.agreementRate ?? '';
    setEntries(newEntries);
    onChange(newEntries);
  };

  const updateItemRow = (entryIndex: number, rowIndex: number, field: keyof ItemRow, value: any) => {
    const newEntries = [...entries];
    const rows = [...ensureItemRows(newEntries[entryIndex])];
    rows[rowIndex] = { ...rows[rowIndex], [field]: value };
    newEntries[entryIndex] = { ...newEntries[entryIndex], itemRows: rows };
    // Auto-calculate total amount from all rows
    const total = computeItemRowsTotal(rows);
    if (total > 0) {
      newEntries[entryIndex].amount = total;
    }
    // Keep legacy fields in sync with first row for backward compatibility
    newEntries[entryIndex].itemNumber = rows[0]?.itemNumber || '';
    newEntries[entryIndex].quantity = rows[0]?.quantity ?? '';
    newEntries[entryIndex].agreementRate = rows[0]?.agreementRate ?? '';
    setEntries(newEntries);
    onChange(newEntries);
  };

  const updateEntry = (index: number, field: keyof ClassificationEntry, value: any) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    
    // If sub-classification changed, update reference
    if (field === 'subClassificationId') {
      const subClass = classificationGroups
        .flatMap(g => g.subClassifications)
        .find(s => s.id === value);
      newEntries[index].subClassification = subClass;
    }
    
    setEntries(newEntries);
    onChange(newEntries);
  };

  // Calculate total amount, treating blank/undefined/null as 0
  const totalAmount = entries.reduce((sum, entry) => {
    const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
      ? 0 
      : parseFloat(entry.amount?.toString() || '0') || 0;
    return sum + amount;
  }, 0);
  const amountDifference = grossBillAmount ? totalAmount - grossBillAmount : 0;
  const isAmountValid = grossBillAmount ? Math.abs(amountDifference) < 0.01 : true;

  return (
    <div className="space-y-6">
      {/* Header with AI Suggestion Button */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Work Classifications
                <Badge variant="outline" className="ml-2">
                  {entries.length} {entries.length === 1 ? 'Entry' : 'Entries'}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2">
                Add work classifications with their amounts (optional). If provided, the sum should match the gross bill amount.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {/* Amount Summary */}
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Classification Amount:</span>
              <span className="font-semibold">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {grossBillAmount && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Gross Bill Amount:</span>
                  <span className="font-semibold">₹{grossBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Difference:</span>
                  <div className="flex items-center gap-2">
                    {isAmountValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                    )}
                    <span className={`font-semibold ${isAmountValid ? 'text-green-600' : 'text-orange-600'}`}>
                      ₹{Math.abs(amountDifference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                {!isAmountValid && (
                  <div className="flex items-start gap-2 text-xs text-orange-600 mt-2">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      {amountDifference > 0 
                        ? 'Total classification amount exceeds gross bill amount' 
                        : 'Total classification amount is less than gross bill amount'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Classification Entries */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[950px] w-full text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left font-semibold text-slate-700 px-4 py-3 w-[20%]">Classification</th>
                <th className="text-left font-semibold text-slate-700 px-4 py-3 w-[32%]">Schedule & Ref</th>
                <th className="text-left font-semibold text-slate-700 px-4 py-3 w-[32%]">Items (Qty × Rate)</th>
                <th className="text-left font-semibold text-slate-700 px-4 py-3 w-[16%]">Amount (₹)</th>
                <th className="text-center font-semibold text-slate-700 px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry, index) => {
                const selectedSubClass = classificationGroups
                  .flatMap(g => g.subClassifications)
                  .find(s => s.id === entry.subClassificationId);
                
                const selectedGroup = selectedSubClass 
                  ? classificationGroups.find(g => g.id === selectedSubClass.groupId)
                  : null;

                const rows = ensureItemRows(entry);

                return (
                  <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                    {/* Col 1: Classification */}
                    <td className="px-4 py-3 space-y-2 align-top">
                      <div className="space-y-1">
                        <Select
                          value={selectedGroup?.id || ''}
                          onValueChange={(groupId) => {
                            if (!groupId) return;
                            const group = classificationGroups.find(g => g.id === groupId);
                            if (!group) return;
                            const newEntries = [...entries];
                            const firstSub = group.subClassifications.find(s => s.isDefault) || group.subClassifications[0];
                            newEntries[index] = {
                              ...newEntries[index],
                              subClassificationId: firstSub?.id || '',
                              subClassification: firstSub,
                            };
                            setEntries(newEntries);
                            onChange(newEntries);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white">
                            <SelectValue placeholder="Main classification" />
                          </SelectTrigger>
                          <SelectContent>
                            {classificationGroups.map((group) => (
                              <SelectItem key={group.id} value={group.id} className="text-xs">
                                {group.code} - {group.name} {group.code === requiredMainCode ? '★ Recommended' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedGroup && (
                        <div className="space-y-1">
                          <Select
                            value={entry.subClassificationId || ''}
                            onValueChange={(value) => { if (value) updateEntry(index, 'subClassificationId', value); }}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white">
                              <SelectValue placeholder="Sub-classification" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedGroup.subClassifications.map((sub) => (
                                <SelectItem key={sub.id} value={sub.id} className="text-xs">
                                  {sub.code} - {sub.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Component Breakdown Badge */}
                      {selectedSubClass && (
                        <div className="text-[10px] text-slate-500 bg-slate-100/80 px-2 py-1 rounded flex flex-wrap gap-x-2 gap-y-0.5">
                          {selectedSubClass.fixed > 0 && <span>F: {selectedSubClass.fixed}%</span>}
                          {selectedSubClass.labour > 0 && <span>L: {selectedSubClass.labour}%</span>}
                          {selectedSubClass.plantMachinery > 0 && <span>P&M: {selectedSubClass.plantMachinery}%</span>}
                          {selectedSubClass.fuel > 0 && <span>Fuel: {selectedSubClass.fuel}%</span>}
                          {selectedSubClass.steel > 0 && <span className="font-semibold text-blue-750">Steel: {selectedSubClass.steel}%</span>}
                          {selectedSubClass.cement > 0 && <span className="font-semibold text-violet-750">Cement: {selectedSubClass.cement}%</span>}
                        </div>
                      )}

                      {/* Steel Types Checklist inline (if steel component > 0) */}
                      {selectedSubClass && selectedSubClass.steel > 0 && (
                        <div className="p-2 border border-blue-100 rounded-md bg-blue-50/30 space-y-1">
                          <span className="text-[9px] font-bold uppercase text-blue-700 block">Select Steel Types</span>
                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            {[
                              { value: 'TMT', label: 'TMT' },
                              { value: 'ANGLE_CHANNEL', label: 'Struct' },
                              { value: 'PLATES', label: 'Plates' },
                              { value: 'OTHER_SECTIONS', label: 'Other' }
                            ].map((steelType) => (
                              <label key={steelType.value} className="flex items-center gap-1 cursor-pointer">
                                <Checkbox
                                  checked={(entry.steelTypes || []).includes(steelType.value)}
                                  onCheckedChange={(checked) => {
                                    const currentSteelTypes = entry.steelTypes || [];
                                    const newSteelTypes = checked
                                      ? [...currentSteelTypes, steelType.value]
                                      : currentSteelTypes.filter(t => t !== steelType.value);
                                    updateEntry(index, 'steelTypes', newSteelTypes);
                                  }}
                                  className="h-3 w-3"
                                />
                                <span className="truncate">{steelType.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Col 2: Schedule & Ref */}
                    <td className="px-4 py-3 space-y-2 align-top">
                      {contractSchedules.length > 0 ? (
                        <div className="space-y-1">
                          <Select
                            value={entry.scheduleItem || '_none_'}
                            onValueChange={(val) => updateEntry(index, 'scheduleItem', val === '_none_' ? '' : val)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white">
                              <SelectValue placeholder="Schedule" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">— None —</SelectItem>
                              {contractSchedules.map((s, i) => (
                                <SelectItem key={i} value={s} className="text-xs">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <textarea
                            placeholder="Schedule (e.g. Sch A)..."
                            value={entry.scheduleItem || ''}
                            onChange={(e) => updateEntry(index, 'scheduleItem', e.target.value)}
                            rows={2}
                            className="w-full text-xs p-1.5 border border-slate-200 rounded-md bg-white resize-y focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[40px]"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <textarea
                          placeholder="Description / notes..."
                          value={entry.description || ''}
                          onChange={(e) => updateEntry(index, 'description', e.target.value)}
                          rows={2}
                          className="w-full text-xs p-1.5 border border-slate-200 rounded-md bg-white resize-y focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[50px]"
                        />
                      </div>
                    </td>

                    {/* Col 3: Items (Qty * Rate) */}
                    <td className="px-4 py-3 space-y-2 align-top">
                      <div className="space-y-2">
                        {rows.map((row, ri) => {
                          const rowQty = parseFloat(String(row.quantity)) || 0;
                          const rowRate = parseFloat(String(row.agreementRate)) || 0;
                          const rowAmt = rowQty > 0 && rowRate > 0 ? Math.round(rowQty * rowRate * 105) / 105 : 0;
                          
                          return (
                            <div key={ri} className="flex items-center gap-1.5">
                              <Input
                                type="text"
                                placeholder="Item No"
                                value={row.itemNumber || ''}
                                onChange={(e) => updateItemRow(index, ri, 'itemNumber', e.target.value)}
                                className="h-8 text-xs bg-white w-20 flex-shrink-0"
                              />
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Qty"
                                value={row.quantity === 0 ? '0' : (row.quantity || '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateItemRow(index, ri, 'quantity', val === '' ? '' : (isNaN(parseFloat(val)) ? '' : parseFloat(val)));
                                }}
                                className="h-8 text-xs bg-white w-24 flex-grow flex-shrink"
                              />
                              <span className="text-[10px] text-slate-400">×</span>
                              <Input
                                type="number"
                                step="0.00001"
                                placeholder="Rate"
                                value={row.agreementRate === 0 ? '0' : (row.agreementRate || '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateItemRow(index, ri, 'agreementRate', val === '' ? '' : (isNaN(parseFloat(val)) ? '' : parseFloat(val)));
                                }}
                                className="h-8 text-xs bg-white w-28 flex-grow flex-shrink"
                              />
                              
                              {rowAmt > 0 && (
                                <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded">
                                  ₹{rowAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              )}

                              {rows.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                  onClick={() => removeItemRow(index, ri)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-6 px-1.5"
                        onClick={() => addItemRow(index)}
                      >
                        <Plus className="h-3 w-3 mr-0.5" />
                        Add item row
                      </Button>
                    </td>

                    {/* Col 4: Amount */}
                    <td className="px-4 py-3 space-y-2 align-top">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={entry.amount === 0 ? '0' : (entry.amount || '')}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || value === null || value === undefined) {
                              updateEntry(index, 'amount', '');
                            } else {
                              const numValue = parseFloat(value);
                              updateEntry(index, 'amount', isNaN(numValue) ? '' : numValue);
                            }
                          }}
                          className="h-8 text-xs bg-white font-semibold text-slate-800"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-1">
                        {(() => {
                          const amt = parseFloat(String(entry.amount));
                          if (!isNaN(amt) && amt > 0 && amt !== Math.round(amt)) {
                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-1.5 text-orange-600 border-orange-300 hover:bg-orange-50"
                                onClick={() => updateEntry(index, 'amount', Math.round(amt))}
                              >
                                Round
                              </Button>
                            );
                          }
                          return null;
                        })()}
                        {selectedSubClass && (parseFloat(String(entry.amount)) || 0) > 0 && (
                          <ClassificationComparisonDialog
                            currentClassification={selectedSubClass}
                            entryAmount={parseFloat(String(entry.amount)) || 0}
                            indicesData={indicesData}
                            contractId={contractId}
                            measurementDate={measurementDate}
                          />
                        )}
                        <BillAmountCalculator
                          label=""
                          onInsertTotal={(total) => updateEntry(index, 'amount', total)}
                        />
                      </div>
                    </td>

                    {/* Col 5: Delete */}
                    <td className="px-4 py-3 align-top text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {entries.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-xs bg-slate-50/50">
            No classification entries added yet. Click "Add Classification Entry" below to start.
          </div>
        )}
      </div>

      {/* Add Entry Button */}
      <Button
        type="button"
        variant="outline"
        onClick={addEntry}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Classification Entry
      </Button>
    </div>
  );
}
