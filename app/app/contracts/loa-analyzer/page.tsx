
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Copy,
  Download,
  ArrowRight
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ClassificationSuggestion {
  code: string;
  name: string;
  mainClassification: string;
  mainName: string;
  confidence: number;
  reasoning: string;
  components: {
    fixed: number;
    labour: number;
    cement: number;
    steel: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
}

interface AnalysisResult {
  extractedText: string;
  suggestions: ClassificationSuggestion[];
  documentName: string;
  processingTime: number;
  contractDetails?: {
    agreementNo?: string;
    loaNo?: string;
    contractorName?: string;
    contractorAddress?: string;
    workDescription?: string;
    dateOfOpening?: string;
    completionDate?: string;
    maintenancePeriod?: string;
    railwayZone?: string;
    location?: string;
    contractValue?: string;
  };
}

export default function LOAAnalyzerPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a PDF or image file (JPG, PNG)');
        return;
      }
      
      // Validate file size (max 100MB)
      if (selectedFile.size > 100 * 1024 * 1024) {
        setError('File size must be less than 100MB');
        return;
      }
      
      setFile(selectedFile);
      setError('');
      setAnalysisResult(null);
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) return;

    setUploading(true);
    setAnalyzing(true);
    setProgress(0);
    setError('');

    try {
      // Step 1: Upload file (20%)
      setProgress(20);
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/contracts/analyze-loa', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to upload and extract text from file');
      }

      // Step 2: Extract text (50%)
      setProgress(50);
      const uploadData = await uploadResponse.json();

      if (!uploadData.extractedText) {
        throw new Error('No text was extracted from the document. Please check the file quality.');
      }

      // Step 3: Analyze with AI (80%)
      setProgress(80);
      const analysisResponse = await fetch('/api/contracts/analyze-loa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          extractedText: uploadData.extractedText,
          documentName: file.name 
        }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || 'Failed to analyze document with AI');
      }

      const analysisData = await analysisResponse.json();
      
      if (!analysisData.suggestions || analysisData.suggestions.length === 0) {
        throw new Error('No work classifications could be identified. Please ensure the document contains work descriptions.');
      }
      
      // Step 4: Complete (100%)
      setProgress(100);
      setAnalysisResult(analysisData);
      setSelectedSuggestions([]);

    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'An error occurred during analysis. Please try again or use a different document.');
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const toggleSuggestion = (code: string) => {
    setSelectedSuggestions(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-orange-600 bg-orange-50 border-orange-200';
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-purple-600" />
              LOA Document Analyzer
            </h1>
            <p className="text-gray-600 mt-2">
              Upload your Letter of Acceptance or Agreement to automatically extract work classifications using AI
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Document
            </CardTitle>
            <CardDescription>
              Upload LOA, Agreement, or Contract document (PDF or Image)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload */}
            <div className="space-y-4">
              <Label htmlFor="file-upload" className="text-sm font-medium">
                Select Document
              </Label>
              <div className="flex items-center gap-4">
                <label
                  htmlFor="file-upload"
                  className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-purple-500 hover:bg-purple-50/50 transition-colors"
                >
                  <FileText className="h-12 w-12 text-gray-400 mb-3" />
                  <span className="text-sm font-medium text-gray-700">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    PDF, JPG, PNG (max 100MB)
                  </span>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,image/jpeg,image/jpg,image/png"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {file && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-900 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-blue-600">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  {!uploading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFile(null)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Progress Bar */}
            {analyzing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {progress < 40 ? 'Uploading document...' :
                     progress < 70 ? 'Extracting text...' :
                     progress < 90 ? 'Analyzing with AI...' :
                     'Finalizing results...'}
                  </span>
                  <span className="font-medium text-purple-600">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Analyze Button */}
            <Button
              onClick={handleUploadAndAnalyze}
              disabled={!file || uploading}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Analyzing Document...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Analyze with AI
                </span>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card className={analysisResult ? 'border-2 border-purple-200 shadow-lg' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Analysis Results
            </CardTitle>
            <CardDescription>
              AI-extracted classifications and contract details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!analysisResult ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="h-10 w-10 text-gray-400" />
                </div>
                <p className="text-gray-500 text-sm">
                  Upload a document to see AI-powered analysis results
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Processing Info */}
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">
                      Analysis Complete
                    </span>
                  </div>
                  <span className="text-xs text-green-600">
                    {analysisResult.processingTime.toFixed(2)}s
                  </span>
                </div>

                {/* Contract Details Section */}
                {analysisResult.contractDetails && Object.keys(analysisResult.contractDetails).some(key => 
                  analysisResult.contractDetails?.[key as keyof typeof analysisResult.contractDetails]
                ) && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      Contract Details
                    </h3>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                      {analysisResult.contractDetails.agreementNo && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Agreement No:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.agreementNo}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.loaNo && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">LOA No:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.loaNo}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.contractorName && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Contractor:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.contractorName}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.contractorAddress && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Address:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.contractorAddress}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.railwayZone && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Railway Zone:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.railwayZone}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.location && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Location:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.location}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.workDescription && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Work Description:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.workDescription}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.dateOfOpening && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Opening Date:</span>
                          <span className="col-span-2 text-sm text-gray-900">
                            {new Date(analysisResult.contractDetails.dateOfOpening).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                      {analysisResult.contractDetails.completionDate && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Completion Date:</span>
                          <span className="col-span-2 text-sm text-gray-900">
                            {new Date(analysisResult.contractDetails.completionDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                      {analysisResult.contractDetails.maintenancePeriod && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Maintenance Period:</span>
                          <span className="col-span-2 text-sm text-gray-900">{analysisResult.contractDetails.maintenancePeriod}</span>
                        </div>
                      )}
                      {analysisResult.contractDetails.contractValue && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-xs font-semibold text-gray-600">Contract Value:</span>
                          <span className="col-span-2 text-sm font-semibold text-gray-900">{analysisResult.contractDetails.contractValue}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Suggestions Count */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Suggested Classifications
                  </h3>
                  <Badge variant="secondary">
                    {analysisResult.suggestions.length} found
                  </Badge>
                </div>

                {/* Suggestions List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {analysisResult.suggestions.map((suggestion) => (
                    <div
                      key={suggestion.code}
                      className={`
                        p-4 border-2 rounded-lg cursor-pointer transition-all
                        ${selectedSuggestions.includes(suggestion.code)
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                        }
                      `}
                      onClick={() => toggleSuggestion(suggestion.code)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-purple-600">
                              {suggestion.code}
                            </Badge>
                            <span className="font-semibold text-gray-900">
                              {suggestion.name}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            Main: {suggestion.mainClassification} - {suggestion.mainName}
                          </p>
                        </div>
                        <div className={`
                          px-3 py-1 rounded-full text-xs font-medium border
                          ${getConfidenceColor(suggestion.confidence)}
                        `}>
                          {(suggestion.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-700 mb-3">
                        {suggestion.reasoning}
                      </p>

                      {/* Component Breakdown */}
                      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-200">
                        {Object.entries(suggestion.components).map(([key, value]) => (
                          value > 0 && (
                            <div key={key} className="text-center">
                              <div className="text-xs text-gray-500 capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </div>
                              <div className="text-sm font-semibold text-purple-600">
                                {value}%
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setAnalysisResult(null);
                      setFile(null);
                      setSelectedSuggestions([]);
                    }}
                  >
                    Analyze Another
                  </Button>
                  <Button
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    disabled={selectedSuggestions.length === 0}
                    onClick={() => {
                      // Navigate to contract creation with pre-filled data
                      const selectedCodes = selectedSuggestions.join(',');
                      router.push(`/contracts/new?classifications=${selectedCodes}`);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      Create Contract
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extracted Text Tab */}
      {analysisResult && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Extracted Text
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="raw">Raw Text</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="space-y-4">
                <div className="prose max-w-none p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700">
                    {analysisResult.extractedText.substring(0, 2000)}
                    {analysisResult.extractedText.length > 2000 && '...'}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(analysisResult.extractedText)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Text
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="raw">
                <Textarea
                  value={analysisResult.extractedText}
                  readOnly
                  className="h-64 font-mono text-xs"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
