'use client';

import { ChangeEvent, DragEvent, useRef, useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Cpu, FileCheck2, FileText, HardDrive, Lightbulb, ListChecks, Loader2, Lock, RotateCcw, Save, ScanText, Unlock, Upload } from 'lucide-react';
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
  cementUnit?: string | null;
  coefficientSource?: string | null;
  reason?: string;
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
  contractId?: string;
  onApplyCementAmount?: (amount: number, data: CementAnalysisData) => void;
  onApplyBillDetails?: (data: CementAnalysisData) => void;
}

interface CementRateSettings {
  escalation: string;
  bidRate: string;
  rebate: string;
}

interface SavedCementRateSettings {
  baseRate: number;
  schedules: Record<string, CementRateSettings>;
  savedAt: string;
}

const DEFAULT_DSR_BASE_RATE = 688.45;

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
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
  title = 'Automatic Bill PDF Extraction',
  compact = false,
  disabled = false,
  contractId,
  onApplyCementAmount,
  onApplyBillDetails,
}: BillPdfCementAnalyzerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const analysisStartedAtRef = useRef<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<CementAnalysisData | null>(null);
  const [coefficientDrafts, setCoefficientDrafts] = useState<Record<string, string>>({});
  const [savingCoefficientCode, setSavingCoefficientCode] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockCost, setUnlockCost] = useState(50);

  const [loadingStep, setLoadingStep] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [extractionPartsCompleted, setExtractionPartsCompleted] = useState(0);
  const [extractionPartCount, setExtractionPartCount] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Milestones list for interactive loading
  const loadingSteps = [
    'Uploading document to secure server...',
    'Converting PDF pages to structured text...',
    'Reading bill metadata and schedule summary...',
    'Mapping IREPS item columns and USSR codes...',
    'Verifying Qty x Agreement Rate values...',
    'Calculating cement consumption coefficients...',
    'Finalizing summary statistics & previews...'
  ];

  // Rotating tips list
  const pvcTips = [
    'Tip: Keep your PDF scans straight and clean for 99% extraction accuracy.',
    'Did you know? USSR 2021 cement coefficients are automatically derived based on mix codes.',
    'Tip: Dedicated supply items (cement/steel) automatically bypass double calculation when active.',
    'Did you know? JPC steel price indices are updated monthly directly in the admin panel.',
    'Tip: You can customize the base cement DSR rate manually if your contract uses a custom base rate.',
    'Did you know? The platform automatically highlights discrepancies between extracted item totals and schedule summaries.'
  ];

  // The upload percentage is measured by XHR. Later stages are time-based indicators
  // because the analysis endpoint returns one response after all server work completes.
  useEffect(() => {
    if (!isAnalyzing) {
      setLoadingStep(0);
      setUploadPercent(0);
      setElapsedSeconds(0);
      setProcessingStartedAt(null);
      setExtractionPartsCompleted(0);
      setExtractionPartCount(0);
      analysisStartedAtRef.current = null;
      return;
    }

    const startedAt = analysisStartedAtRef.current || Date.now();
    const activityInterval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
      if (processingStartedAt && extractionPartCount === 0) {
        const processingSeconds = Math.floor((Date.now() - processingStartedAt) / 1000);
        const estimatedStep = processingSeconds < 4 ? 1
          : processingSeconds < 9 ? 2
            : processingSeconds < 15 ? 3
              : processingSeconds < 22 ? 4
                : processingSeconds < 30 ? 5
                  : 6;
        setLoadingStep(estimatedStep);
      }
    }, 500);

    const tipInterval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % pvcTips.length);
    }, 5000);

    return () => {
      clearInterval(activityInterval);
      clearInterval(tipInterval);
    };
  }, [extractionPartCount, isAnalyzing, processingStartedAt]);

  const handleUnlock = async () => {
    if (!extractionId) return;

    try {
      setUnlocking(true);
      const response = await fetch('/api/bills/unlock-ai-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractionId })
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to unlock extraction details');
      }

      const unlockedData = json.data as CementAnalysisData;
      setResult(unlockedData);
      setIsUnlocked(true);

      const cementAmount = unlockedData.summary?.cementAmount;
      if (typeof cementAmount === 'number' && cementAmount > 0 && onApplyCementAmount) {
        onApplyCementAmount(cementAmount, unlockedData);
      }

      if (onApplyBillDetails) {
        onApplyBillDetails(unlockedData);
      }

      toast.success(json.message || 'Bill details unlocked and applied successfully!');
    } catch (error: any) {
      console.error('Failed to unlock extraction:', error);
      toast.error(error.message || 'Failed to unlock extraction');
    } finally {
      setUnlocking(false);
    }
  };

  const [dsrBaseRate, setDsrBaseRate] = useState<number>(DEFAULT_DSR_BASE_RATE);
  const [scheduleSettings, setScheduleSettings] = useState<Record<string, CementRateSettings>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(null);
  const settingsStorageKey = `irpvc:cement-rate-settings:${contractId || 'default'}`;

  useEffect(() => {
    setSettingsLoaded(false);
    try {
      const savedValue = window.localStorage.getItem(settingsStorageKey);
      if (savedValue) {
        const saved = JSON.parse(savedValue) as SavedCementRateSettings;
        setDsrBaseRate(Number.isFinite(saved.baseRate) ? saved.baseRate : DEFAULT_DSR_BASE_RATE);
        setScheduleSettings(saved.schedules && typeof saved.schedules === 'object' ? saved.schedules : {});
        setSettingsSavedAt(saved.savedAt || null);
      } else {
        setDsrBaseRate(DEFAULT_DSR_BASE_RATE);
        setScheduleSettings({});
        setSettingsSavedAt(null);
      }
    } catch {
      setDsrBaseRate(DEFAULT_DSR_BASE_RATE);
      setScheduleSettings({});
      setSettingsSavedAt(null);
    } finally {
      setSettingsLoaded(true);
    }
  }, [settingsStorageKey]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const timeout = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const value: SavedCementRateSettings = {
        baseRate: dsrBaseRate,
        schedules: scheduleSettings,
        savedAt,
      };
      try {
        window.localStorage.setItem(settingsStorageKey, JSON.stringify(value));
        setSettingsSavedAt(savedAt);
      } catch {
        setSettingsSavedAt(null);
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [dsrBaseRate, scheduleSettings, settingsLoaded, settingsStorageKey]);

  const resetSavedRateSettings = () => {
    window.localStorage.removeItem(settingsStorageKey);
    setDsrBaseRate(DEFAULT_DSR_BASE_RATE);
    setScheduleSettings({});
    setSettingsSavedAt(null);
    toast.success('Saved cement rate settings reset.');
  };

  // Helper to extract unique schedules that are cement affected
  const getUniqueCementSchedules = (res: CementAnalysisData | null) => {
    if (!res) return [];
    const items = res.billDetails?.items || res.extractedItems || [];
    const affected = items.filter(item => item.isCementAffected && item.sourceBook !== 'USSR_2021');
    const schedules = affected.map(item => item.schedule || item.scheduleGroup || 'Default');
    return Array.from(new Set(schedules)).sort();
  };

  // Initialize schedule settings when result changes
  useEffect(() => {
    if (!result) return;
    const schedules = getUniqueCementSchedules(result);
    setScheduleSettings(prev => {
      const updated = { ...prev };
      schedules.forEach(sched => {
        if (!updated[sched]) {
          updated[sched] = { escalation: '', bidRate: '', rebate: '' };
        }
      });
      return updated;
    });
  }, [result]);

  const getDerivedRates = (sched: string) => {
    const settings = scheduleSettings[sched] || { escalation: '', bidRate: '', rebate: '' };
    const escVal = parseFloat(settings.escalation) || 0;
    const bidVal = parseFloat(settings.bidRate) || 0;
    const rebVal = parseFloat(settings.rebate) || 0;

    const afterEsc = dsrBaseRate * (1 + escVal / 100);
    const afterBid = afterEsc * (1 + bidVal / 100);
    const afterRebate = afterBid * (1 - rebVal / 100);

    const derivedRatePerQuintal = afterRebate;
    const derivedRatePerMt = derivedRatePerQuintal * 10;

    return {
      derivedRatePerQuintal,
      derivedRatePerMt
    };
  };

  const getScheduleCementAmount = (sched: string) => {
    if (!result) return 0;
    const { derivedRatePerMt } = getDerivedRates(sched);
    
    // Find all items belonging to this schedule
    const items = result.billDetails?.items || result.extractedItems || [];
    let scheduleCementQtyMT = 0;
    
    items.forEach(item => {
      const itemSched = item.schedule || item.scheduleGroup || 'Default';
      if (itemSched === sched && item.isCementAffected && item.sourceBook !== 'USSR_2021') {
        const coeffIndex = result.coefficientItems?.findIndex(ci => ci.dsrCode === item.dsrCode && ci.description === item.description);
        if (coeffIndex !== undefined && coeffIndex !== -1) {
          scheduleCementQtyMT += result.results[coeffIndex]?.cementQuantity || 0;
        }
      }
    });

    return scheduleCementQtyMT * derivedRatePerMt;
  };

  const getItemCementDeduction = (item: ExtractedBillItem, resData = result) => {
    if (!resData || !item.isCementAffected || item.sourceBook === 'USSR_2021') return 0;
    const sched = item.schedule || item.scheduleGroup || 'Default';
    const { derivedRatePerMt } = getDerivedRates(sched);
    
    const coeffIndex = resData.coefficientItems?.findIndex(ci => ci.dsrCode === item.dsrCode && ci.description === item.description);
    if (coeffIndex === undefined || coeffIndex === -1) return 0;
    const cementQtyMT = resData.results[coeffIndex]?.cementQuantity || 0;
    return cementQtyMT * derivedRatePerMt;
  };

  const saveMissingCoefficient = async (item: CementAnalysisResultItem) => {
    if (!result || !item.dsrCode) return;
    const coefficient = Number(coefficientDrafts[item.dsrCode]);
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      toast.error('Enter a valid coefficient in MT per item unit.');
      return;
    }

    try {
      setSavingCoefficientCode(item.dsrCode);
      const response = await fetch('/api/admin/dsr-cement-coefficients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dsrCode: item.dsrCode,
          description: item.description,
          workUnit: item.unit,
          cementQuantityPerUnit: coefficient,
        }),
      });
      const json = await response.json().catch(() => ({ error: 'Invalid server response.' }));
      if (!response.ok) throw new Error(json.error || 'Failed to save coefficient.');

      const updatedResults = result.results.map(existing => {
        if (existing.dsrCode !== item.dsrCode) return existing;
        const cementQuantity = existing.quantity * coefficient;
        return {
          ...existing,
          matched: true,
          coefficient,
          cementQuantity,
          cementUnit: 'MT',
          cementAmount: result.cementRatePerUnit && result.cementRatePerUnit > 0
            ? cementQuantity * result.cementRatePerUnit
            : null,
          coefficientSource: 'DSR 2021 Analysis of Rates - admin verified',
          reason: `Quantity ${existing.quantity} x coefficient ${coefficient} MT/${existing.unit}`,
        };
      });
      const matchedResults = updatedResults.filter(existing => existing.matched);
      const unmatchedItemCount = updatedResults.length - matchedResults.length;
      const cementQuantity = matchedResults.reduce((sum, existing) => sum + existing.cementQuantity, 0);
      const cementAmount = matchedResults.reduce((sum, existing) => sum + (existing.cementAmount || 0), 0);
      const warnings = (result.warnings || []).filter(warning => !/need DSR cement coefficients/i.test(warning));
      if (unmatchedItemCount > 0) {
        warnings.push(`${unmatchedItemCount} item(s) need DSR cement coefficients before cement amount can be finalized.`);
      }

      const updated: CementAnalysisData = {
        ...result,
        results: updatedResults,
        summary: {
          ...result.summary,
          matchedItemCount: matchedResults.length,
          unmatchedItemCount,
          cementQuantity,
          cementAmount: matchedResults.some(existing => existing.cementAmount !== null) ? cementAmount : null,
          hasCementAmount: matchedResults.some(existing => existing.cementAmount !== null),
        },
        warnings,
      };
      setResult(updated);
      setCoefficientDrafts(current => ({ ...current, [item.dsrCode]: '' }));
      onApplyBillDetails?.(updated);
      toast.success(`${item.dsrCode} coefficient saved for current and future bills.`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save coefficient.');
    } finally {
      setSavingCoefficientCode(null);
    }
  };

  const applyCalculatedAmount = (amount: number) => {
    if (!result) return;
    
    // Update the amountSinceLastBill of each cement-affected item in the result items list
    const updatedItems = (result.billDetails?.items || result.extractedItems || []).map((item) => {
      const deduction = getItemCementDeduction(item);
      if (deduction > 0) {
        // Store the original amount in a new property if not already present
        const originalAmount = (item as any).originalAmount ?? Number(item.amountSinceLastBill || 0);
        
        // Find cement quantity in MT from result
        const coeffIndex = result.coefficientItems?.findIndex(ci => ci.dsrCode === item.dsrCode && ci.description === item.description);
        const cementQtyMT = coeffIndex !== undefined && coeffIndex !== -1 ? result.results[coeffIndex]?.cementQuantity || 0 : 0;
        const cementQuantityQuintals = cementQtyMT * 10;

        const sched = item.schedule || item.scheduleGroup || 'Default';
        const { derivedRatePerQuintal } = getDerivedRates(sched);

        return {
          ...item,
          originalAmount,
          cementDeduction: deduction,
          cementQuantityQuintals,
          cementRatePerQuintal: derivedRatePerQuintal,
          amountSinceLastBill: originalAmount - deduction,
        };
      }
      return item;
    });

    const updated = {
      ...result,
      billDetails: result.billDetails ? {
        ...result.billDetails,
        items: updatedItems,
      } : undefined,
      extractedItems: result.extractedItems ? updatedItems : undefined,
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
    if (onApplyBillDetails) {
      onApplyBillDetails(updated);
    }
    toast.success(`Applied derived cement cost: ${formatAmount(amount)} and deducted from cement-affected DSR items.`);
  };

  const analyzePdfFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF bill file.');
      return;
    }

    try {
      analysisStartedAtRef.current = Date.now();
      setIsAnalyzing(true);
      setFileName(file.name);
      setFileSize(file.size);
      setUploadedBytes(0);
      setUploadPercent(0);
      setLoadingStep(0);
      setProcessingStartedAt(null);
      setExtractionPartsCompleted(0);
      setExtractionPartCount(0);

      const formData = new FormData();
      formData.append('file', file);

      const endpoint = () => {
        const params = new URLSearchParams({ stage: 'deterministic' });
        if (contractId) params.set('contractId', contractId);
        return `/api/bills/cement-analysis?${params.toString()}`;
      };

      const analysis = await new Promise<{ status: number; json: any }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', endpoint());
        request.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) return;
          setUploadedBytes(progressEvent.loaded);
          setUploadPercent(Math.round((progressEvent.loaded / progressEvent.total) * 100));
        };
        request.upload.onload = () => {
          setUploadedBytes(file.size);
          setUploadPercent(100);
          setLoadingStep(1);
          setProcessingStartedAt(Date.now());
        };
        request.onerror = () => reject(new Error('Network error while uploading the bill PDF.'));
        request.onload = () => {
          try {
            resolve({ status: request.status, json: JSON.parse(request.responseText) });
          } catch {
            const isGatewayFailure = [502, 503, 504].includes(request.status);
            resolve({
              status: request.status,
              json: {
                error: isGatewayFailure
                  ? 'PDF extraction timed out while processing this bill. Please retry; no bill data was saved.'
                  : 'The analysis server returned an invalid response.',
              },
            });
          }
        };
        request.send(formData);
      });

      const { status, json } = analysis;
      if (status < 200 || status >= 300) {
        throw new Error(json.error || 'Failed to analyze bill PDF');
      }

      const data = json.data as CementAnalysisData;
      setResult(data);
      setExtractionId(json.extractionId || null);

      const unlocked = !!json.isUnlocked;
      setIsUnlocked(unlocked);
      if (typeof json.cost === 'number') {
        setUnlockCost(json.cost);
      }

      if (unlocked) {
        const cementAmount = data.summary?.cementAmount;
        if (typeof cementAmount === 'number' && cementAmount > 0 && onApplyCementAmount) {
          onApplyCementAmount(cementAmount, data);
        }

        if (onApplyBillDetails) {
          onApplyBillDetails(data);
        }
        toast.success(`Extracted ${data.billDetails?.items?.length || data.extractedItems?.length || 0} bill item(s)`);
      } else {
        toast.success(`PDF extraction completed. Click "Unlock & Import" below to apply the details.`);
      }
    } catch (error: any) {
      console.error('Bill PDF cement analysis failed:', error);
      toast.error(error.message || 'Failed to analyze bill PDF');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePdfUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void analyzePdfFile(file);
  };

  const handlePdfDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    if (disabled || isAnalyzing) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void analyzePdfFile(file);
  };

  const showGrandUploader = !isAnalyzing && !result;

  return (
    <Card className={`overflow-hidden ${showGrandUploader ? 'border-slate-200 bg-white shadow-sm' : 'border-blue-200 bg-blue-50/40'}`}>
      {!showGrandUploader && (
        <CardHeader className={compact ? 'p-4 pb-2' : 'p-5 pb-3'}>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-blue-700" />
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={showGrandUploader ? 'p-0' : compact ? 'p-4 pt-0 space-y-3' : 'p-5 pt-0 space-y-4'}>
        {isAnalyzing ? (
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-5 shadow-sm">
            {/* Top title and scanning bar animation */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-md bg-blue-50 p-2 text-blue-600 animate-pulse">
                  <Cpu className="h-5 w-5 animate-spin" style={{ animationDuration: '4s' }} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Processing Document</h4>
                  <p className="text-[11px] text-slate-500">
                    {uploadPercent < 100
                      ? `Uploading ${formatFileSize(uploadedBytes)} of ${formatFileSize(fileSize)}`
                      : extractionPartCount > 0
                        ? `Extracted ${extractionPartsCompleted} of ${extractionPartCount} bill pages`
                        : 'Converting the uploaded PDF into structured pages'}
                  </p>
                </div>
              </div>
              <Badge className="gap-1 bg-blue-100 text-blue-700 font-bold hover:bg-blue-100 border-none px-2.5 py-1">
                <Clock3 className="h-3 w-3" />
                {formatElapsed(elapsedSeconds)}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-blue-600 transition-all duration-300 ${uploadPercent === 100 ? 'animate-pulse' : ''}`}
                  style={{
                    width: uploadPercent < 100
                      ? `${uploadPercent}%`
                      : extractionPartCount > 0
                        ? `${Math.max(5, (extractionPartsCompleted / extractionPartCount) * 100)}%`
                        : '12%',
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{fileName}</span>
                <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatFileSize(fileSize)}</span>
                <span>
                  {uploadPercent < 100
                    ? `${uploadPercent}% uploaded`
                    : extractionPartCount > 0
                      ? `${Math.round((extractionPartsCompleted / extractionPartCount) * 100)}% of pages extracted`
                      : 'Upload complete; preparing pages'}
                </span>
              </div>
            </div>

            {/* Step Milestones Checklist */}
            <div className="space-y-2.5 pt-1">
              {loadingSteps.map((step, index) => {
                const isCompleted = index < loadingStep;
                const isActive = index === loadingStep;
                return (
                  <div
                    key={step}
                    className={`flex items-start gap-3 text-xs transition-all duration-300 ${
                      isCompleted ? 'text-green-600 font-medium' : isActive ? 'text-slate-800 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                    ) : (
                      <div className="h-4 w-4 shrink-0 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                      </div>
                    )}
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>

            {/* Interactive Rotating Tips Box */}
            <div className="rounded-md border border-amber-100 bg-amber-50/40 p-3.5 flex items-start gap-3 transition-all duration-500">
              <div className="rounded-md bg-amber-100 p-2 text-amber-700 shrink-0">
                <Lightbulb className="h-4 w-4 animate-bounce" style={{ animationDuration: '3s' }} />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-850">PVC Insight</span>
                <p className="text-xs text-slate-700 leading-relaxed transition-opacity duration-300">
                  {pvcTips[currentTipIndex]}
                </p>
              </div>
            </div>
          </div>
        ) : showGrandUploader ? (
          <div
            className={`grid min-h-[330px] grid-cols-1 transition-colors lg:grid-cols-[1.15fr_0.85fr] ${isDraggingFile ? 'bg-blue-50' : 'bg-white'}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled) setIsDraggingFile(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingFile(false);
            }}
            onDrop={handlePdfDrop}
          >
            <div className="flex flex-col justify-center border-b border-slate-200 bg-slate-950 px-6 py-9 text-white sm:px-10 lg:border-b-0 lg:border-r lg:px-12">
              <div className="mb-5 flex items-center gap-3 text-sm font-semibold text-blue-300">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm">
                  <ScanText className="h-5 w-5" />
                </span>
                {title}
              </div>
              <h2 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
                Signed bill in. PVC-ready entries out.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Convert a railway bill PDF into schedules, current quantities, agreement rates, classifications, and material calculations in one reviewable extraction.
              </p>
              <div className="mt-7 grid grid-cols-1 gap-4 border-t border-slate-700 pt-5 text-sm sm:grid-cols-3">
                <div className="flex items-start gap-2.5">
                  <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-slate-200">Schedules and bill items</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-slate-200">Work classifications</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <span className="text-slate-200">Cement and steel analysis</span>
                </div>
              </div>
            </div>

            <div className="flex items-stretch p-5 sm:p-7">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className={`flex min-h-[240px] w-full flex-col items-center justify-center border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDraggingFile
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-300 bg-slate-50 hover:border-blue-500 hover:bg-blue-50/60'
                }`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-md bg-blue-600 text-white shadow-md">
                  <Upload className="h-7 w-7" />
                </span>
                <span className="mt-5 text-lg font-bold text-slate-900">
                  {isDraggingFile ? 'Release to start extraction' : 'Drop signed bill PDF here'}
                </span>
                <span className="mt-2 text-sm text-slate-500">or click to choose a document</span>
                <span className="mt-5 text-xs font-medium text-slate-400">PDF only, up to 25 MB</span>
              </button>
            </div>
          </div>
        ) : (
          <>
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
          </>
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
                <div className="text-sm font-semibold">{formatNumber(result.summary.cementQuantity * 10)} Qtl</div>
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

            {isUnlocked && (result.summary.cementAmount === null || result.summary.cementAmount === undefined) ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    No cement supply rate was found in the bill, so the cement amount could not be calculated automatically.
                  </div>
                </div>

                {result.summary.cementQuantity > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 text-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-violet-600" />
                        DSR 5.35 Cement Rate Calculator (No direct supply rate fallback)
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-emerald-700">
                        <span className="inline-flex items-center gap-1">
                          <Save className="h-3 w-3" />
                          {settingsSavedAt ? 'Saved for next bill' : 'Auto-save enabled'}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={resetSavedRateSettings}
                          className="h-7 px-2 text-[10px] text-slate-500"
                          title="Reset saved cement rate settings"
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Reset
                        </Button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      If there is no direct cement supply item in this contract, the cement rate is derived from DSR 2021 item 5.35 (base Rs. 688.45/quintal) adjusted for contract escalation, bid rate, and rebate.
                    </p>

                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500">Base Rate (Rs./Qtl)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={dsrBaseRate}
                        onChange={(e) => setDsrBaseRate(parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs bg-white w-40"
                      />
                    </div>

                    <div className="space-y-4 pt-2">
                      {getUniqueCementSchedules(result).map(sched => {
                        const settings = scheduleSettings[sched] || { escalation: '', bidRate: '', rebate: '' };
                        const { derivedRatePerQuintal, derivedRatePerMt } = getDerivedRates(sched);
                        const schedAmount = getScheduleCementAmount(sched);
                        const schedItemsCount = (result.billDetails?.items || result.extractedItems || [])
                          .filter(item => (item.schedule || item.scheduleGroup || 'Default') === sched && item.isCementAffected && item.sourceBook !== 'USSR_2021').length;

                        return (
                          <div key={sched} className="border-t pt-3 first:border-t-0 first:pt-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-violet-100 text-violet-750 font-bold border-none">
                                {sched}
                              </Badge>
                              <span className="text-[10px] text-slate-500">({schedItemsCount} cement-affected items)</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-slate-500">Escalation %</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g. -25.00"
                                  value={settings.escalation}
                                  onChange={(e) => setScheduleSettings(prev => ({
                                    ...prev,
                                    [sched]: { ...prev[sched], escalation: e.target.value }
                                  }))}
                                  className="h-8 text-xs bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-slate-500">Bid Rate % (+/-)</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g. 3.80"
                                  value={settings.bidRate}
                                  onChange={(e) => setScheduleSettings(prev => ({
                                    ...prev,
                                    [sched]: { ...prev[sched], bidRate: e.target.value }
                                  }))}
                                  className="h-8 text-xs bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-slate-500">Rebate % (discount)</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g. 0.50"
                                  value={settings.rebate}
                                  onChange={(e) => setScheduleSettings(prev => ({
                                    ...prev,
                                    [sched]: { ...prev[sched], rebate: e.target.value }
                                  }))}
                                  className="h-8 text-xs bg-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1.5 text-[11px] bg-slate-50 p-2 rounded">
                              <div>
                                <span className="text-slate-400">Rate/Qtl: </span>
                                <span className="font-semibold text-slate-800">Rs. {derivedRatePerQuintal.toFixed(4)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Rate/MT: </span>
                                <span className="font-semibold text-slate-800">Rs. {derivedRatePerMt.toFixed(2)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-400">Amount: </span>
                                <span className="font-bold text-violet-700">{formatAmount(schedAmount)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Derived Cement Cost</div>
                        <div className="text-base font-extrabold text-violet-850">
                          {formatAmount(
                            getUniqueCementSchedules(result).reduce((sum, sched) => sum + getScheduleCementAmount(sched), 0)
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => applyCalculatedAmount(
                          getUniqueCementSchedules(result).reduce((sum, sched) => sum + getScheduleCementAmount(sched), 0)
                        )}
                        className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white font-medium"
                      >
                        Apply Derived Costs
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : isUnlocked && result.cementAmountSource === 'USSR_SEPARATE_SUPPLY' ? (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Cement amount was taken directly from the separate USSR cement supply item; no DSR coefficient was used.
              </div>
            ) : isUnlocked ? (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Cement amount was calculated from DSR coefficients and applied to the bill form.
              </div>
            ) : null}

            {(result.warnings || []).map((warning) => (
              <div key={warning} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {warning}
              </div>
            ))}

            {isUnlocked ? (
              <>
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
                          <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                            {getItemCementDeduction(item) > 0 ? (
                              <div className="space-y-0.5">
                                <div className="text-[10px] text-slate-400 line-through">
                                  {formatAmount((item as any).originalAmount || item.amountSinceLastBill)}
                                </div>
                                <div className="text-[10px] text-red-500 font-medium">
                                  -{formatAmount(getItemCementDeduction(item))}
                                </div>
                                <div className="text-slate-800 font-bold">
                                  {formatAmount(item.amountSinceLastBill)}
                                </div>
                              </div>
                            ) : (
                              formatAmount(item.amountSinceLastBill)
                            )}
                          </td>
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
                      {result.results.slice(0, compact ? 5 : undefined).map((item, index) => (
                        <tr key={`${item.dsrCode}-${index}`}>
                          <td className="whitespace-nowrap px-2 py-2 font-medium">{item.dsrCode || '-'}</td>
                          <td className="max-w-[360px] px-2 py-2">
                            <div className="line-clamp-2">{item.description}</div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            {formatNumber(item.quantity, 2)} {item.unit}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            {item.coefficient ? (
                              formatNumber(item.coefficient, 5)
                            ) : item.dsrCode && !item.dsrCode.startsWith('REVIEW-') ? (
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.00001"
                                  inputMode="decimal"
                                  value={coefficientDrafts[item.dsrCode] || ''}
                                  onChange={event => setCoefficientDrafts(current => ({
                                    ...current,
                                    [item.dsrCode]: event.target.value,
                                  }))}
                                  placeholder="MT/unit"
                                  aria-label={`Cement coefficient for ${item.dsrCode} in MT per ${item.unit}`}
                                  title={`Enter MT of cement required per ${item.unit}`}
                                  className="h-7 w-20 px-2 text-right text-xs"
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => void saveMissingCoefficient(item)}
                                  disabled={savingCoefficientCode === item.dsrCode}
                                  title="Save to shared DSR coefficient library"
                                  aria-label={`Save coefficient for ${item.dsrCode}`}
                                >
                                  {savingCoefficientCode === item.dsrCode
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Save className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                            {formatNumber(item.cementQuantity * 10)} Qtl
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.results.some(item => !item.coefficient) && !compact && (
                  <div className="text-xs text-muted-foreground">
                    Missing coefficient: enter MT of cement required per displayed item unit, then save. Administrator access is required because this updates the shared library.
                  </div>
                )}

                {compact && result.results.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    Showing first 5 of {result.results.length} extracted cement items.
                  </div>
                )}
              </>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-slate-50/50 p-6 text-center shadow-sm">
                <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px]" />
                <div className="relative z-10 space-y-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-slate-800">Extraction Details Locked</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      Review the summary statistics above. Unlock to import all schedule items, steel types, and cement details directly into the bill form.
                    </p>
                  </div>
                  <div className="flex justify-center pt-1">
                    <Button
                      type="button"
                      onClick={handleUnlock}
                      disabled={unlocking}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all"
                    >
                      {unlocking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="mr-2 h-4 w-4" />
                      )}
                      {unlocking ? 'Unlocking...' : unlockCost === 0 ? 'Import Details (Free)' : `Unlock & Import Details (₹${unlockCost})`}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
