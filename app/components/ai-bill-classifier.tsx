
'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Loader2,
  Download,
  Copy,
  Brain
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { EnhancedBillExtraction } from '@/lib/enhanced-ai-classification';

interface AIBillClassifierProps {
  onClassificationComplete?: (data: EnhancedBillExtraction) => void;
  className?: string;
}

export function AIBillClassifier({ onClassificationComplete, className = '' }: AIBillClassifierProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    data: EnhancedBillExtraction;
    report: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
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
    setResult(null);
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

  const handleClassify = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ai/classify-bill', {
        method: 'POST',
        body: formData
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || 'Failed to classify bill');
      }

      setResult(resultData);
      toast.success('Bill classified successfully!');
      
      if (onClassificationComplete) {
        onClassificationComplete(resultData.data);
      }
    } catch (err: any) {
      console.error('Classification error:', err);
      setError(err.message || 'Failed to classify bill');
      toast.error('Failed to classify bill');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyReport = () => {
    if (result?.report) {
      navigator.clipboard.writeText(result.report);
      toast.success('Report copied to clipboard!');
    }
  };

  const handleDownloadReport = () => {
    if (result?.report) {
      const blob = new Blob([result.report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `classification-report-${result.data.billNo}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded!');
    }
  };

  return (
    <Card className={`border-2 ${isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300'} ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-purple-600" />
          AI Bill Classifier
        </CardTitle>
        <CardDescription>
          Upload a Railway bill to automatically extract items and suggest GCC classifications with AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload Area */}
        {!file && !result && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-purple-100 rounded-full">
                <Sparkles className="h-8 w-8 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Drag & drop your bill document here
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
        {file && !result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileText className="h-8 w-8 text-purple-500" />
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
                disabled={isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Classify Button */}
            <Button
              type="button"
              onClick={handleClassify}
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Classifying Bill with AI...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Classify with AI
                </>
              )}
            </Button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Classification Results */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  Classification complete
                </span>
              </div>
              {result.data.overallClassification && (
                <Badge variant={
                  result.data.overallClassification.confidence === 'high' ? 'default' :
                  result.data.overallClassification.confidence === 'medium' ? 'secondary' : 'outline'
                }>
                  {result.data.overallClassification.confidence} confidence
                </Badge>
              )}
            </div>

            {/* Classification Summary */}
            {result.data.overallClassification && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-purple-900">
                    Recommended Classification
                  </h3>
                  <Badge className="bg-purple-600">
                    {result.data.overallClassification.code}
                  </Badge>
                </div>
                <p className="text-xs text-purple-700">
                  {result.data.overallClassification.name}
                </p>
                <p className="text-xs text-purple-600 italic">
                  {result.data.overallClassification.reason}
                </p>
              </div>
            )}

            {/* Full Report */}
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700 uppercase">
                  Classification Report
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyReport}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDownloadReport}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-80 overflow-y-auto p-3 bg-white rounded border border-gray-200">
                {result.report}
              </pre>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
                className="flex-1"
              >
                Classify Another Bill
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
