'use client';

import { ChangeEvent, DragEvent, MutableRefObject, useRef, useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Cpu, Download, FileCheck2, FileSpreadsheet, FileText, HardDrive, Lightbulb, ListChecks, Loader2, Lock, RotateCcw, Save, ScanText, Trash2, Unlock, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitBlockSize } from '@/lib/dsr-cement-calculation';
import { CEMENT_DERIVATION_ENABLED } from '@/lib/cement-derivation';
import {
  DEFAULT_DSR_BASE_RATE,
  contractCementRateSettings,
  deriveCementRate,
  isBlankCementRateSettings,
  type CementRateSettings,
} from '@/lib/dsr-cement-rate';

/** Vercel rejects a serverless request body larger than this, before any of our code runs. */
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

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
  coefficientWorkUnit?: string | null;
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
  groupName?: string;
  sourceBook?: 'USSR_2021' | 'DSR_2021' | 'DSR_2023' | 'NON_SCHEDULE' | 'UNKNOWN';
  /** Set when the wording shown was completed from a published schedule of rates. */
  rateBookEdition?: string;
  rateBookCode?: string;
  pageNumber?: number;
  requiresDsrCementCoefficient?: boolean;
  isCementAffected?: boolean;
  isSteelItem?: boolean;
  steelType?: 'TMT' | 'ANGLE_CHANNEL' | 'PLATES' | 'OTHER_SECTIONS' | '';
  suggestedClassificationCode?: string;
  suggestedClassificationReason?: string;
  confidence?: 'high' | 'medium' | 'low';
  classificationReviewedByAi?: boolean;
}

export interface ExtractedBillDetails {
  billNo?: string;
  agreementNo?: string;
  contractorName?: string;
  workDescription?: string;
  measurementDate?: string;
  grossBillAmount?: number;
  netBillAmount?: number;
  rebatePercentage?: number;
  rebateAmount?: number;
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
  aiEnhancement?: {
    status: 'completed' | 'partial' | 'unavailable' | 'not_requested';
    reviewedItemCount: number;
    improvedDescriptionCount: number;
    message: string;
  };
}

export interface AppliedExtractionContext {
  /** Identifies the upload these details came from. Stable across every re-application of
   *  the same extraction — an unlock, or a cement figure derived afterwards — so a page
   *  that fills one bill per PDF keeps updating that bill instead of starting another. */
  uploadId: string;
  fileName: string;
  /** Set only when this PDF is one of several read in a single run. */
  batch?: { index: number; total: number };
  /** The kept copy of this PDF, when the server managed to keep one. Pass it back when
   *  saving the bill so the file is attached to it rather than swept as an orphan. */
  documentId?: number | null;
  /** Where the details came from. A spreadsheet was typed by a person and its
   *  descriptions came from a lookup, so it is never saved without being looked at. */
  source?: 'pdf' | 'sheet';
}

interface BillPdfCementAnalyzerProps {
  title?: string;
  compact?: boolean;
  disabled?: boolean;
  contractId?: string;
  /** Set when the bill already exists (the edit page). The uploaded PDF is then kept
   *  against that bill immediately, instead of waiting to be claimed when a new bill
   *  is saved -- on the edit page, no save ever claims it. */
  billId?: string;
  /** Raw Contract.schedules — supplies the agreed escalation/bid rate per schedule, so the
   *  reference cement figure shown here matches what the manual calculator would derive,
   *  instead of starting blank until someone types the same numbers in twice. */
  contractSchedules?: unknown;
  /** Contract.rebatePercentage — agreed once for the whole agreement. */
  contractRebate?: number | null;
  onApplyCementAmount?: (amount: number, data: CementAnalysisData) => void;
  onApplyBillDetails?: (data: CementAnalysisData, context?: AppliedExtractionContext) => void | Promise<void>;
  /** Take several bill PDFs in one go, read one after another. A batch of bills arrives
   *  as a batch of PDFs, and picking them singly meant sitting through each extraction
   *  before you could choose the next file. */
  multiple?: boolean;
  /** Filled with a function that opens this component's file picker, so a page can put
   *  "Upload bill PDF" somewhere else — a sticky bar, say — without duplicating the
   *  upload logic or the checks that run before it. */
  openFilePickerRef?: MutableRefObject<(() => void) | null>;
  /** Opens the spreadsheet picker, so a failure screen elsewhere can offer that way out
   *  without owning a second upload pipeline. */
  openSheetPickerRef?: MutableRefObject<(() => void) | null>;
  /** Told when a read ends without details being applied — it failed, or it came back
   *  locked and needs a hand. A page that hides itself behind a "Reading your bill…"
   *  cover has no other way to know: onApplyBillDetails simply never fires, so the
   *  spinner runs for ever and a failed read looks exactly like a slow one. */
  /** Why a PDF did not fill the form, and which file it was (single-file mode). */
  onExtractionIncomplete?: (reason: string, fileName?: string) => void;
}

interface SavedCementRateSettings {
  baseRate: number;
  schedules: Record<string, CementRateSettings>;
  savedAt: string;
}

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

function isSpecialConditionOnlyItem(item: ExtractedBillItem) {
  return Number(item.quantitySinceLastBill || 0) === 0
    && Number(item.amountAtAgreementRateSinceLastBill || 0) === 0
    && Number(item.amountIncludingSpecialConditionSinceLastBill || item.amountSinceLastBill || 0) > 0;
}

export function BillPdfCementAnalyzer({
  title = 'Direct PDF Bill Extraction',
  compact = false,
  disabled = false,
  contractId,
  billId,
  contractSchedules,
  contractRebate,
  onApplyCementAmount,
  onApplyBillDetails,
  multiple = false,
  openFilePickerRef,
  openSheetPickerRef,
  onExtractionIncomplete,
}: BillPdfCementAnalyzerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  /** Set once a read has failed, so the spreadsheet stops being a quiet aside and
   *  becomes the offered way forward — which at that moment it is. */
  const [readFailed, setReadFailed] = useState(false);
  const analysisStartedAtRef = useRef<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<CementAnalysisData | null>(null);
  useEffect(() => {
    if (!openFilePickerRef) return;
    openFilePickerRef.current = () => inputRef.current?.click();
    return () => { openFilePickerRef.current = null; };
  }, [openFilePickerRef]);

  useEffect(() => {
    if (!openSheetPickerRef) return;
    openSheetPickerRef.current = () => sheetInputRef.current?.click();
    return () => { openSheetPickerRef.current = null; };
  }, [openSheetPickerRef]);
  const [coefficientDrafts, setCoefficientDrafts] = useState<Record<string, string>>({});
  // The unit the typed coefficient is quoted PER. DSR publishes cement consumption
  // per a block — "0.117 MT per 100 Sqm" — so this must be captured, not assumed to
  // be the bill's own unit, or the stored row means 100x more cement than the book.
  const [coefficientUnitDrafts, setCoefficientUnitDrafts] = useState<Record<string, string>>({});
  const [savingCoefficientCode, setSavingCoefficientCode] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);

  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockCost, setUnlockCost] = useState(0);

  // The upload whose result is on screen. Handed to the page with every application of
  // that result so it can tell "the same bill again" from "another bill".
  const uploadCounterRef = useRef(0);
  const [activeUpload, setActiveUpload] = useState<AppliedExtractionContext | null>(null);
  // Where we are in a multi-PDF run, and which of its files could not be read. Failures
  // stay on screen after the run: a toast is gone by the time the last bill lands, and
  // "one of these nine did not come through" is not a thing to leave the user guessing.
  const [queueProgress, setQueueProgress] = useState<{ index: number; total: number } | null>(null);
  const [queueFailures, setQueueFailures] = useState<Array<{ fileName: string; reason: string }>>([]);

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
    'Reading native PDF text coordinates...',
    'Reading bill metadata and schedule summary...',
    'Mapping IREPS table columns and item codes...',
    'Verifying Qty x Agreement Rate values...',
    'Reading special-condition adjustments...',
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
                  : processingSeconds < 40 ? 6
                    : 7;
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
        await onApplyBillDetails(unlockedData, activeUpload ?? undefined);
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

  // Initialize schedule settings when result changes. Prefilled from the CONTRACT's
  // agreed escalation/bid rate — same source the manual calculator has always read —
  // rather than blank, so a bill nobody has typed a rate into yet still shows an
  // accurate reference figure instead of one derived at 0% escalation.
  useEffect(() => {
    if (!result) return;
    const schedules = getUniqueCementSchedules(result);
    setScheduleSettings(prev => {
      const updated = { ...prev };
      schedules.forEach(sched => {
        if (isBlankCementRateSettings(updated[sched])) {
          updated[sched] = contractCementRateSettings(contractSchedules, sched, contractRebate);
        }
      });
      return updated;
    });
  }, [result, contractSchedules, contractRebate]);

  const getDerivedRates = (sched: string) => {
    const { perQuintal, perMt } = deriveCementRate(dsrBaseRate, scheduleSettings[sched]);
    return { derivedRatePerQuintal: perQuintal, derivedRatePerMt: perMt };
  };

  // A cement coefficient row is identified by its ITEM NUMBER (DSR / item no). An item
  // is cement-affected only when its item number appears in the coefficient table.
  // Description is deliberately NOT used to match, because different items can share the
  // same description (e.g. two "Concrete of M25 grade..." rows with different item nos),
  // which would otherwise add cement to an item that is not in the coefficient list.
  const coeffKey = (x: { dsrCode?: string; itemNo?: string } | undefined) =>
    String(x?.dsrCode || x?.itemNo || '').trim();
  const findCoeffIndex = (list: ExtractedBillItem[] | undefined, item: ExtractedBillItem) => {
    const key = coeffKey(item);
    if (!key || !list) return -1;
    return list.findIndex(ci => coeffKey(ci) === key);
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
        const coeffIndex = findCoeffIndex(result.coefficientItems, item);
        if (coeffIndex !== -1) {
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
    
    const coeffIndex = findCoeffIndex(resData.coefficientItems, item);
    if (coeffIndex === -1) return 0;
    const cementQtyMT = resData.results[coeffIndex]?.cementQuantity || 0;
    return cementQtyMT * derivedRatePerMt;
  };

  const saveMissingCoefficient = async (item: CementAnalysisResultItem) => {
    if (!result || !item.dsrCode) return;
    const coefficient = Number(coefficientDrafts[item.dsrCode]);
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      toast.error('Enter a valid cement coefficient in MT.');
      return;
    }
    // Copied straight from DSR this is a per-block figure ("0.117 MT per 100 Sqm").
    // Default to the bill's own unit for books that quote per single unit.
    const workUnit = (coefficientUnitDrafts[item.dsrCode] || item.unit).trim();
    const blockSize = unitBlockSize(workUnit);

    try {
      setSavingCoefficientCode(item.dsrCode);
      const response = await fetch('/api/admin/dsr-cement-coefficients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dsrCode: item.dsrCode,
          description: item.description,
          workUnit,
          cementQuantityPerUnit: coefficient,
        }),
      });
      const json = await response.json().catch(() => ({ error: 'Invalid server response.' }));
      if (!response.ok) throw new Error(json.error || 'Failed to save coefficient.');

      const updatedResults = result.results.map(existing => {
        if (existing.dsrCode !== item.dsrCode) return existing;
        // Divide the block out exactly as calculateDsrCementRequirement does on the
        // server, so this preview can never disagree with the saved calculation.
        const cementQuantity = existing.quantity * coefficient / blockSize;
        return {
          ...existing,
          matched: true,
          coefficient,
          cementQuantity,
          cementUnit: 'MT',
          cementAmount: result.cementRatePerUnit && result.cementRatePerUnit > 0
            ? cementQuantity * result.cementRatePerUnit
            : null,
          coefficientWorkUnit: workUnit,
          coefficientSource: 'DSR 2021 Analysis of Rates - admin verified',
          reason: `Quantity ${existing.quantity} x coefficient ${coefficient} MT/${workUnit}`
            + (blockSize !== 1 ? ` (divided by the ${blockSize}-unit block)` : ''),
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
      onApplyBillDetails?.(updated, activeUpload ?? undefined);
      toast.success(`${item.dsrCode} coefficient saved for current and future bills.`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save coefficient.');
    } finally {
      setSavingCoefficientCode(null);
    }
  };

  const deleteExtractedItem = (itemToRemove: ExtractedBillItem) => {
    if (!result) return;
    const items = result.billDetails?.items || result.extractedItems || [];
    const updatedItems = items.filter(item => item !== itemToRemove);

    const itemAmountTotal = Math.round(
      updatedItems.reduce((sum, item) => sum + Number(item.amountSinceLastBill || 0), 0) * 100,
    ) / 100;
    const scheduleSummaryTotal = result.billDetails?.scheduleSummaryTotal;
    const amountDifference = scheduleSummaryTotal !== undefined
      ? Math.round((itemAmountTotal - scheduleSummaryTotal) * 100) / 100
      : result.billDetails?.amountDifference;
    const amountsReconciled = scheduleSummaryTotal !== undefined
      ? Math.abs(amountDifference ?? 0) <= 0.05
      : result.billDetails?.amountsReconciled;

    const updated: CementAnalysisData = {
      ...result,
      billDetails: result.billDetails ? {
        ...result.billDetails,
        items: updatedItems,
        itemAmountTotal,
        amountDifference,
        amountsReconciled,
      } : undefined,
      extractedItems: result.extractedItems ? updatedItems : undefined,
    };
    setResult(updated);
    onApplyBillDetails?.(updated, activeUpload ?? undefined);
    toast.success('Item removed from the extracted list.');
  };

  const deleteCementResultItem = (itemToRemove: CementAnalysisResultItem) => {
    if (!result) return;
    // `coefficientItems` and `results` are parallel arrays (getItemCementDeduction and
    // applyCalculatedAmount match a bill item to its cement by the SAME index in both).
    // Remove the row from BOTH so the arrays stay aligned — otherwise later items shift
    // and get the wrong cement quantity.
    const removeIndex = result.results.indexOf(itemToRemove);
    const updatedResults = result.results.filter(item => item !== itemToRemove);
    const updatedCoefficientItems = result.coefficientItems && removeIndex >= 0
      ? result.coefficientItems.filter((_, index) => index !== removeIndex)
      : result.coefficientItems;

    const matchedResults = updatedResults.filter(item => item.matched);
    const unmatchedItemCount = updatedResults.length - matchedResults.length;
    const cementQuantity = matchedResults.reduce((sum, item) => sum + item.cementQuantity, 0);
    const cementAmount = matchedResults.reduce((sum, item) => sum + (item.cementAmount || 0), 0);
    const warnings = (result.warnings || []).filter(warning => !/need DSR cement coefficients/i.test(warning));
    if (unmatchedItemCount > 0) {
      warnings.push(`${unmatchedItemCount} item(s) need DSR cement coefficients before cement amount can be finalized.`);
    }

    // The cement deduction is baked onto the matching bill item (originalAmount /
    // cementDeduction). Strip it and restore the item's full amount, so the rebuilt
    // classification entries no longer carve out a cement portion for the removed row.
    const stripCementFromItem = (item: ExtractedBillItem): ExtractedBillItem => {
      if (coeffKey(item) !== coeffKey(itemToRemove)) return item;
      const anyItem = item as any;
      const restoredAmount = anyItem.originalAmount ?? item.amountSinceLastBill;
      const { originalAmount, cementDeduction, cementQuantityQuintals, cementRatePerQuintal, ...rest } = anyItem;
      return { ...(rest as ExtractedBillItem), amountSinceLastBill: restoredAmount, isCementAffected: false, requiresDsrCementCoefficient: false };
    };

    const updated: CementAnalysisData = {
      ...result,
      results: updatedResults,
      coefficientItems: updatedCoefficientItems,
      billDetails: result.billDetails
        ? { ...result.billDetails, items: result.billDetails.items?.map(stripCementFromItem) }
        : result.billDetails,
      extractedItems: result.extractedItems?.map(stripCementFromItem) ?? result.extractedItems,
      summary: {
        ...result.summary,
        matchedItemCount: matchedResults.length,
        unmatchedItemCount,
        cementQuantity,
        cementAmount: matchedResults.some(item => item.cementAmount !== null) ? cementAmount : null,
        hasCementAmount: matchedResults.some(item => item.cementAmount !== null),
      },
      warnings,
    };
    setResult(updated);
    onApplyBillDetails?.(updated, activeUpload ?? undefined);
    toast.success('Coefficient row removed. Its cement is excluded from the calculation.');
  };

  const applyCalculatedAmount = (amount: number) => {
    if (!result) return;

    // Update the amountSinceLastBill of each cement-affected item in the result items list
    const updatedItems = (result.billDetails?.items || result.extractedItems || []).map((item) => {
      const deduction = getItemCementDeduction(item);
      if (deduction > 0) {
        // Store the original amount in a new property if not already present
        const originalAmount = (item as any).originalAmount ?? Number(item.amountSinceLastBill || 0);
        
        // Find cement quantity in MT from result (matched by item number)
        const coeffIndex = findCoeffIndex(result.coefficientItems, item);
        const cementResult = coeffIndex !== -1 ? result.results[coeffIndex] : undefined;
        const cementQtyMT = cementResult?.cementQuantity || 0;
        const cementQuantityQuintals = cementQtyMT * 10;

        const sched = item.schedule || item.scheduleGroup || 'Default';
        const { derivedRatePerQuintal } = getDerivedRates(sched);

        return {
          ...item,
          originalAmount,
          cementDeduction: deduction,
          cementQuantityQuintals,
          cementRatePerQuintal: derivedRatePerQuintal,
          // How the cement quantity was arrived at. Carried onto the item so the saved
          // bill keeps it and the report can print the working (Qty x Coeff / block)
          // instead of a dash — without it the cement figure is unverifiable on the
          // statement, which is the first thing an accounts office asks about.
          cementSourceQty: cementResult?.quantity,
          cementCoefficient: cementResult?.coefficient ?? undefined,
          cementWorkUnit: cementResult?.coefficientWorkUnit ?? undefined,
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
      onApplyBillDetails(updated, activeUpload ?? undefined);
    }
    toast.success(`Applied derived cement cost: ${formatAmount(amount)} and deducted from cement-affected DSR items.`);
  };

  /** Outcome of one PDF. The reason is returned rather than shown, so a single upload can
   *  announce it immediately while a run of PDFs collects the failures and reports them
   *  once at the end instead of firing a toast per file. */
  type AnalyzeOutcome = { ok: true; locked: boolean } | { ok: false; reason: string };

  const analyzePdfFile = async (file: File, batch?: { index: number; total: number }): Promise<AnalyzeOutcome> => {
    if (file.type !== 'application/pdf') {
      return { ok: false, reason: 'Not a PDF — please upload the bill PDF downloaded from IREPS.' };
    }
    // The hosting platform rejects a request body over 4.5 MB before it ever reaches
    // the reader, so uploading a larger file only wastes the wait and comes back as a
    // bare 413. Say so up front, and name the usual cause: an IREPS PDF of a bill this
    // size is a few hundred KB, so several MB means scanned or photographed pages —
    // which carry no text layer and could not be read at any size.
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        reason: `This PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)} MB upload limit. `
          + 'A scanned or photographed bill is usually the reason, and a scan has no readable text in any case. '
          + 'Please download this bill from IREPS and upload that file.',
      };
    }

    uploadCounterRef.current += 1;
    const upload: AppliedExtractionContext = {
      uploadId: `upl_${uploadCounterRef.current}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      batch,
      source: 'pdf',
    };
    setActiveUpload(upload);

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
        const params = new URLSearchParams({ stage: 'direct' });
        if (contractId) params.set('contractId', contractId);
        if (billId) params.set('billId', billId);
        return `/api/bills/cement-analysis?${params.toString()}`;
      };

      const extraction = await new Promise<{ status: number; json: any }>((resolve, reject) => {
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
        // A connection that hangs open fires neither onload nor onerror, so the whole
        // panel sat on "Processing Document" with a counting timer and no cancel, for
        // ever. Ten minutes is past any real extraction — a long bill is a minute or two.
        request.timeout = 10 * 60 * 1000;
        request.ontimeout = () => reject(new Error(
          'The bill PDF took too long and the upload was stopped. Try it again, and if it '
          + 'keeps happening, split the PDF or send it in smaller parts.',
        ));
        request.onload = () => {
          try {
            resolve({ status: request.status, json: JSON.parse(request.responseText) });
          } catch {
            // A non-JSON body means the request never reached the route: a gateway
            // timeout, a deploy swapping the function out, or a size rejection. Say
            // which, and carry the status through — the old message named none of
            // them, so a report of it could not be acted on.
            const status = request.status;
            const snippet = (request.responseText || '')
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 200);
            const error =
              [502, 503, 504].includes(status)
                ? `Direct PDF extraction timed out (HTTP ${status}). Please retry.`
                : status === 413
                  ? `The bill PDF exceeded the ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)} MB upload limit. Please download the bill from IREPS and upload that file.`
                  : status === 0
                    ? 'The upload was interrupted before the server replied. Please retry.'
                    : `The server replied HTTP ${status} instead of a result — usually a deploy in progress. `
                      + `Please retry in a minute.${snippet ? ` (${snippet})` : ''}`;
            resolve({ status: status || 500, json: { error } });
          }
        };
        request.send(formData);
      });

      const { status, json } = extraction;
      if (status < 200 || status >= 300) {
        throw new Error(json.error || 'Failed to analyze bill PDF');
      }

      const data = json.data as CementAnalysisData;
      setResult(data);
      setReadFailed(false);
      // The server keeps the uploaded PDF for 90 days and names it here. Carried on the
      // upload context so whoever saves the bill can attach it.
      upload.documentId = typeof json.documentId === 'number' ? json.documentId : null;

      // The contract's agreement number can change as a side effect of reading the
      // bill; that must never happen silently, and a refusal because the number is
      // held elsewhere means the bill probably went against the wrong contract.
      const fill = (data.billDetails as any)?.agreementNumberFill;
      if (fill?.applied) {
        toast.success(`Contract agreement number set to ${fill.to} — read from the bill (was ${fill.from}).`, { duration: 8000 });
      } else if (fill?.conflict) {
        toast.error(fill.reason, { duration: 10000 });
      }
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
          // Awaited so a run of PDFs stays strictly one at a time: the page may do its own
          // asynchronous work — a PVC comparison, a contract match — before the bill it is
          // filling settles, and the next extraction must not land in the middle of it.
          await onApplyBillDetails(data, upload);
        }
        toast.success(`Extracted ${data.billDetails?.items?.length || data.extractedItems?.length || 0} bill item(s)`);
      } else {
        toast.success(`Direct PDF extraction completed. Click "Unlock & Import" below to apply the details.`);
      }
      return { ok: true, locked: !unlocked };
    } catch (error: any) {
      console.error('Bill PDF cement analysis failed:', error);
      // The spreadsheet becomes the offered way forward from here.
      setReadFailed(true);
      return { ok: false, reason: error.message || 'Failed to analyze bill PDF' };
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** Reads the chosen PDFs one after another. Sequential on purpose: extraction is a long
   *  AI call, and firing a folder of them at once would both swamp the endpoint and make
   *  the progress panel meaningless. */
  const analyzePdfFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (files.length === 1) {
      setQueueFailures([]);
      const outcome = await analyzePdfFile(files[0]);
      if (outcome.ok === false) {
        toast.error(outcome.reason, { duration: 10000 });
        onExtractionIncomplete?.(outcome.reason, files[0].name);
      } else if (outcome.locked) {
        onExtractionIncomplete?.('The bill was read, but the figures need unlocking before they can be used.', files[0].name);
      }
      return;
    }

    const failures: Array<{ fileName: string; reason: string }> = [];
    setQueueFailures([]);
    let extracted = 0;

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setQueueProgress({ index: index + 1, total: files.length });
      const outcome = await analyzePdfFile(file, { index: index + 1, total: files.length });

      if (outcome.ok === false) {
        failures.push({ fileName: file.name, reason: outcome.reason });
        continue;
      }

      extracted += 1;
      if (outcome.locked) {
        // A locked result has to be imported by hand, and the panel showing it would be
        // replaced by the next file's. Stop rather than lose it.
        const skipped = files.slice(index + 1);
        skipped.forEach(remaining => failures.push({
          fileName: remaining.name,
          reason: 'Not read — unlock the extraction above, then upload the rest.',
        }));
        break;
      }
    }

    setQueueProgress(null);
    setQueueFailures(failures);

    if (failures.length === 0) {
      toast.success(`Read all ${extracted} bill PDFs.`);
    } else {
      toast.error(
        `Read ${extracted} of ${files.length} bill PDFs. ${failures.length} could not be read — see the list below.`,
        { duration: 10000 },
      );
      if (extracted === 0) {
        onExtractionIncomplete?.(`None of the ${files.length} bill PDFs could be read.`);
      }
    }
  };

  const handlePdfUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void analyzePdfFiles(files);
  };

  /**
   * A bill typed into the spreadsheet, for a scan the reader cannot open.
   *
   * Deliberately the SAME landing as a read PDF: the server turns the rows into the
   * same items and hands back the same shape, so the review screen, the classifications
   * and the cement and steel figures are all reached the same way. A second, parallel
   * path would be a second set of bugs.
   */
  const analyzeSheetFile = async (file: File) => {
    uploadCounterRef.current += 1;
    const upload: AppliedExtractionContext = {
      uploadId: `sheet_${uploadCounterRef.current}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      source: 'sheet',
    };
    try {
      setIsAnalyzing(true);
      setFileName(file.name);
      setLoadingStep(1);
      setProcessingStartedAt(Date.now());

      const body = new FormData();
      body.append('file', file);
      const params = new URLSearchParams({ stage: 'sheet' });
      if (contractId) params.set('contractId', contractId);
      if (billId) params.set('billId', billId);

      const response = await fetch(`/api/bills/cement-analysis?${params.toString()}`, { method: 'POST', body });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(json.problems) && json.problems.length
          ? json.problems.slice(0, 5).join(' ')
          : '';
        throw new Error([json.error || 'The spreadsheet could not be read.', detail].filter(Boolean).join(' '));
      }

      const data = json.data as CementAnalysisData;
      setResult(data);
      setExtractionId(json.extractionId || null);
      setIsUnlocked(true);
      upload.documentId = typeof json.documentId === 'number' ? json.documentId : null;

      if (onApplyBillDetails) await onApplyBillDetails(data, upload);
      toast.success(`Read ${data.billDetails?.items?.length || 0} item(s) from the spreadsheet. Check every row before creating the bill.`);
      return { ok: true as const };
    } catch (error: any) {
      const reason = error.message || 'The spreadsheet could not be read.';
      toast.error(reason, { duration: 12000 });
      onExtractionIncomplete?.(reason, file.name);
      return { ok: false as const, reason };
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSheetUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = (event.target.files || [])[0];
    event.target.value = '';
    if (file) void analyzeSheetFile(file);
  };

  const handlePdfDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    if (disabled || isAnalyzing) return;
    const files = Array.from(event.dataTransfer.files || []);
    void analyzePdfFiles(multiple ? files : files.slice(0, 1));
  };

  const showGrandUploader = !isAnalyzing && !result;

  return (
    <Card className={`overflow-hidden ${showGrandUploader ? 'border-slate-200 bg-white shadow-sm' : 'border-emerald-200 bg-emerald-50/40'}`}>
      {!showGrandUploader && (
        <CardHeader className={compact ? 'p-4 pb-2' : 'p-5 pb-3'}>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-emerald-700" />
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={showGrandUploader ? 'p-0' : compact ? 'p-4 pt-0 space-y-3' : 'p-5 pt-0 space-y-4'}>
        {queueFailures.length > 0 && (
          <div className={`rounded-md border border-amber-200 bg-amber-50 p-3.5 ${showGrandUploader ? 'm-4' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {queueFailures.length} PDF{queueFailures.length === 1 ? '' : 's'} could not be read
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-amber-900" onClick={() => setQueueFailures([])}>
                Dismiss
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-amber-800">
              No bill was created for these. The rest came through — upload these again once fixed.
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {queueFailures.map((failure, index) => (
                <li key={`${failure.fileName}-${index}`} className="text-xs text-amber-900">
                  <span className="font-medium">{failure.fileName}</span>
                  <span className="text-amber-800"> — {failure.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isAnalyzing ? (
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-5 shadow-sm">
            {/* Top title and scanning bar animation */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-md bg-emerald-50 p-2 text-emerald-600 animate-pulse">
                  <Cpu className="h-5 w-5 animate-spin" style={{ animationDuration: '4s' }} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">
                    {queueProgress
                      ? `Processing Document ${queueProgress.index} of ${queueProgress.total}`
                      : 'Processing Document'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {uploadPercent < 100
                      ? `Uploading ${formatFileSize(uploadedBytes)} of ${formatFileSize(fileSize)}`
                      : extractionPartCount > 0
                        ? `Extracted ${extractionPartsCompleted} of ${extractionPartCount} bill pages`
                        : loadingSteps[loadingStep] || 'Processing bill'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {queueProgress && (
                  <Badge variant="outline" className="gap-1 border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    <FileText className="h-3 w-3" />
                    {queueProgress.total - queueProgress.index} left
                  </Badge>
                )}
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-100 border-none px-2.5 py-1">
                  <Clock3 className="h-3 w-3" />
                  {formatElapsed(elapsedSeconds)}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-emerald-600 transition-all duration-300 ${uploadPercent === 100 ? 'animate-pulse' : ''}`}
                  style={{
                    width: uploadPercent < 100
                      ? `${uploadPercent}%`
                      : extractionPartCount > 0
                        ? `${Math.max(5, (extractionPartsCompleted / extractionPartCount) * 100)}%`
                        : `${Math.max(12, ((loadingStep + 1) / loadingSteps.length) * 100)}%`,
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
                      : loadingSteps[loadingStep] || 'Processing bill'}
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
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
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
            className={`grid min-h-[330px] grid-cols-1 transition-colors lg:grid-cols-[1.15fr_0.85fr] ${isDraggingFile ? 'bg-emerald-50' : 'bg-white'}`}
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
              <div className="mb-5 flex items-center gap-3 text-sm font-semibold text-emerald-300">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm">
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
              <p className="mt-3 inline-flex max-w-2xl items-start gap-1.5 rounded-md bg-slate-800/70 px-3 py-2 text-xs leading-5 text-amber-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Extraction and preview are free. A bill created from an AI upload is charged the higher AI PDF rate (not the manual rate) — only when you save it.
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
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-slate-200">Cement and steel analysis</span>
                </div>
              </div>
            </div>

            <div className="flex items-stretch p-5 sm:p-7">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple={multiple}
                className="hidden"
                onChange={handlePdfUpload}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className={`flex min-h-[240px] w-full flex-col items-center justify-center border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDraggingFile
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-slate-300 bg-slate-50 hover:border-emerald-500 hover:bg-emerald-50/60'
                }`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-md bg-emerald-600 text-white shadow-md">
                  <Upload className="h-7 w-7" />
                </span>
                <span className="mt-5 text-lg font-bold text-slate-900">
                  {isDraggingFile
                    ? 'Release to start extraction'
                    : multiple ? 'Drop signed bill PDFs here' : 'Drop signed bill PDF here'}
                </span>
                <span className="mt-2 text-sm text-slate-500">
                  {multiple ? 'or click to choose one or more documents' : 'or click to choose a document'}
                </span>
                {/* The stated limit has to be the one actually enforced — a bill offered up
                    to 25 MB is turned away at 4.5 MB by the check above. */}
                <span className="mt-5 text-xs font-medium text-slate-400">
                  PDF only, up to {(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)} MB each
                </span>
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
                  multiple={multiple}
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
                  {isAnalyzing ? 'Analyzing...' : multiple ? 'Upload More Bill PDFs' : 'Upload Bill PDF'}
                </Button>
              </div>
            </div>

            {fileName && (
              <div className="text-xs text-muted-foreground">Last file: {fileName}</div>
            )}
          </>
        )}

        {/* The way out when the bill is a scan — OUTSIDE both uploader layouts.
            It used to sit inside the plain-button branch, so on the page that shows the
            big drop-zone hero — which is the one a new bill opens on — it rendered
            nowhere at all. The notice above told people to use a panel that was not on
            their screen. It is one block now, shown whichever uploader is drawn. */}
        {/* A band, not a floating card. The grand uploader is full-bleed inside a
            CardContent with no padding, so an inset box under it left the dark panel's
            square bottom corners poking out either side and the two edges touching —
            it read as one thing overlapping another. A full-width band with a rule
            above it separates them the way the rest of the card does. */}
        <div className={showGrandUploader ? 'border-t border-slate-200 bg-white p-4' : ''}>
          <div className={`rounded-xl border-2 p-4 ${readFailed
            ? 'border-emerald-400 bg-emerald-50 shadow-sm ring-2 ring-emerald-100'
            : 'border-dashed border-slate-300 bg-slate-50/70'}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                readFailed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${readFailed ? 'text-emerald-900' : 'text-slate-800'}`}>
                  {readFailed
                    ? 'This bill cannot be read — fill it in on a spreadsheet instead'
                    : 'Bill is a scan, or made by hand?'}
                </p>
                <p className={`mt-1 text-xs leading-relaxed ${readFailed ? 'text-emerald-900' : 'text-slate-500'}`}>
                  Four columns — schedule, item number, quantity and rate. The description comes
                  from the schedule of rates and the amount is quantity × rate.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/bills/manual-template${contractId ? `?contractId=${encodeURIComponent(contractId)}` : ''}`}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors ${
                      readFailed
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                  >
                    <Download className="h-4 w-4" />
                    1. Download the spreadsheet
                  </a>
                  <input
                    ref={sheetInputRef}
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={handleSheetUpload}
                  />
                  <button
                    type="button"
                    disabled={disabled || isAnalyzing}
                    onClick={() => sheetInputRef.current?.click()}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                      readFailed
                        ? 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                  >
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    2. Upload it filled in
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

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

            {result.billDetails?.amountsReconciled
              && Math.abs((result.billDetails.itemAmountTotal ?? 0) - (result.billDetails.scheduleSummaryTotal ?? 0)) <= 0.05 && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Item total {formatAmount(result.billDetails.itemAmountTotal)} matches the Schedule Summary amount including special condition.
              </div>
            )}

            {result.billDetails?.amountsReconciled
              && Math.abs((result.billDetails.itemAmountTotal ?? 0) - (result.billDetails.scheduleSummaryTotal ?? 0)) > 0.05 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Item total {formatAmount(result.billDetails.itemAmountTotal)} is within rounding of the Bill Amount {formatAmount(result.billDetails.scheduleSummaryTotal)} (off by {formatAmount(Math.abs((result.billDetails.itemAmountTotal ?? 0) - (result.billDetails.scheduleSummaryTotal ?? 0)))}). Each row is printed rounded to paise, so a long bill drifts by a few.
              </div>
            )}

            {result.billDetails && !result.billDetails.amountsReconciled && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Item total {formatAmount(result.billDetails.itemAmountTotal)} does not match the Schedule Summary amount {formatAmount(result.billDetails.scheduleSummaryTotal)} (difference {formatAmount(result.billDetails.amountDifference)}). Please review the extracted items below.
              </div>
            )}

            {result.aiEnhancement && result.aiEnhancement.status !== 'not_requested' && (
              <div className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
                result.aiEnhancement.status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}>
                {result.aiEnhancement.status === 'completed'
                  ? <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <div>
                  <span className="font-semibold">AI review: </span>
                  {result.aiEnhancement.message}
                </div>
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
                        <FileText className="h-4 w-4 text-emerald-600" />
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
                              <Badge className="bg-emerald-100 text-emerald-750 font-bold border-none">
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
                                <span className="font-bold text-emerald-700">{formatAmount(schedAmount)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Derived Cement Cost</div>
                        <div className="text-base font-extrabold text-emerald-850">
                          {formatAmount(
                            getUniqueCementSchedules(result).reduce((sum, sched) => sum + getScheduleCementAmount(sched), 0)
                          )}
                        </div>
                      </div>
                      {/* Applying this splits the cement out of the work items into a "C"
                          sub-classification. That is off — a DSR item's rate already
                          includes its cement and its own class already carries a cement
                          share. The figures above stay, as a reading of how much cement
                          the work consumes. See lib/cement-derivation.ts. */}
                      {CEMENT_DERIVATION_ENABLED ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => applyCalculatedAmount(
                            getUniqueCementSchedules(result).reduce((sum, sched) => sum + getScheduleCementAmount(sched), 0)
                          )}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                        >
                          Apply Derived Costs
                        </Button>
                      ) : (
                        <p className="text-[11px] text-slate-400 max-w-[16rem] text-right">
                          For reference only — cement is not split out of DSR items, whose rates already include it.
                        </p>
                      )}
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
                        {!compact && <th className="px-2 py-2 text-right font-medium">Remove</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(result.billDetails?.items || result.extractedItems || []).slice(0, compact ? 5 : (showAllItems ? undefined : 12)).map((item, index) => (
                        <tr key={`${item.itemNo || item.dsrCode}-${index}`}>
                          <td className="whitespace-nowrap px-2 py-2 font-medium">
                            {item.itemNo || item.dsrCode || '-'}
                            {/* Where to find this row in the bill PDF, so the classification
                                can be checked against the printed page without hunting. */}
                            {item.pageNumber ? (
                              <span className="block text-[11px] font-normal text-muted-foreground">
                                bill p.{item.pageNumber}
                              </span>
                            ) : null}
                          </td>
                          <td className="max-w-[420px] px-2 py-2">
                            <div className="line-clamp-2">{item.description}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {[item.schedule, item.scheduleGroup, item.chapter, item.sourceBook].filter(Boolean).join(' / ') || 'Schedule not identified'}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {/* The wording shown above is longer than what the bill prints,
                                  so the row says where the rest came from — not only the
                                  justification text further down. */}
                              {item.rateBookEdition && (
                                <Badge
                                  variant="outline"
                                  className="border-sky-300 text-sky-700"
                                  title={`The bill prints only this sub-item's own line. The description above is completed from ${item.rateBookEdition} item ${item.rateBookCode}.`}
                                >
                                  Wording from {item.rateBookEdition} {item.rateBookCode}
                                </Badge>
                              )}
                              {item.isCementAffected && <Badge variant="outline">Cement</Badge>}
                              {item.isCementAffected && item.sourceBook === 'USSR_2021' && <Badge variant="outline">Separate cement supply</Badge>}
                              {item.isSteelItem && <Badge variant="outline">Steel: {item.steelType || 'Review type'}</Badge>}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            {isSpecialConditionOnlyItem(item) ? (
                              <div className="text-[11px] text-amber-700">
                                Special condition
                              </div>
                            ) : (
                              <>
                                {item.quantitySinceLastBillRaw || formatNumber(item.quantitySinceLastBill, 2)} {item.unit}
                              </>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            {isSpecialConditionOnlyItem(item) ? '-' : (item.agreementRateRaw || formatAmount(item.agreementRate))}
                          </td>
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
                          <td className="px-2 py-2">
                            <div className="font-semibold">{item.suggestedClassificationCode || '-'}</div>
                            {item.suggestedClassificationReason && (
                              <div className="text-[10px] text-slate-500 max-w-[150px] truncate" title={item.suggestedClassificationReason}>
                                {item.suggestedClassificationReason}
                              </div>
                            )}
                          </td>
                          {!compact && (
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-700"
                                onClick={() => deleteExtractedItem(item)}
                                title={`Remove item ${item.itemNo || item.dsrCode || ''} from the extracted list`}
                                aria-label={`Remove item ${item.itemNo || item.dsrCode || ''}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(result.billDetails?.items?.length || result.extractedItems?.length || 0) > (compact ? 5 : 12) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {compact || !showAllItems ? (
                      <span>
                        Showing first {compact ? 5 : 12} of {result.billDetails?.items?.length || result.extractedItems?.length || 0} extracted bill items.
                      </span>
                    ) : (
                      <span>
                        Showing all {result.billDetails?.items?.length || result.extractedItems?.length || 0} extracted bill items.
                      </span>
                    )}
                    {!compact && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setShowAllItems(current => !current)}
                      >
                        {showAllItems ? 'Show less' : 'Show all records'}
                      </Button>
                    )}
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
                        {!compact && <th className="px-2 py-2 text-right font-medium">Remove</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.results.filter(row => row.coefficient != null && row.coefficient > 0).slice(0, compact ? 5 : undefined).map((item, index) => (
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
                              // Show what the coefficient is quoted PER. DSR gives cement
                              // per a block, so the bare number reads as a wrong answer:
                              // 4,443.92 Sqm x 0.117 looks like 519.94, not the correct
                              // 5.199 MT that 0.117 per 100 Sqm gives.
                              <span title={item.reason || undefined}>
                                {formatNumber(item.coefficient, 5)}
                                <span className="text-slate-400">
                                  {' '}/ {item.coefficientWorkUnit || item.unit}
                                </span>
                              </span>
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
                                  placeholder="MT"
                                  aria-label={`Cement coefficient for ${item.dsrCode} in MT`}
                                  title="Enter the cement figure exactly as DSR prints it, then the unit it is quoted per"
                                  className="h-7 w-20 px-2 text-right text-xs"
                                />
                                <span className="text-xs text-slate-400">per</span>
                                <Input
                                  value={coefficientUnitDrafts[item.dsrCode] ?? item.unit}
                                  onChange={event => setCoefficientUnitDrafts(current => ({
                                    ...current,
                                    [item.dsrCode]: event.target.value,
                                  }))}
                                  placeholder={item.unit}
                                  aria-label={`Unit the coefficient for ${item.dsrCode} is quoted per`}
                                  title={`DSR quotes cement per a block, e.g. "100 ${item.unit}". Enter it exactly as printed.`}
                                  className="h-7 w-20 px-2 text-xs"
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
                          {!compact && (
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-700"
                                onClick={() => deleteCementResultItem(item)}
                                title={`Remove ${item.dsrCode || 'this row'} from the coefficient list`}
                                aria-label={`Remove ${item.dsrCode || 'this row'} from the coefficient list`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.results.some(item => !item.coefficient) && !compact && (
                  <div className="text-xs text-muted-foreground">
                    Items without a cement coefficient are treated as non-cement and are not shown here.
                  </div>
                )}

                {compact && result.results.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    Showing first 5 of {result.results.length} extracted cement items.
                  </div>
                )}
              </>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-emerald-100 bg-slate-50/50 p-6 text-center shadow-sm">
                <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px]" />
                <div className="relative z-10 space-y-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
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
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all"
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
