'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Zap,
  IndianRupee,
  Send,
  Edit3,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  BarChart3,
  Layers,
  Target,
  FileSearch,
  Info,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

// Types
interface BasicDetails {
  billNo: string;
  agreementNo: string;
  agreementDate: string | null;
  billDate: string | null;
  dateOfCompletion: string | null;
  contractorName: string;
  loaNo: string | null;
  loaDate: string | null;
  tenderAcceptingAuthority: string | null;
  dateOfCommencement: string | null;
  department: string | null;
  unit: string | null;
  nameOfWork: string;
  measurementNo: string | null;
  measurementDateFrom: string | null;
  measurementDateTo: string | null;
  rateInclusiveGST: string | null;
  tenderCallingAuthority: string | null;
  dateOfMeasurement: string;
}

interface ClassificationEntry {
  srNo: number;
  itemNumber: string;
  itemType: string;
  description: string;
  unit: string;
  baseRate: number;
  agreementRate: number;
  originalAgmtQty: number;
  currentAgmtQty: number;
  qtyUptoLastBill: number;
  qtySinceLastBill: number;
  qtyUptoDate: number;
  amountUptoLastBill: number;
  amountSinceLastBill: number;
  amountSinceLastBillIncSpCond: number;
  totalUptoDateAmount: number;
  schedule: string;
  scheduleFullName: string;
  groupName: string | null;
  chapterName: string | null;
  remarks: string | null;
  category: string;
  steelTypes: string[];
  subClassificationId: string;
  subClassification: any;
  suggestedGccCode: string | null;
  pvcClassification: string | null;
  pvcReason: string | null;
}

interface ScheduleSummaryItem {
  schedule: string;
  scheduleFullName: string;
  amtUptoLastBill: number;
  amtSinceLastBillIncSpCond: number;
  totalUptoDateAmt: number;
}

interface GroupSummaryItem {
  groupName: string;
  items: { itemNumber: string; schedule: string; amountSinceLastBill: number }[];
  totalSinceLastBill: number;
}

interface MatchedContract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  baseMonth: string;
  schedules: string[];
}

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  subClassifications: { id: string; code: string; name: string; groupId: string }[];
}

type Step = 'upload' | 'preview' | 'creating' | 'done';
type Tab = 'basic' | 'items' | 'groups' | 'schedule' | 'pvc';

const INR = (val: number) => {
  if (val === 0) return '\u20B90.00';
  return '\u20B9' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function QuickUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('basic');

  // Extracted data
  const [basicDetails, setBasicDetails] = useState<BasicDetails | null>(null);
  const [entries, setEntries] = useState<ClassificationEntry[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSummaryItem[]>([]);
  const [grandTotal, setGrandTotal] = useState({ amtUptoLastBill: 0, amtSinceLastBill: 0, totalUptoDate: 0 });
  const [rebatePercent, setRebatePercent] = useState(0);
  const [billAmountIncGST, setBillAmountIncGST] = useState(0);
  const [previousBillRef, setPreviousBillRef] = useState<{ billNo: string | null; totalAmt: number } | null>(null);
  const [groupSummary, setGroupSummary] = useState<GroupSummaryItem[]>([]);
  const [pvcSummary, setPvcSummary] = useState({ '9A': 0, '9B': 0, '9C': 0, '9D': 0 });
  const [matchedContract, setMatchedContract] = useState<MatchedContract | null>(null);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [confidence, setConfidence] = useState('');
  const [notes, setNotes] = useState('');

  // Editable
  const [billNo, setBillNo] = useState('');
  const [dateOfMeasurement, setDateOfMeasurement] = useState('');
  const [showInactiveItems, setShowInactiveItems] = useState(false);

  // Creating
  const [isCreating, setIsCreating] = useState(false);
  const [createdBillId, setCreatedBillId] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setExtractError('');
    } else {
      toast.error('Please select a PDF file');
    }
  };

  const extractTextFromPdf = async (pdfFile: File): Promise<string> => {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
      // Use CDN-hosted worker for browser compatibility
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const arrayBuffer = await pdfFile.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const doc = await pdfjsLib.getDocument({
        data, useWorkerFetch: false,
        useSystemFonts: true, disableFontFace: true,
      }).promise;
      let allText = '';
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        // Layout-preserving extraction: place each text item at its column position
        const items: { str: string; x: number; y: number }[] = [];
        for (const item of textContent.items) {
          const ti = item as any;
          if (!ti.str || ti.str.trim() === '') continue;
          const tx = ti.transform;
          if (!tx) continue;
          items.push({ str: ti.str, x: tx[4], y: viewport.height - tx[5] });
        }
        if (items.length === 0) continue;

        // Group into lines by y-coordinate (within 3pt = same line)
        items.sort((a, b) => a.y - b.y || a.x - b.x);
        const lineGroups: { str: string; x: number; y: number }[][] = [];
        let curLine: { str: string; x: number; y: number }[] = [items[0]];
        let curY = items[0].y;
        for (let j = 1; j < items.length; j++) {
          if (Math.abs(items[j].y - curY) > 3) {
            lineGroups.push(curLine);
            curLine = [items[j]];
            curY = items[j].y;
          } else {
            curLine.push(items[j]);
          }
        }
        lineGroups.push(curLine);

        const charWidth = (viewport.width || 595) / 180;
        let pageText = '';
        for (const lineItems of lineGroups) {
          lineItems.sort((a, b) => a.x - b.x);
          let line = '';
          for (const it of lineItems) {
            const col = Math.round(it.x / charWidth);
            while (line.length < col) line += ' ';
            line += it.str;
          }
          pageText += line + '\n';
        }
        allText += pageText;
      }
      return allText;
    } catch (err) {
      console.warn('Client PDF text extraction failed:', err);
      return '';
    }
  };

  const handleExtract = async () => {
    if (!file) return;
    setIsExtracting(true);
    setExtractError('');

    try {
      const pdfText = await extractTextFromPdf(file);
      const formData = new FormData();
      formData.append('file', file);
      if (pdfText && pdfText.trim().length > 100) {
        formData.append('pdfText', pdfText);
      }

      const response = await fetch('/api/bills/quick-extract', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Extraction failed');

      setBasicDetails(result.basicDetails);
      setEntries(result.classificationEntries || []);
      setScheduleSummary(result.scheduleSummary || []);
      setGrandTotal(result.grandTotal || { amtUptoLastBill: 0, amtSinceLastBill: 0, totalUptoDate: 0 });
      setRebatePercent(result.rebatePercent || 0);
      setBillAmountIncGST(result.billAmountIncGST || 0);
      setPreviousBillRef(result.previousBillRef || null);
      setGroupSummary(result.groupSummary || []);
      setPvcSummary(result.pvcSummary || { '9A': 0, '9B': 0, '9C': 0, '9D': 0 });
      setMatchedContract(result.matchedContract);
      setClassificationGroups(result.classificationGroups || []);
      setConfidence(result.confidence || 'medium');
      setNotes(result.notes || '');

      setBillNo(result.basicDetails?.billNo || '');
      setDateOfMeasurement(result.basicDetails?.dateOfMeasurement || '');

      setStep('preview');
      toast.success(`Bill analyzed! ${result.classificationEntries?.length || 0} items extracted`);
    } catch (err: any) {
      setExtractError(err.message || 'Failed to extract data');
      toast.error(err.message || 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  const updateEntryClassification = (index: number, subClassId: string) => {
    const newEntries = [...entries];
    let subClass: any = null;
    for (const group of classificationGroups) {
      const found = group.subClassifications.find(s => s.id === subClassId);
      if (found) { subClass = found; break; }
    }
    newEntries[index] = { ...newEntries[index], subClassificationId: subClassId, subClassification: subClass };
    setEntries(newEntries);
  };

  const handleCreateBill = async () => {
    if (!matchedContract) return toast.error('No contract matched. Please add this contract first.');
    if (!billNo.trim()) return toast.error('Bill number is required');
    if (!dateOfMeasurement) return toast.error('Date of measurement is required');

    const activeEntries = entries.filter(e => e.qtySinceLastBill > 0);
    if (activeEntries.length === 0) return toast.error('No items with qty > 0 found');

    const billAmount = activeEntries.reduce((sum, e) => sum + (e.amountSinceLastBillIncSpCond || e.amountSinceLastBill || 0), 0);

    setIsCreating(true);
    setStep('creating');

    try {
      let cementAmount = 0, steelTmtBarsAmount = 0, steelAngleChannelAmount = 0, steelPlatesAmount = 0, steelOtherSectionsAmount = 0;
      for (const entry of activeEntries) {
        const amt = entry.amountSinceLastBillIncSpCond || entry.amountSinceLastBill || 0;
        if (entry.category === 'cement') cementAmount += amt;
        if (entry.category === 'steel') {
          if (entry.steelTypes.includes('TMT')) steelTmtBarsAmount += amt;
          else if (entry.steelTypes.includes('ANGLE_CHANNEL')) steelAngleChannelAmount += amt;
          else if (entry.steelTypes.includes('PLATES')) steelPlatesAmount += amt;
          else if (entry.steelTypes.includes('OTHER_SECTIONS')) steelOtherSectionsAmount += amt;
          else steelTmtBarsAmount += amt;
        }
      }

      const body = {
        contractId: matchedContract.id,
        billNo: billNo.trim(),
        grossBillAmount: billAmount,
        billAmount,
        cementAmount,
        steelTmtBarsAmount,
        steelAngleChannelAmount,
        steelPlatesAmount,
        steelOtherSectionsAmount,
        dateOfMeasurement,
        classificationEntries: activeEntries.map(e => ({
          subClassificationId: e.subClassificationId || undefined,
          amount: e.amountSinceLastBillIncSpCond || e.amountSinceLastBill || 0,
          description: e.description || '',
          steelTypes: e.steelTypes || [],
          itemNumber: e.itemNumber || null,
          quantity: e.qtySinceLastBill || null,
          agreementRate: e.agreementRate || null,
        })),
        paymentConfirmed: true,
        paymentMethod: 'free',
      };

      const response = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create bill');

      setCreatedBillId(result.bill?.id || result.id);
      setStep('done');
      toast.success('Bill created with PVC calculation!');
    } catch (err: any) {
      setStep('preview');
      toast.error(err.message || 'Failed to create bill');
    } finally {
      setIsCreating(false);
    }
  };

  const activeItems = entries.filter(e => e.qtySinceLastBill > 0);
  const inactiveItems = entries.filter(e => e.qtySinceLastBill <= 0);
  const thisBillTotal = activeItems.reduce((sum, e) => sum + (e.amountSinceLastBillIncSpCond || e.amountSinceLastBill || 0), 0);

  // Group items by schedule for Task 2
  const itemsBySchedule: Record<string, ClassificationEntry[]> = {};
  for (const entry of entries) {
    const sched = entry.schedule || 'Unknown';
    if (!itemsBySchedule[sched]) itemsBySchedule[sched] = [];
    itemsBySchedule[sched].push(entry);
  }

  const tabConfig = [
    { id: 'basic' as Tab, label: 'Basic Details', icon: FileSearch, count: null },
    { id: 'items' as Tab, label: 'Item-wise', icon: ClipboardList, count: entries.length },
    { id: 'groups' as Tab, label: 'Group Summary', icon: Layers, count: groupSummary.length },
    { id: 'schedule' as Tab, label: 'Schedule Summary', icon: BarChart3, count: scheduleSummary.length },
    { id: 'pvc' as Tab, label: 'PVC Classification', icon: Target, count: activeItems.length },
  ];

  // ===== UPLOAD STEP =====
  if (step === 'upload') {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <div className="mb-6">
          <Link href="/bills" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Bills
          </Link>
        </div>
        <Card className="border-2 border-dashed border-blue-300 bg-blue-50/30">
          <CardHeader className="text-center">
            <div className="mx-auto p-4 bg-blue-100 rounded-full w-fit mb-3">
              <Zap className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Quick Upload & Analyze</CardTitle>
            <CardDescription className="text-base mt-2">
              Upload a signed bill PDF — AI will extract all details and produce a comprehensive 5-part analysis including item-wise breakdown, group summary, schedule summary, and PVC classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
              {file ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-blue-600" />
                  <p className="font-semibold text-blue-900">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  <Badge variant="outline" className="text-green-700 border-green-300">Ready to analyze</Badge>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-gray-400" />
                  <p className="font-medium text-gray-600">Click to upload signed bill PDF</p>
                  <p className="text-sm text-muted-foreground">IREPS-generated bill PDFs</p>
                </div>
              )}
            </div>
            {extractError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{extractError}</span>
              </div>
            )}
            <Button className="w-full h-14 text-lg" disabled={!file || isExtracting} onClick={handleExtract}>
              {isExtracting ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Analyzing bill PDF (this may take ~30s)...</>
              ) : (
                <><Zap className="h-5 w-5 mr-2" /> Extract & Analyze</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== CREATING STEP =====
  if (step === 'creating') {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <Card className="text-center py-12">
          <CardContent>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-blue-600 mb-4" />
            <p className="text-lg font-semibold">Creating Bill & Calculating PVC...</p>
            <p className="text-sm text-muted-foreground mt-2">This may take a few seconds</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== DONE STEP =====
  if (step === 'done') {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <Card className="text-center py-12 border-green-200 bg-green-50/30">
          <CardContent>
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-600 mb-4" />
            <p className="text-2xl font-bold text-green-800 mb-2">Bill Created Successfully!</p>
            <p className="text-muted-foreground mb-6">
              Bill <strong>{billNo}</strong> has been created with PVC calculation.
            </p>
            <div className="flex gap-3 justify-center">
              {createdBillId && (
                <Button onClick={() => router.push(`/bills/${createdBillId}`)}>View Bill Details</Button>
              )}
              <Button variant="outline" onClick={() => { setStep('upload'); setFile(null); setBasicDetails(null); }}>
                Upload Another Bill
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== PREVIEW STEP (Main Analysis View) =====
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setFile(null); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Upload Different PDF
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={confidence === 'high' ? 'default' : 'secondary'}>
            {confidence} confidence
          </Badge>
          {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
        </div>
      </div>

      {/* Contract Match Banner */}
      <Card className={`mb-4 ${matchedContract ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
        <CardContent className="pt-4 pb-4">
          {matchedContract ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Contract Matched: {matchedContract.agreementNo}</p>
                <p className="text-xs text-muted-foreground">{matchedContract.contractorName}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800">No Contract Found</p>
                <p className="text-sm text-red-700">Agreement: {basicDetails?.agreementNo}</p>
                <p className="text-xs text-muted-foreground">Add this contract first, then upload again.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
          <p className="text-xs text-muted-foreground">This Bill Amount</p>
          <p className="text-base font-bold text-blue-700">{INR(billAmountIncGST || thisBillTotal)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
          <p className="text-xs text-muted-foreground">Cumulative Total</p>
          <p className="text-base font-bold text-gray-700">{INR(grandTotal.totalUptoDate)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
          <p className="text-xs text-muted-foreground">Active Items</p>
          <p className="text-base font-bold text-green-700">{activeItems.length} / {entries.length}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-100">
          <p className="text-xs text-muted-foreground">Schedules</p>
          <p className="text-base font-bold text-purple-700">{scheduleSummary.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabConfig.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="mb-6">
        {/* ===== TASK 1: BASIC DETAILS ===== */}
        {activeTab === 'basic' && basicDetails && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSearch className="h-5 w-5 text-blue-600" /> Task 1: Basic Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {[
                  ['Bill No.', basicDetails.billNo],
                  ['Agreement No.', basicDetails.agreementNo],
                  ['Agreement Date', basicDetails.agreementDate],
                  ['Bill Date', basicDetails.billDate],
                  ['Date of Completion', basicDetails.dateOfCompletion],
                  ['Contractor Name', basicDetails.contractorName],
                  ['LOA No.', basicDetails.loaNo],
                  ['LOA Date', basicDetails.loaDate],
                  ['Tender Accepting Authority', basicDetails.tenderAcceptingAuthority],
                  ['Date of Commencement', basicDetails.dateOfCommencement],
                  ['Department', basicDetails.department],
                  ['Unit', basicDetails.unit],
                  ['Measurement No.', basicDetails.measurementNo],
                  ['Rate inclusive of GST', basicDetails.rateInclusiveGST],
                  ['Tender Calling Authority', basicDetails.tenderCallingAuthority],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} className="flex justify-between items-baseline border-b border-dashed pb-1">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
                  </div>
                ))}
              </div>
              {basicDetails.nameOfWork && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Name of Work</p>
                  <p className="text-sm">{basicDetails.nameOfWork}</p>
                </div>
              )}
              {/* Editable fields */}
              <div className="mt-6 pt-4 border-t">
                <p className="text-sm font-medium mb-3 flex items-center gap-1"><Edit3 className="h-4 w-4" /> Editable Fields (for bill creation)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="billNo" className="text-xs">Bill No.</Label>
                    <Input id="billNo" value={billNo} onChange={e => setBillNo(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dom" className="text-xs">Date of Measurement</Label>
                    <Input id="dom" type="date" value={dateOfMeasurement} onChange={e => setDateOfMeasurement(e.target.value)} className="h-9" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== TASK 2: ITEM-WISE BILL DETAILS ===== */}
        {activeTab === 'items' && (
          <div className="space-y-4">
            {Object.entries(itemsBySchedule).map(([schedule, items]) => (
              <Card key={schedule}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge variant="outline" className="text-blue-700 border-blue-300">{schedule}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {items[0]?.scheduleFullName?.substring(0, 100) || schedule}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-2 font-medium">Item No.</th>
                          <th className="text-left p-2 font-medium">Description</th>
                          <th className="text-center p-2 font-medium">Unit</th>
                          <th className="text-right p-2 font-medium">Agmt Rate</th>
                          <th className="text-right p-2 font-medium">Qty Last</th>
                          <th className="text-right p-2 font-medium">Qty Since</th>
                          <th className="text-right p-2 font-medium">Qty Total</th>
                          <th className="text-right p-2 font-medium">Amt Since (\u20B9)</th>
                          <th className="text-right p-2 font-medium">Total Amt (\u20B9)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const isActive = item.qtySinceLastBill > 0;
                          return (
                            <tr key={idx} className={`border-b ${isActive ? 'bg-green-50/50' : ''}`}>
                              <td className="p-2 font-mono text-blue-700 whitespace-nowrap">{item.itemNumber}</td>
                              <td className="p-2 max-w-[200px]">
                                <span className="line-clamp-2">{item.description?.substring(0, 100)}</span>
                                {item.groupName && (
                                  <span className="block text-[10px] text-muted-foreground mt-0.5 italic">{item.groupName?.substring(0, 60)}</span>
                                )}
                              </td>
                              <td className="p-2 text-center">{item.unit}</td>
                              <td className="p-2 text-right font-mono">{item.agreementRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right font-mono">{item.qtyUptoLastBill.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                              <td className={`p-2 text-right font-mono font-bold ${isActive ? 'text-green-700' : 'text-gray-400'}`}>
                                {item.qtySinceLastBill.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                              </td>
                              <td className="p-2 text-right font-mono">{item.qtyUptoDate.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                              <td className={`p-2 text-right font-mono ${isActive ? 'font-bold text-green-700' : 'text-gray-400'}`}>
                                {INR(item.amountSinceLastBillIncSpCond || item.amountSinceLastBill)}
                              </td>
                              <td className="p-2 text-right font-mono font-medium">{INR(item.totalUptoDateAmount)}</td>
                            </tr>
                          );
                        })}
                        {/* Schedule subtotal */}
                        <tr className="bg-gray-100 font-semibold">
                          <td colSpan={7} className="p-2 text-right">Schedule {schedule} Total:</td>
                          <td className="p-2 text-right font-mono">
                            {INR(items.reduce((s, i) => s + (i.amountSinceLastBillIncSpCond || i.amountSinceLastBill || 0), 0))}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {INR(items.reduce((s, i) => s + (i.totalUptoDateAmount || 0), 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ===== TASK 3: GROUP-WISE SUMMARY ===== */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            {groupSummary.map((group, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {group.groupName}
                  </CardTitle>
                  <CardDescription>
                    {group.items.length} items | Sub-total since last bill: <strong className="text-foreground">{INR(group.totalSinceLastBill)}</strong>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-2">Item No.</th>
                        <th className="text-center p-2">Schedule</th>
                        <th className="text-right p-2">Amt Since Last Bill (\u20B9)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 font-mono text-blue-700">{item.itemNumber}</td>
                          <td className="p-2 text-center"><Badge variant="outline" className="text-xs">{item.schedule}</Badge></td>
                          <td className={`p-2 text-right font-mono ${item.amountSinceLastBill > 0 ? 'font-bold text-green-700' : 'text-gray-400'}`}>
                            {INR(item.amountSinceLastBill)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-semibold">
                        <td colSpan={2} className="p-2 text-right">Sub-total:</td>
                        <td className="p-2 text-right font-mono">{INR(group.totalSinceLastBill)}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ===== TASK 4: SCHEDULE SUMMARY ===== */}
        {activeTab === 'schedule' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" /> Task 4: Schedule Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium">Schedule</th>
                      <th className="text-right p-3 font-medium">Amt Upto Last Bill (\u20B9)</th>
                      <th className="text-right p-3 font-medium">Amt Since Last Bill (\u20B9)</th>
                      <th className="text-right p-3 font-medium">Total Upto Date (\u20B9)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleSummary.map((ss, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-3">
                          <Badge variant="outline" className="mr-2">{ss.schedule}</Badge>
                          <span className="text-xs text-muted-foreground">{ss.scheduleFullName?.substring(0, 80)}</span>
                        </td>
                        <td className="p-3 text-right font-mono">{INR(ss.amtUptoLastBill)}</td>
                        <td className={`p-3 text-right font-mono ${ss.amtSinceLastBillIncSpCond > 0 ? 'font-bold text-green-700' : 'text-gray-400'}`}>
                          {INR(ss.amtSinceLastBillIncSpCond)}
                        </td>
                        <td className="p-3 text-right font-mono font-medium">{INR(ss.totalUptoDateAmt)}</td>
                      </tr>
                    ))}
                    {/* Grand Total */}
                    <tr className="bg-blue-50 font-bold">
                      <td className="p-3">Grand Total</td>
                      <td className="p-3 text-right font-mono">{INR(grandTotal.amtUptoLastBill)}</td>
                      <td className="p-3 text-right font-mono text-green-700">{INR(grandTotal.amtSinceLastBill)}</td>
                      <td className="p-3 text-right font-mono">{INR(grandTotal.totalUptoDate)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Additional info */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Rebate</p>
                  <p className="font-semibold">{rebatePercent}%</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Bill Amount (incl. GST)</p>
                  <p className="font-semibold text-green-700">{INR(billAmountIncGST)}</p>
                </div>
                {previousBillRef && previousBillRef.billNo && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Previous Bill</p>
                    <p className="font-semibold text-xs">{previousBillRef.billNo}</p>
                    <p className="text-sm">{INR(previousBillRef.totalAmt)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== TASK 5: PVC CLASSIFICATION ===== */}
        {activeTab === 'pvc' && (
          <div className="space-y-4">
            {/* PVC Summary Boxes */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { code: '9A', label: 'Labour', color: 'blue' },
                { code: '9B', label: 'Cement', color: 'orange' },
                { code: '9C', label: 'Steel', color: 'purple' },
                { code: '9D', label: 'P&M / Fuel', color: 'green' },
              ].map(pvc => (
                <div key={pvc.code} className={`p-3 rounded-lg border bg-${pvc.color}-50 border-${pvc.color}-200`}>
                  <p className="text-xs font-medium text-muted-foreground">{pvc.code} — {pvc.label}</p>
                  <p className={`text-base font-bold text-${pvc.color}-700`}>
                    {INR(pvcSummary[pvc.code as keyof typeof pvcSummary] || 0)}
                  </p>
                </div>
              ))}
            </div>

            {/* Active items with PVC + classification selector */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Items with Qty Since Last Bill &gt; 0</CardTitle>
                <CardDescription>Select GCC classification for each item before creating the bill</CardDescription>
              </CardHeader>
              <CardContent>
                {activeItems.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-orange-400" />
                    <p>No items with qty &gt; 0 found.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeItems.map((entry) => {
                      const realIndex = entries.indexOf(entry);
                      return (
                        <div key={realIndex} className="p-3 border rounded-lg bg-white">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm">
                                <span className="text-blue-700 font-mono mr-2">[{entry.itemNumber}]</span>
                                {entry.description?.substring(0, 120)}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                                <span>Qty: <strong className="text-foreground">{entry.qtySinceLastBill.toLocaleString('en-IN')}</strong> {entry.unit}</span>
                                <span>Rate: <strong className="text-foreground">\u20B9{entry.agreementRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                                <Badge variant="outline" className="text-xs">{entry.schedule}</Badge>
                              </div>
                            </div>
                            <div className="text-right ml-3">
                              <p className="font-bold text-sm text-green-700">
                                {INR(entry.amountSinceLastBillIncSpCond || entry.amountSinceLastBill)}
                              </p>
                            </div>
                          </div>
                          {/* PVC suggestion */}
                          {entry.pvcClassification && (
                            <div className="flex items-start gap-2 p-2 bg-yellow-50 rounded text-xs mb-2">
                              <Info className="h-3.5 w-3.5 mt-0.5 text-yellow-600 flex-shrink-0" />
                              <span><strong>AI Suggests: {entry.pvcClassification}</strong> — {entry.pvcReason}</span>
                            </div>
                          )}
                          {/* Classification selector */}
                          <Select
                            value={entry.subClassificationId || '_none_'}
                            onValueChange={(val) => updateEntryClassification(realIndex, val === '_none_' ? '' : val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select GCC classification" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">— Select Classification —</SelectItem>
                              {classificationGroups.map(g =>
                                g.subClassifications.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.code} - {s.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Inactive items collapsible */}
            {inactiveItems.length > 0 && (
              <Card className="border-gray-200">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowInactiveItems(!showInactiveItems)}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      Items with Qty = 0 (no PVC this bill)
                      <Badge variant="secondary">{inactiveItems.length}</Badge>
                    </CardTitle>
                    {showInactiveItems ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardHeader>
                {showInactiveItems && (
                  <CardContent>
                    <div className="space-y-1">
                      {inactiveItems.map((entry, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded text-xs">
                          <div className="flex-1">
                            <span className="text-blue-600 font-mono mr-1">[{entry.itemNumber}]</span>
                            {entry.description?.substring(0, 80)}
                          </div>
                          <div className="text-right ml-2 text-muted-foreground">
                            Total: {INR(entry.totalUptoDateAmount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      {notes && (
        <div className="mb-4 p-3 bg-yellow-50 rounded-lg text-xs text-yellow-800 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>📝 {notes}</span>
        </div>
      )}

      {/* Action Buttons - Always visible */}
      <div className="sticky bottom-0 bg-background pt-3 pb-4 border-t">
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (matchedContract && billNo && dateOfMeasurement) {
                router.push(`/bills/new?contractId=${matchedContract.id}`);
              } else {
                router.push('/bills/new');
              }
            }}
          >
            <Edit3 className="h-4 w-4 mr-2" /> Edit in Full Form
          </Button>
          <Button
            className="flex-1 h-12"
            disabled={!matchedContract || activeItems.length === 0 || isCreating}
            onClick={handleCreateBill}
          >
            <Send className="h-4 w-4 mr-2" /> Create Bill & Calculate PVC
          </Button>
        </div>
      </div>
    </div>
  );
}
