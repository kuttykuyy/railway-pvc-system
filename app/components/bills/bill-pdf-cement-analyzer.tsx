'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface CementAnalysisSummary {
  matchedItemCount: number;
  unmatchedItemCount: number;
  cementQuantity: number;
  cementAmount?: number | null;
  hasCementAmount?: boolean;
}

interface CementAnalysisResultItem {
  dsrCode: string;
  description: string;
  unit: string;
  quantity: number;
  cementQuantity: number;
  cementAmount?: number | null;
  coefficient?: number | null;
  matched?: boolean;
}

export interface ExtractedBillItem {
  dsrCode: string;
  itemNo?: string;
  description: string;
  unit: string;
  quantitySinceLastBill: number;
  quantitySinceLastBillRaw?: string;
  amountAtAgreementRateSinceLastBill?: number;
  amountIncludingSpecialConditionSinceLastBill?: number;
  agreementRate?: number;
  agreementRateRaw?: string;
  amountSinceLastBill?: number;
  schedule?: string;
  scheduleGroup?: string;
  chapter?: string;
  sourceBook?: 'USSR_2021' | 'DSR_2021' | 'NON_SCHEDULE' | 'UNKNOWN';
  requiresDsrCementCoefficient?: boolean;
  isCementAffected?: boolean;
  isSteelItem?: boolean;
  steelType?: 'TMT' | 'ANGLE_CHANNEL' | 'PLATES' | 'OTHER_SECTIONS' | '';
  suggestedClassificationCode?: string;
  suggestedClassificationReason?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ExtractedBillDetails {
  billNo?: string;
  agreementNo?: string;
  contractorName?: string;
  workDescription?: string;
  measurementDate?: string;
  grossBillAmount?: number;
  netBillAmount?: number;
  classificationGroupCode?: string;
  scheduleSummary?: Array<{
    schedule: string;
    amountIncludingSpecialCondition: number;
  }>;
  scheduleSummaryTotal?: number;
  itemAmountTotal?: number;
  amountDifference?: number;
  amountsReconciled?: boolean;
  items: ExtractedBillItem[];
}

export interface CementAnalysisData {
  billDetails?: ExtractedBillDetails;
  extractedItems?: ExtractedBillItem[];
  cementItems?: ExtractedBillItem[];
  coefficientItems?: ExtractedBillItem[];
  steelItems?: ExtractedBillItem[];
  cementRatePerUnit?: number | null;
  cementAmountSource?: 'USSR_SEPARATE_SUPPLY' | 'DSR_COEFFICIENT' | null;
  results: CementAnalysisResultItem[];
  summary: CementAnalysisSummary;
  warnings?: string[];
}

interface BillPdfCementAnalyzerProps {
  title?: string;
  compact?: boolean;
  disabled?: boolean;
  onApplyCementAmount?: (amount: number, data: CementAnalysisData) => void;
  onApplyBillDetails?: (data: CementAnalysisData) => void;
}

function formatNumber(value: number | null | undefined, fractionDigits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: fractionDigits,
  });
}

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `Rs ${value.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function BillPdfCementAnalyzer({
  title = 'AI Bill PDF Cement Analysis',
  compact = false,
  disabled = false,
  onApplyCementAmount,
  onApplyBillDetails,
}: BillPdfCementAnalyzerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<CementAnalysisData | null>(null);
  const [fileName, setFileName] = useState('');

  const [dsrBaseRate, setDsrBaseRate] = useState<number>(688.45);
  const [escalation, setEscalation] = useState<string>('');
  const [bidRate, setBidRate] = useState<string>('');
  const [rebate, setRebate] = useState<string>('');

  const escVal = parseFloat(escalation) || 0;
  const bidVal = parseFloat(bidRate) || 0;
  const rebVal = parseFloat(rebate) || 0;

  const afterEsc = dsrBaseRate * (1 + escVal / 100);
  const afterBid = afterEsc * (1 + bidVal / 100);
  const afterRebate = afterBid * (1 - rebVal / 100);

  const derivedRatePerQuintal = afterRebate;
  const derivedRatePerMt = derivedRatePerQuintal * 10;
  const derivedCementAmount = result ? result.summary.cementQuantity * derivedRatePerMt : 0;

  const applyCalculatedAmount = (amount: number) => {
    if (!result) return;
    const updated = {
      ...result,
      summary: {
        ...result.summary,
        cementAmount: amount,
      },
      cementRatePerUnit: amount / result.summary.cementQuantity,
      cementAmountSource: 'DSR_COEFFICIENT' as const,
    };
    setResult(updated);
    if (onApplyCementAmount) {
      onApplyCementAmount(amount, updated);
    }
    toast.success(`Applied derived cement cost: ${formatAmount(amount)}`);
  };

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF bill file.');
      return;
    }

    try {
      setIsAnalyzing(true);
      setFileName(file.name);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/bills/cement-analysis', {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to analyze bill PDF');
      }

      const data = json.data as CementAnalysisData;
      setResult(data);

      const cementAmount = data.summary?.cementAmount;
      if (typeof cementAmount === 'number' && cementAmount > 0 && onApplyCementAmount) {
        onApplyCementAmount(cementAmount, data);
      }

      if (onApplyBillDetails) {
        onApplyBillDetails(data);
      }

      toast.success(`Extracted ${data.billDetails?.items?.length || data.extractedItems?.length || 0} bill item(s)`);
    } catch (error: any) {
      console.error('Bill PDF cement analysis failed:', error);
      toast.error(error.message || 'Failed to analyze bill PDF');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader className={compact ? 'p-4 pb-2' : 'p-5 pb-3'}>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-blue-700" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'p-4 pt-0 space-y-3' : 'p-5 pt-0 space-y-4'}>
        <div className="flex justify-start">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isAnalyzing}
              className="w-full md:w-auto"
            >
              {isAnalyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isAnalyzing ? 'Analyzing...' : 'Upload Bill PDF'}
            </Button>
          </div>
        </div>

        {fileName && (
          <div className="text-xs text-muted-foreground">Last file: {fileName}</div>
        )}

        {result && (
          <div className="space-y-3 rounded-lg border bg-white p-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div>
                <div className="text-[11px] text-muted-foreground">Bill items</div>
                <Badge variant="secondary">{result.billDetails?.items?.length || result.extractedItems?.length || 0}</Badge>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Cement items</div>
                <Badge variant="secondary">{result.cementItems?.length || result.summary.matchedItemCount}</Badge>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Cement quantity</div>
                <div className="text-sm font-semibold">{formatNumber(result.summary.cementQuantity)} MT</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Cement amount</div>
                <div className="text-sm font-semibold">{formatAmount(result.summary.cementAmount)}</div>
              </div>
            </div>

            {result.billDetails && (
              <div className="grid grid-cols-1 gap-2 rounded-md border bg-slate-50 p-3 text-xs md:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">Bill No</div>
                  <div className="font-semibold">{result.billDetails.billNo || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Measurement Date</div>
                  <div className="font-semibold">{result.billDetails.measurementDate || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Gross Amount</div>
                  <div className="font-semibold">{formatAmount(result.billDetails.grossBillAmount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Steel Items</div>
                  <div className="font-semibold">{result.steelItems?.length || 0}</div>
                </div>
              </div>
            )}

            {result.billDetails?.amountsReconciled && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Item total {formatAmount(result.billDetails.itemAmountTotal)} matches the Schedule Summary amount including special condition.
              </div>
            )}

            {result.billDetails && !result.billDetails.amountsReconciled && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Item total {formatAmount(result.billDetails.itemAmountTotal)} does not match the Schedule Summary amount {formatAmount(result.billDetails.scheduleSummaryTotal)} (difference {formatAmount(result.billDetails.amountDifference)}). Please review the extracted items below.
              </div>
            )}

            {result.summary.cementAmount === null || result.summary.cementAmount === undefined ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    No cement supply rate was found in the bill, so the cement amount could not be calculated automatically.
                  </div>
                </div>

                {result.summary.cementQuantity > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 text-xs space-y-3">
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-violet-600" />
                      DSR 5.35 Cement Rate Calculator (No direct supply rate fallback)
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      If there is no direct cement supply item in this contract, the cement rate is derived from DSR 2021 item 5.35 (base Rs. 688.45/quintal) adjusted for contract escalation, bid rate, and rebate.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500">Base Rate (Rs./Qtl)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={dsrBaseRate}
                          onChange={(e) => setDsrBaseRate(parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500">Escalation %</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. -25.00"
                          value={escalation}
                          onChange={(e) => setEscalation(e.target.value)}
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500">Bid Rate % (+/-)</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 3.80"
                          value={bidRate}
                          onChange={(e) => setBidRate(e.target.value)}
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-slate-500">Rebate % (discount)</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 0.50"
                          value={rebate}
                          onChange={(e) => setRebate(e.target.value)}
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-[10px] text-slate-400">Rate per Quintal</div>
                        <div className="font-semibold text-slate-800">Rs. {derivedRatePerQuintal.toFixed(6)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Rate per MT</div>
                        <div className="font-semibold text-slate-800">Rs. {derivedRatePerMt.toFixed(5)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Calculated Amount</div>
                        <div className="font-bold text-violet-750">{formatAmount(derivedCementAmount)}</div>
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => applyCalculatedAmount(derivedCementAmount)}
                          className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white font-medium"
                        >
                          Apply Derived Cost
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : result.cementAmountSource === 'USSR_SEPARATE_SUPPLY' ? (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Cement amount was taken directly from the separate USSR cement supply item; no DSR coefficient was used.
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Cement amount was calculated from DSR coefficients and applied to the bill form.
              </div>
            )}

            {(result.warnings || []).map((warning) => (
              <div key={warning} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {warning}
              </div>
            ))}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/60">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Item</th>
                    <th className="px-2 py-2 text-left font-medium">Description</th>
                    <th className="px-2 py-2 text-right font-medium">Qty Since Last Bill</th>
                    <th className="px-2 py-2 text-right font-medium">Rate</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                    <th className="px-2 py-2 text-left font-medium">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(result.billDetails?.items || result.extractedItems || []).slice(0, compact ? 5 : 12).map((item, index) => (
                    <tr key={`${item.itemNo || item.dsrCode}-${index}`}>
                      <td className="whitespace-nowrap px-2 py-2 font-medium">{item.itemNo || item.dsrCode || '-'}</td>
                      <td className="max-w-[420px] px-2 py-2">
                        <div className="line-clamp-2">{item.description}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {[item.schedule, item.scheduleGroup, item.chapter, item.sourceBook].filter(Boolean).join(' / ') || 'Schedule not identified'}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.isCementAffected && <Badge variant="outline">Cement</Badge>}
                          {item.isCementAffected && item.sourceBook === 'USSR_2021' && <Badge variant="outline">Separate cement supply</Badge>}
                          {item.isSteelItem && <Badge variant="outline">Steel: {item.steelType || 'Review type'}</Badge>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {item.quantitySinceLastBillRaw || formatNumber(item.quantitySinceLastBill, 2)} {item.unit}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{item.agreementRateRaw || formatAmount(item.agreementRate)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{formatAmount(item.amountSinceLastBill)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{item.suggestedClassificationCode || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(result.billDetails?.items?.length || result.extractedItems?.length || 0) > (compact ? 5 : 12) && (
              <div className="text-xs text-muted-foreground">
                Showing first {compact ? 5 : 12} of {result.billDetails?.items?.length || result.extractedItems?.length || 0} extracted bill items.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/60">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">DSR</th>
                    <th className="px-2 py-2 text-left font-medium">Description</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-2 py-2 text-right font-medium">Coeff.</th>
                    <th className="px-2 py-2 text-right font-medium">Cement</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.results.slice(0, compact ? 5 : 10).map((item, index) => (
                    <tr key={`${item.dsrCode}-${index}`}>
                      <td className="whitespace-nowrap px-2 py-2 font-medium">{item.dsrCode || '-'}</td>
                      <td className="max-w-[360px] px-2 py-2">
                        <div className="line-clamp-2">{item.description}</div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {formatNumber(item.quantity, 2)} {item.unit}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {item.coefficient ? formatNumber(item.coefficient, 5) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        {formatNumber(item.cementQuantity)} MT
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.results.length > (compact ? 5 : 10) && (
              <div className="text-xs text-muted-foreground">
                Showing first {compact ? 5 : 10} of {result.results.length} extracted cement items.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
