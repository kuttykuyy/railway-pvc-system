
'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Scan, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Sparkles,
  FileUp,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DocumentScannerProps {
  documentType: 'contract' | 'bill';
  onDataExtracted: (data: any) => void;
  className?: string;
}

export function DocumentScanner({ documentType, onDataExtracted, className = '' }: DocumentScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMatchingClassifications, setIsMatchingClassifications] = useState(false);
  const [classificationMatches, setClassificationMatches] = useState<any>(null);
  const [classificationError, setClassificationError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;

    // Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Invalid file type. Please upload PDF or image files.');
      return;
    }

    // Validate file size (max 100MB)
    if (selectedFile.size > 100 * 1024 * 1024) {
      toast.error('File size too large. Maximum size is 100MB.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setScanResult(null);

    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleScan = async () => {
    if (!file) return;

    setIsScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);

      const response = await fetch('/api/scan-document', {
        method: 'POST',
        body: formData
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response from scan-document:', text.substring(0, 200));
        throw new Error('Server returned an unexpected response. Please try again.');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to scan document');
      }

      setScanResult(result.data);
      
      // Initialize all fields as selected by default
      const initialSelection: Record<string, boolean> = {};
      Object.keys(result.data).forEach(key => {
        if (key !== 'confidence' && key !== 'notes') {
          initialSelection[key] = true;
        }
      });
      setSelectedFields(initialSelection);
      
      toast.success('Document scanned successfully!');
      
      // Auto-match classifications if lineItems are available
      if (result.data.lineItems && Array.isArray(result.data.lineItems) && result.data.lineItems.length > 0) {
        await matchClassificationsForItems(result.data.lineItems);
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err.message || 'Failed to scan document');
      toast.error('Failed to scan document');
    } finally {
      setIsScanning(false);
    }
  };

  const matchClassificationsForItems = async (lineItems: any[]) => {
    setIsMatchingClassifications(true);
    setClassificationError(null);
    setClassificationMatches(null);

    try {
      const response = await fetch('/api/bills/extract-and-match-classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to match classifications');
      }

      setClassificationMatches(data);
      
      // Update scanResult with matched classifications
      setScanResult(prev => ({
        ...prev,
        classificationMatches: data.matches,
        classificationSummary: data.summary
      }));

      const summary = data.summary;
      const message = `Auto-matched ${summary.matchedItems}/${summary.totalItems} items. Very High: ${summary.veryHighConfidence}, High: ${summary.highConfidence}, Medium: ${summary.mediumConfidence}`;
      toast.success(message, { duration: 4000 });
    } catch (err: any) {
      console.error('Classification matching error:', err);
      setClassificationError(err.message || 'Failed to match classifications');
      toast.error('Classification matching failed - will use default matching');
    } finally {
      setIsMatchingClassifications(false);
    }
  };

  const handleToggleField = (fieldKey: string) => {
    setSelectedFields(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };

  const handleSelectAll = () => {
    const allSelected: Record<string, boolean> = {};
    Object.keys(scanResult || {}).forEach(key => {
      if (key !== 'confidence' && key !== 'notes') {
        allSelected[key] = true;
      }
    });
    setSelectedFields(allSelected);
  };

  const handleDeselectAll = () => {
    const allDeselected: Record<string, boolean> = {};
    Object.keys(scanResult || {}).forEach(key => {
      if (key !== 'confidence' && key !== 'notes') {
        allDeselected[key] = false;
      }
    });
    setSelectedFields(allDeselected);
  };

  const handleApplyData = () => {
    if (scanResult) {
      // For enhanced bill extraction with line items, send everything
      if (documentType === 'bill' && scanResult.lineItems?.length > 0) {
        onDataExtracted(scanResult);
        toast.success('Bill data with steel/non-steel breakdown applied!');
      } else {
        // Only apply selected fields (for contracts and fallback)
        const selectedData: any = {};
        Object.entries(scanResult).forEach(([key, value]) => {
          if (selectedFields[key]) {
            selectedData[key] = value;
          }
        });
        
        const selectedCount = Object.values(selectedFields).filter(Boolean).length;
        
        if (selectedCount === 0) {
          toast.error('Please select at least one field to apply');
          return;
        }
        
        onDataExtracted(selectedData);
        toast.success(`${selectedCount} field${selectedCount > 1 ? 's' : ''} applied to form!`);
      }
      
      // Reset the scanner
      setFile(null);
      setPreviewUrl(null);
      setScanResult(null);
      setSelectedFields({});
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreviewUrl(null);
    setScanResult(null);
    setSelectedFields({});
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className={`border-2 border-dashed ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'} ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          AI Document Scanner
        </CardTitle>
        <CardDescription>
          Upload a {documentType === 'contract' ? 'contract document' : 'bill document'} (PDF or image) to auto-extract data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload Area */}
        {!file && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-purple-100 rounded-full">
                <FileUp className="h-8 w-8 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Drag & drop your document here
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  or click to browse
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2"
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Supports: PDF, JPG, PNG, WEBP (Max 100MB)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>
        )}

        {/* File Preview */}
        {file && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {file.type === 'application/pdf' ? (
                <FileText className="h-8 w-8 text-red-500" />
              ) : (
                <ImageIcon className="h-8 w-8 text-blue-500" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={isScanning}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Image Preview */}
            {previewUrl && (
              <div className="relative w-full h-48 bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Scan Button */}
            {!scanResult && (
              <Button
                type="button"
                onClick={handleScan}
                disabled={isScanning}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning Document...
                  </>
                ) : (
                  <>
                    <Scan className="h-4 w-4 mr-2" />
                    Scan with AI
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Scan Results */}
        {scanResult && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  Data extracted successfully
                </span>
              </div>
              <Badge variant={
                scanResult.confidence === 'high' ? 'default' :
                scanResult.confidence === 'medium' ? 'secondary' : 'outline'
              }>
                {scanResult.confidence} confidence
              </Badge>
            </div>

            {/* Classification Matching Status */}
            {isMatchingClassifications && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-900 font-medium">
                  Auto-matching classifications to your bill items...
                </span>
              </div>
            )}

            {classificationError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{classificationError}</AlertDescription>
              </Alert>
            )}

            {/* Enhanced Bill Results with Steel/Non-Steel Breakdown */}
            {documentType === 'bill' && scanResult.lineItems?.length > 0 ? (
              <div className="space-y-3">
                {/* Header Info */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Bill Information</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {scanResult.billNo && (
                      <div><span className="text-gray-500">Bill No:</span> <span className="font-medium">{scanResult.billNo}</span></div>
                    )}
                    {scanResult.dateOfMeasurement && (
                      <div><span className="text-gray-500">Date:</span> <span className="font-medium">{scanResult.dateOfMeasurement}</span></div>
                    )}
                    {scanResult.grossBillAmount && (
                      <div className="col-span-2"><span className="text-gray-500">Gross Amount:</span> <span className="font-semibold text-blue-700">₹{Number(scanResult.grossBillAmount).toLocaleString('en-IN')}</span></div>
                    )}
                  </div>
                </div>

                {/* DSR Cement Summary (Chapter-based) */}
                {scanResult.dsrCementSummary?.totalAmount > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-green-800 uppercase tracking-wide flex items-center gap-1">
                        🧱 Cement Items (DSR Ch.4+5)
                      </p>
                      <span className="text-sm font-bold text-green-700">
                        ₹{Number(scanResult.dsrCementSummary.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {scanResult.dsrCementSummary.chapter4Amount > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Ch.4 Concrete Work</span>
                          <span className="font-medium">₹{Number(scanResult.dsrCementSummary.chapter4Amount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {scanResult.dsrCementSummary.chapter5CementAmount > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Ch.5 RCC (excl. 5.22)</span>
                          <span className="font-medium">₹{Number(scanResult.dsrCementSummary.chapter5CementAmount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-green-600 mt-1 border-t border-green-200 pt-1">
                      Auto-classified from DSR 2021 item numbers
                    </div>
                  </div>
                )}

                {/* DSR Steel Summary (Chapter-based) */}
                {scanResult.dsrSteelSummary?.totalAmount > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                        🔩 Steel Items (DSR 5.22+Ch.10)
                      </p>
                      <span className="text-sm font-bold text-amber-700">
                        ₹{Number(scanResult.dsrSteelSummary.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {scanResult.dsrSteelSummary.chapter5SteelAmount > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Item 5.22 TMT Bars</span>
                          <span className="font-medium">₹{Number(scanResult.dsrSteelSummary.chapter5SteelAmount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {scanResult.dsrSteelSummary.chapter10Amount > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Ch.10 Steel Work</span>
                          <span className="font-medium">₹{Number(scanResult.dsrSteelSummary.chapter10Amount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-amber-600 mt-1 border-t border-amber-200 pt-1">
                      Auto-classified from DSR 2021 item numbers
                    </div>
                  </div>
                )}

                {/* Steel Items Summary (Legacy/fallback) */}
                {!scanResult.dsrSteelSummary?.totalAmount && scanResult.steelSummary?.totalAmount > 0 && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide flex items-center gap-1">
                        🔩 Steel Items
                      </p>
                      <span className="text-sm font-bold text-orange-700">
                        ₹{Number(scanResult.steelSummary.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {scanResult.steelSummary.tmtBarsAmount > 0 && (
                        <div className="flex justify-between text-orange-700">
                          <span>TMT Bars / Rebar</span>
                          <span className="font-medium">₹{Number(scanResult.steelSummary.tmtBarsAmount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {scanResult.steelSummary.angleChannelAmount > 0 && (
                        <div className="flex justify-between text-orange-700">
                          <span>Angle / Channel</span>
                          <span className="font-medium">₹{Number(scanResult.steelSummary.angleChannelAmount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {scanResult.steelSummary.platesAmount > 0 && (
                        <div className="flex justify-between text-orange-700">
                          <span>Steel Plates</span>
                          <span className="font-medium">₹{Number(scanResult.steelSummary.platesAmount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {scanResult.steelSummary.otherSectionsAmount > 0 && (
                        <div className="flex justify-between text-orange-700">
                          <span>Other Steel</span>
                          <span className="font-medium">₹{Number(scanResult.steelSummary.otherSectionsAmount).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                    {scanResult.steelSummary.items?.length > 0 && (
                      <div className="text-[10px] text-orange-600 mt-1 border-t border-orange-200 pt-1">
                        {scanResult.steelSummary.items.slice(0, 5).join(' • ')}
                        {scanResult.steelSummary.items.length > 5 && ` ... +${scanResult.steelSummary.items.length - 5} more`}
                      </div>
                    )}
                  </div>
                )}

                {/* Non-Steel Items Summary */}
                {scanResult.nonSteelSummary?.totalAmount > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1">
                        🏗️ Non-Steel Items
                      </p>
                      <span className="text-sm font-bold text-blue-700">
                        ₹{Number(scanResult.nonSteelSummary.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {scanResult.nonSteelSummary.items?.length > 0 && (
                      <div className="text-[10px] text-blue-600">
                        {scanResult.nonSteelSummary.items.slice(0, 5).join(' • ')}
                        {scanResult.nonSteelSummary.items.length > 5 && ` ... +${scanResult.nonSteelSummary.items.length - 5} more`}
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-Matched Classifications (NEW) */}
                {classificationMatches && classificationMatches.matches?.length > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                        ✨ Auto-Matched Classifications ({classificationMatches.matches.length})
                      </p>
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="px-1.5 py-0.5 bg-green-200 text-green-800 rounded-full font-semibold">
                          {classificationMatches.summary.veryHighConfidence} VERY_HIGH
                        </span>
                        <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded-full font-semibold">
                          {classificationMatches.summary.highConfidence} HIGH
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {classificationMatches.matches.map((match: any, idx: number) => {
                        const confColor = 
                          match.confidence === 'VERY_HIGH' ? 'bg-green-100 border-green-300 text-green-900' :
                          match.confidence === 'HIGH' ? 'bg-blue-100 border-blue-300 text-blue-900' :
                          match.confidence === 'MEDIUM' ? 'bg-amber-100 border-amber-300 text-amber-900' :
                          'bg-gray-100 border-gray-300 text-gray-900';
                        
                        const confBadgeColor =
                          match.confidence === 'VERY_HIGH' ? 'bg-green-600 text-white' :
                          match.confidence === 'HIGH' ? 'bg-blue-600 text-white' :
                          match.confidence === 'MEDIUM' ? 'bg-amber-600 text-white' :
                          'bg-gray-600 text-white';
                        
                        return (
                          <div key={idx} className={`border rounded-lg p-2 space-y-1 ${confColor}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${confBadgeColor}`}>
                                  {match.confidence}
                                </span>
                                <span className="font-bold text-sm">{match.subClassificationCode}</span>
                                <span className="text-[11px] truncate">{match.description}</span>
                              </div>
                              <span className="font-semibold text-xs whitespace-nowrap ml-2">
                                ₹{Number(match.amount).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="text-[9px] text-gray-600 italic ml-1">
                              {match.reasoning}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Suggested Classifications */}
                {scanResult.suggestedClassifications?.length > 0 && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                      🏷️ Suggested GCC Classifications
                    </p>
                    <div className="space-y-1">
                      {scanResult.suggestedClassifications.map((cls: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-purple-100">
                          <div>
                            <span className="font-bold text-purple-700">{cls.gccCode}</span>
                            <span className="text-gray-600 ml-1">{cls.description}</span>
                            <span className="text-gray-400 ml-1">({cls.itemCount} items)</span>
                          </div>
                          <span className="font-semibold text-purple-700">₹{Number(cls.amount).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line Items Detail (collapsible) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium py-1">
                    View all {scanResult.lineItems.length} line items
                  </summary>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 p-2 bg-gray-50 rounded-lg">
                    {scanResult.lineItems.map((item: any, idx: number) => (
                      <div key={idx} className={`flex items-center justify-between p-1.5 rounded ${item.category === 'steel' ? 'bg-orange-50' : 'bg-white'}`}>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-500">{item.itemNo}</span>
                          <span className="ml-1 truncate">{item.description}</span>
                          {item.category === 'steel' && (
                            <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 text-orange-600 border-orange-300">
                              {item.steelType || 'Steel'}
                            </Badge>
                          )}
                        </div>
                        <span className="font-medium ml-2 whitespace-nowrap">₹{Number(item.amount || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </details>

                {/* Non-schedule items */}
                {scanResult.nonScheduleItems?.length > 0 && (
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs font-semibold text-yellow-800">Non-Schedule Items ({scanResult.nonScheduleItems.length})</p>
                    <div className="text-[10px] text-yellow-700 mt-1">
                      {scanResult.nonScheduleItems.map((ns: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{ns.description}</span>
                          <span>₹{Number(ns.amount || 0).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.notes && (
                  <div className="p-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">AI Notes:</span> {scanResult.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Generic field display for contracts and fallback */
              <div className="space-y-3">
                {/* Select/Deselect All Buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className="flex-1 text-xs"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="flex-1 text-xs"
                  >
                    Deselect All
                  </Button>
                </div>

                {/* Extracted Data Preview with Checkboxes */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-3 max-h-80 overflow-y-auto">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Select fields to apply:
                  </p>
                  <div className="space-y-2">
                    {Object.entries(scanResult).map(([key, value]) => {
                      if (key === 'confidence' || key === 'notes' || value === null || value === undefined) return null;
                      
                      // Format field name for display
                      const displayName = key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str) => str.toUpperCase())
                        .trim();
                      
                      // Format value for display
                      let displayValue: string;
                      if (Array.isArray(value)) {
                        if (value.length === 0) return null;
                        displayValue = value.length > 3 
                          ? `${value.slice(0, 3).join(', ')}... (${value.length} items)`
                          : value.join(', ');
                      } else if (typeof value === 'object') {
                        displayValue = JSON.stringify(value);
                      } else {
                        displayValue = String(value);
                      }
                      
                      return (
                        <div 
                          key={key} 
                          className="flex items-start gap-3 p-2 rounded-md hover:bg-white transition-colors"
                        >
                          <Checkbox
                            id={`field-${key}`}
                            checked={selectedFields[key] || false}
                            onCheckedChange={() => handleToggleField(key)}
                            className="mt-1"
                          />
                          <label
                            htmlFor={`field-${key}`}
                            className="flex-1 cursor-pointer text-xs"
                          >
                            <div className="font-medium text-gray-700 mb-0.5">
                              {displayName}
                            </div>
                            <div className="text-gray-600 break-words">
                              {displayValue}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  {scanResult.notes && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">AI Notes:</span> {scanResult.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Apply Button */}
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleApplyData}
                className="flex-1 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {documentType === 'bill' && scanResult.lineItems?.length > 0
                  ? 'Apply All Extracted Data'
                  : `Apply Selected (${Object.values(selectedFields).filter(Boolean).length})`
                }
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
