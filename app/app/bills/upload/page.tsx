'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Upload, CheckCircle, Loader2, AlertCircle, ChevronRight, X, FileText, ArrowLeft, Eye, Edit2, Trash2, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

type Step = 'upload' | 'processing' | 'review' | 'creating';

interface LineItem {
  itemNo: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  chapter?: string;
}

interface ClassificationGroup {
  code: string;
  name: string;
  totalAmount: number;
  itemCount: number;
  items: string[];
  subClassificationId: string | null;
  subClassificationCode: string;
  subClassificationName: string;
  components: any;
}

interface SubClassOption {
  id: string;
  code: string;
  name: string;
}

interface ExtractedData {
  agreementNo: string;
  billNo: string;
  contractorName: string;
  workDescription: string;
  dateOfMeasurement: string;
  dateOfCommencement: string;
  grossBillAmount: number;
  lineItems: LineItem[];
  classificationGroups: ClassificationGroup[];
  availableSubClassifications: SubClassOption[];
  matchedContract: any;
  allContracts: any[];
  rmData: any;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 part from data URL
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BillUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [billFile, setBillFile] = useState<File | null>(null);
  const [rmFile, setRmFile] = useState<File | null>(null);
  const [progress, setProgress] = useState({ stage: '', percent: 0, detail: '' });
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [showContractPicker, setShowContractPicker] = useState(false);
  const billInputRef = useRef<HTMLInputElement>(null);
  const rmInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (type: 'bill' | 'rm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }
    if (type === 'bill') setBillFile(file);
    else setRmFile(file);
  };

  const handleDrop = (type: 'bill' | 'rm') => (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }
    if (type === 'bill') setBillFile(file);
    else setRmFile(file);
  };

  const callApi = async (body: any) => {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('auth-token='))?.split('=')?.[1];
    const res = await fetch('/api/ai/extract-bill-from-pdfs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || err.details || 'API request failed');
    }
    return res.json();
  };

  const startProcessing = async () => {
    if (!billFile) {
      toast.error('Please upload the Bill PDF');
      return;
    }

    setStep('processing');
    setError('');

    try {
      // Step 1: Convert Bill PDF to base64
      setProgress({ stage: 'Preparing Bill PDF...', percent: 5, detail: 'Reading PDF file' });
      const billBase64 = await fileToBase64(billFile);
      setProgress({ stage: 'Bill PDF ready', percent: 15, detail: `${(billFile.size / (1024 * 1024)).toFixed(1)} MB` });

      // Step 2: Optionally convert RM PDF to base64
      let rmData: any = {};
      if (rmFile) {
        setProgress({ stage: 'Preparing RM PDF...', percent: 20, detail: 'Reading measurement book' });
        const rmBase64 = await fileToBase64(rmFile);
        setProgress({ stage: 'RM PDF ready', percent: 25, detail: `${(rmFile.size / (1024 * 1024)).toFixed(1)} MB` });

        setProgress({ stage: 'AI is reading the Measurement Book PDF...', percent: 30, detail: 'Extracting measurement dates and details' });
        const rmResult = await callApi({ rmPdf: rmBase64, step: 'extract-rm' });
        rmData = rmResult.data || {};
        setProgress({ stage: 'Measurement data extracted', percent: 40, detail: `Date: ${rmData.dateOfMeasurement || 'Not found'}` });
      }

      // Step 3: Send bill PDF for AI extraction (directly as PDF, no image conversion)
      setProgress({ stage: 'AI is reading the Bill PDF...', percent: rmFile ? 45 : 25, detail: 'Extracting line items, amounts, and details' });
      const billResult = await callApi({ billPdf: billBase64, step: 'extract-bill' });
      const billData = billResult.data;
      setProgress({ stage: 'Bill data extracted', percent: rmFile ? 65 : 55, detail: `Found ${billData.lineItems?.length || 0} line items` });

      // Step 4: Classify line items
      setProgress({ stage: 'Classifying work items...', percent: rmFile ? 75 : 65, detail: 'Matching to GCC 46A classifications' });
      const classifyResult = await callApi({ lineItems: billData.lineItems || [], step: 'classify' });
      setProgress({ stage: 'Classifications suggested', percent: rmFile ? 85 : 80, detail: `${classifyResult.data?.groupedByClassification?.length || 0} classification groups` });

      // Step 5: Match contract
      const agreementNo = billData.agreementNo || rmData.agreementNo || '';
      setProgress({ stage: 'Matching contract...', percent: 90, detail: `Looking for agreement: ${agreementNo}` });
      const contractResult = await callApi({ agreementNo, step: 'match-contract' });

      // Compile all extracted data
      const compiled: ExtractedData = {
        agreementNo: billData.agreementNo || rmData.agreementNo || '',
        billNo: billData.billNo || '',
        contractorName: billData.contractorName || rmData.contractorName || '',
        workDescription: billData.workDescription || rmData.workDescription || '',
        dateOfMeasurement: rmData.dateOfMeasurement || billData.dateOfMeasurement || '',
        dateOfCommencement: billData.dateOfCommencement || '',
        grossBillAmount: billData.grossBillAmount || 0,
        lineItems: billData.lineItems || [],
        classificationGroups: classifyResult.data?.groupedByClassification || [],
        availableSubClassifications: classifyResult.data?.availableSubClassifications || [],
        matchedContract: contractResult.matchedContract,
        allContracts: contractResult.allContracts || [],
        rmData,
      };

      setExtractedData(compiled);
      if (contractResult.matchedContract) {
        setSelectedContractId(contractResult.matchedContract.id);
      }

      setProgress({ stage: 'Complete!', percent: 100, detail: 'Review the extracted data below' });
      setTimeout(() => setStep('review'), 800);

    } catch (err: any) {
      console.error('Processing error:', err);
      setError(err.message || 'Failed to process PDFs');
      setStep('upload');
      toast.error('Failed to process PDFs. Please try again.');
    }
  };

  const handleCreateBill = async () => {
    if (!extractedData || !selectedContractId) {
      toast.error('Please select a contract');
      return;
    }

    setStep('creating');

    try {
      // Build classification entries from groups
      const classificationEntries = extractedData.classificationGroups
        .filter(g => g.subClassificationId && g.totalAmount > 0)
        .map(g => ({
          subClassificationId: g.subClassificationId,
          amount: g.totalAmount,
          description: g.items?.join('; ') || g.name,
          steelTypes: [],
        }));

      // If no valid classification entries, create a single entry with the total
      if (classificationEntries.length === 0 && extractedData.lineItems.length > 0) {
        const totalAmount = extractedData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
        // Use first available sub classification
        const defaultSub = extractedData.availableSubClassifications[0];
        if (defaultSub) {
          classificationEntries.push({
            subClassificationId: defaultSub.id,
            amount: totalAmount,
            description: extractedData.workDescription || 'AI-extracted bill items',
            steelTypes: [],
          });
        }
      }

      const grossAmount = extractedData.grossBillAmount || 
        extractedData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

      // Parse date
      let dateOfMeasurement = extractedData.dateOfMeasurement;
      // Try to normalize date format
      if (dateOfMeasurement && !/^\d{4}-\d{2}-\d{2}/.test(dateOfMeasurement)) {
        // Try DD/MM/YYYY or DD-MM-YYYY format
        const parts = dateOfMeasurement.split(/[\/\-]/);
        if (parts.length === 3) {
          const [d, m, y] = parts;
          if (parseInt(y) > 1900) {
            dateOfMeasurement = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        }
      }

      const token = document.cookie.split(';').find(c => c.trim().startsWith('auth-token='))?.split('=')?.[1];
      
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          contractId: selectedContractId,
          billNo: extractedData.billNo,
          grossBillAmount: grossAmount,
          billAmount: grossAmount,
          dateOfMeasurement,
          classificationEntries,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to create bill' }));
        throw new Error(errData.error || errData.message || 'Failed to create bill');
      }

      const result = await res.json();
      toast.success('Bill created successfully!');
      router.push(`/bills/${result.id || result.bill?.id || ''}`);

    } catch (err: any) {
      console.error('Bill creation error:', err);
      toast.error(err.message || 'Failed to create bill');
      setStep('review');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const parseDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // If already in YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
    // Try DD/MM/YYYY
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3 && parseInt(parts[2]) > 1900) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button onClick={() => router.push('/bills')} className="flex items-center text-gray-500 hover:text-gray-700 mb-2 text-sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Bills
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Upload Bill PDF</h1>
          <p className="text-gray-500 mt-1">Upload your Bill PDF. AI will extract the data and create the bill automatically. You can optionally add an RM PDF for measurement details.</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center mb-8">
          {['Upload PDF', 'AI Processing', 'Review & Create'].map((label, i) => {
            const stepIndex = ['upload', 'processing', 'review', 'creating'].indexOf(step);
            const isActive = i <= (step === 'creating' ? 2 : stepIndex);
            const isCurrent = i === (step === 'creating' ? 2 : stepIndex);
            return (
              <div key={label} className="flex items-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isCurrent ? 'bg-blue-600 text-white shadow-md' :
                  isActive ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 border-current">
                    {isActive && !isCurrent ? '✓' : i + 1}
                  </span>
                  {label}
                </div>
                {i < 2 && <ChevronRight className="w-5 h-5 text-gray-300 mx-2" />}
              </div>
            );
          })}
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-700 font-medium">Processing Failed</p>
                  <p className="text-red-600 text-sm mt-1">{error}</p>
                </div>
              </div>
            )}

            <div className="max-w-lg mx-auto">
              {/* Bill PDF Upload */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 ${
                  billFile ? 'border-green-400 bg-green-50/50' : 'border-gray-300 bg-white'
                }`}
                onClick={() => billInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop('bill')}
              >
                <input ref={billInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect('bill')} />
                {billFile ? (
                  <div className="space-y-3">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                    <p className="font-semibold text-green-700">{billFile.name}</p>
                    <p className="text-sm text-green-600">{(billFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setBillFile(null); }}
                      className="text-sm text-red-500 hover:text-red-700 underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <FileText className="w-12 h-12 text-blue-400 mx-auto" />
                    <div>
                      <p className="font-semibold text-gray-700">Bill PDF</p>
                      <p className="text-sm text-gray-500 mt-1">The running account bill document</p>
                    </div>
                    <p className="text-xs text-gray-400">Click or drag & drop</p>
                  </div>
                )}
              </div>
            </div>

            {/* Optional RM PDF Upload */}
            <div className="max-w-lg mx-auto">
              <details className="group">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <Plus className="w-4 h-4 group-open:rotate-45 transition-transform" />
                  <span>Add Running Measurement (RM) PDF (optional)</span>
                </summary>
                <div className="mt-3">
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 ${
                      rmFile ? 'border-green-400 bg-green-50/50' : 'border-gray-300 bg-white'
                    }`}
                    onClick={() => rmInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop('rm')}
                  >
                    <input ref={rmInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect('rm')} />
                    {rmFile ? (
                      <div className="space-y-2">
                        <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                        <p className="font-semibold text-green-700">{rmFile.name}</p>
                        <p className="text-sm text-green-600">{(rmFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); setRmFile(null); }}
                          className="text-sm text-red-500 hover:text-red-700 underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <FileText className="w-10 h-10 text-orange-400 mx-auto" />
                        <p className="font-medium text-gray-600">RM / Measurement Book PDF</p>
                        <p className="text-xs text-gray-400">Click or drag & drop</p>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>

            <div className="flex justify-center">
              <button
                onClick={startProcessing}
                disabled={!billFile}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md"
              >
                <Upload className="w-5 h-5" />
                Process with AI
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">💡 How it works</h3>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Upload your Bill PDF (RM PDF is optional)</li>
                <li>AI reads the PDF directly and extracts item details, amounts, and dates</li>
                <li>Work items are automatically classified under GCC 46A codes</li>
                <li>Review the extracted data, make any corrections, and create the bill</li>
              </ol>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {step === 'processing' && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-8 text-center space-y-6">
              <Loader2 className="w-16 h-16 text-blue-500 mx-auto animate-spin" />
              <div>
                <h2 className="text-xl font-bold text-gray-900">{progress.stage}</h2>
                <p className="text-gray-500 mt-1">{progress.detail}</p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-sm text-gray-400">{progress.percent}% complete</p>
              <p className="text-xs text-gray-400">This typically takes 1-2 minutes for large documents</p>
            </div>
          </div>
        )}

        {/* Review Step */}
        {step === 'review' && extractedData && (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Extracted Bill Information
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <InfoField label="Agreement No" value={extractedData.agreementNo} />
                <InfoField label="Bill No" value={extractedData.billNo} />
                <InfoField label="Contractor" value={extractedData.contractorName} />
                <InfoField label="Date of Measurement" value={extractedData.dateOfMeasurement} />
                <div className="md:col-span-2">
                  <InfoField label="Work Description" value={extractedData.workDescription} />
                </div>
                <InfoField label="Gross Bill Amount" value={formatCurrency(extractedData.grossBillAmount)} highlight />
              </div>
            </div>

            {/* Contract Selection */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-600" />
                Contract Match
              </h2>
              {extractedData.matchedContract ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-800">Contract Found!</span>
                  </div>
                  <p className="text-sm text-green-700">
                    <strong>{extractedData.matchedContract.agreementNo}</strong> — {extractedData.matchedContract.contractorName}
                  </p>
                  <p className="text-xs text-green-600 mt-1">{extractedData.matchedContract.workDescription}</p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <span className="font-semibold text-yellow-800">No exact contract match found</span>
                  </div>
                  <p className="text-sm text-yellow-700 mb-3">Please select the correct contract below:</p>
                </div>
              )}

              {(extractedData.allContracts.length > 0 || !extractedData.matchedContract) && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Contract</label>
                  <select
                    value={selectedContractId}
                    onChange={(e) => setSelectedContractId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Select a contract --</option>
                    {extractedData.allContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.agreementNo} — {c.contractorName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                📋 Extracted Line Items ({extractedData.lineItems.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">Item</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Description</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Unit</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Qty</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Rate</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.lineItems.map((item, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{item.itemNo}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={item.description}>{item.description}</td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2 text-right">{item.quantity?.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right">{item.rate?.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-gray-50 font-bold">
                      <td colSpan={5} className="px-3 py-2 text-right">Total:</td>
                      <td className="px-3 py-2 text-right text-blue-700">
                        {formatCurrency(extractedData.lineItems.reduce((s, i) => s + (i.amount || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Classification Groups */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                🏷️ GCC Classification Groups
              </h2>
              <p className="text-sm text-gray-500 mb-4">These groups will be used as classification entries for PVC calculation.</p>
              <div className="space-y-4">
                {extractedData.classificationGroups.map((group, idx) => (
                  <div key={idx} className={`border rounded-lg p-4 ${
                    group.subClassificationId ? 'border-green-200 bg-green-50/30' : 'border-yellow-200 bg-yellow-50/30'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono font-bold">
                            {group.subClassificationCode || group.code}
                          </span>
                          <span className="font-medium text-gray-900">{group.subClassificationName || group.name}</span>
                          {group.subClassificationId ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{group.itemCount} items — {group.items?.slice(0, 2).join(', ')}{(group.items?.length || 0) > 2 ? '...' : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{formatCurrency(group.totalAmount)}</p>
                      </div>
                    </div>
                    {!group.subClassificationId && (
                      <div className="mt-3">
                        <label className="text-xs font-medium text-yellow-700 mb-1 block">Select matching classification:</label>
                        <select
                          className="w-full border border-yellow-300 rounded px-3 py-1.5 text-sm"
                          value={group.subClassificationId || ''}
                          onChange={(e) => {
                            const newGroups = [...extractedData.classificationGroups];
                            const selected = extractedData.availableSubClassifications.find(s => s.id === e.target.value);
                            newGroups[idx] = {
                              ...newGroups[idx],
                              subClassificationId: e.target.value,
                              subClassificationCode: selected?.code || group.code,
                              subClassificationName: selected?.name || group.name,
                            };
                            setExtractedData({ ...extractedData, classificationGroups: newGroups });
                          }}
                        >
                          <option value="">-- Select --</option>
                          {extractedData.availableSubClassifications.map(s => (
                            <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center bg-white rounded-xl shadow-sm border p-6">
              <button
                onClick={() => { setStep('upload'); setExtractedData(null); }}
                className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Start Over
              </button>
              <button
                onClick={handleCreateBill}
                disabled={!selectedContractId}
                className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md"
              >
                <CheckCircle className="w-5 h-5" />
                Create Bill
              </button>
            </div>
          </div>
        )}

        {/* Creating Step */}
        {step === 'creating' && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 text-green-500 mx-auto animate-spin" />
              <h2 className="text-xl font-bold text-gray-900">Creating Bill...</h2>
              <p className="text-gray-500">Submitting extracted data and calculating PVC</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 ${highlight ? 'text-lg font-bold text-blue-700' : 'text-gray-900 font-medium'}`}>
        {value || <span className="text-gray-400 italic">Not found</span>}
      </p>
    </div>
  );
}
