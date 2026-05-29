
'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Upload, 
  FileText, 
  Scan, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Loader2,
  Brain,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  ArrowRight,
  Shield
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getClientRoleInfo } from '@/lib/role-auth';

interface ClassificationMatch {
  classificationId: string;
  code: string;
  name: string;
  subclassificationId?: string;
  subCode?: string;
  subName?: string;
  confidence: 'high' | 'medium' | 'low';
  matchScore: number;
  reason: string;
  matchedKeywords: string[];
  componentPercentages: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
}

interface ExtractedItem {
  itemNo: string;
  description: string;
  unit?: string;
  quantity?: string;
  amount?: string;
  type: 'regular' | 'special';
}

interface ExtractionResult {
  workDescription: string;
  regularItems: ExtractedItem[];
  specialConditionItems: ExtractedItem[];
}

interface ClassificationResult {
  matches: ClassificationMatch[];
  suggestedMatch: ClassificationMatch;
  isDedicatedComponent?: boolean;
  dedicatedComponentType?: 'steel' | 'cement' | null;
  classificationStage?: {
    description: string;
    subclassificationStage: string | null;
  };
}

export default function ClassificationFinderPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Get user role information
  const { isAdmin } = getClientRoleInfo(session);

  // Access control: redirect non-admin users
  useEffect(() => {
    if (status === 'loading') return; // Wait for session to load
    
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (!isAdmin) {
      toast.error('Access denied. Only administrators can access Classification Finder.');
      router.push('/contracts');
    }
  }, [status, isAdmin, router]);

  // Stage 1: File and extraction
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Stage 2: Item selection and classification
  const [selectedItem, setSelectedItem] = useState<ExtractedItem | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-12 w-12 text-purple-600 animate-spin" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show access denied message for non-admin users
  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card className="border-2 border-red-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Shield className="h-6 w-6" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The Classification Finder feature is only available to administrators.
                Please contact your system administrator if you need access.
              </AlertDescription>
            </Alert>
            <div className="mt-4">
              <Button onClick={() => router.push('/contracts')}>
                Return to Contracts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
    setExtractionResult(null);
    setSelectedItem(null);
    setClassificationResult(null);
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

  // Stage 1: Extract items from PDF
  const handleExtractItems = async () => {
    if (!file) return;

    setIsExtracting(true);
    setError(null);
    setExtractionResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'extract');

      const response = await fetch('/api/bills/find-classifications', {
        method: 'POST',
        body: formData
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || 'Failed to extract items');
      }

      // Mark items with type
      const regularItems = (resultData.data.regularItems || []).map((item: any) => ({ ...item, type: 'regular' as const }));
      const specialItems = (resultData.data.specialConditionItems || []).map((item: any) => ({ ...item, type: 'special' as const }));

      setExtractionResult({
        workDescription: resultData.data.workDescription,
        regularItems: regularItems,
        specialConditionItems: specialItems
      });
      toast.success('Items extracted successfully!');
    } catch (err: any) {
      console.error('Extraction error:', err);
      setError(err.message || 'Failed to extract items');
      toast.error('Failed to extract items');
    } finally {
      setIsExtracting(false);
    }
  };

  // Stage 2: Classify selected item
  const handleClassifyItem = async (item: ExtractedItem) => {
    if (!file) return;

    setSelectedItem(item);
    setIsClassifying(true);
    setClassificationResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'classify');
      
      // Create a detailed item description
      const itemDescription = `Item No: ${item.itemNo}
Description: ${item.description}
${item.unit ? `Unit: ${item.unit}` : ''}
${item.quantity ? `Quantity: ${item.quantity}` : ''}
${item.amount ? `Amount: ${item.amount}` : ''}`;
      
      formData.append('selectedItem', itemDescription);

      const response = await fetch('/api/bills/find-classifications', {
        method: 'POST',
        body: formData
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || 'Failed to classify item');
      }

      setClassificationResult(resultData.data);
      toast.success('Classification found!');
    } catch (err: any) {
      console.error('Classification error:', err);
      setError(err.message || 'Failed to classify item');
      toast.error('Failed to classify item');
    } finally {
      setIsClassifying(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setExtractionResult(null);
    setSelectedItem(null);
    setClassificationResult(null);
    setError(null);
    setSearchTerm('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800 border-green-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const toggleExpanded = (matchId: string) => {
    setExpandedMatch(expandedMatch === matchId ? null : matchId);
  };

  const filteredMatches = classificationResult?.matches.filter(match => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      match.code.toLowerCase().includes(search) ||
      match.name.toLowerCase().includes(search) ||
      (match.subName && match.subName.toLowerCase().includes(search)) ||
      match.reason.toLowerCase().includes(search)
    );
  }) || [];

  const allItems = [
    ...(extractionResult?.regularItems || []),
    ...(extractionResult?.specialConditionItems || [])
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Brain className="h-8 w-8 text-purple-600" />
          AI Classification Finder
        </h1>
        <p className="text-gray-600">
          Upload a bill to extract items, then select items one by one to find their classifications using AI
        </p>
      </div>

      {/* Main Content */}
      <div className="grid gap-6">
        {/* Stage 1: Upload & Extract */}
        {!extractionResult && (
          <Card className={`border-2 ${isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-purple-600" />
                Step 1: Upload Bill Document
              </CardTitle>
              <CardDescription>
                Upload a bill copy PDF or image to extract all work items
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
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                  }`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 bg-purple-100 rounded-full">
                      <FileText className="h-8 w-8 text-purple-600" />
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
              {file && (
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
                      disabled={isExtracting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Extract Button */}
                  <Button
                    type="button"
                    onClick={handleExtractItems}
                    disabled={isExtracting}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extracting Items...
                      </>
                    ) : (
                      <>
                        <Scan className="h-4 w-4 mr-2" />
                        Extract Items
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
            </CardContent>
          </Card>
        )}

        {/* Stage 2: Item List & Selection */}
        {extractionResult && !classificationResult && (
          <Card className="border-2 border-green-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    Step 2: Select Item to Classify
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {allItems.length} items extracted. Click on an item to find its classification.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={handleClear} size="sm">
                  <X className="h-4 w-4 mr-2" />
                  Clear & Start Over
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Work Description */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  Work Description
                </h3>
                <p className="text-sm text-blue-800">
                  {extractionResult.workDescription}
                </p>
              </div>

              {/* Regular Items */}
              {extractionResult.regularItems.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Regular Items ({extractionResult.regularItems.length})
                  </h3>
                  <div className="space-y-2">
                    {extractionResult.regularItems.map((item, index) => (
                      <div
                        key={index}
                        className="p-3 bg-white rounded-lg border-2 border-gray-200 hover:border-purple-400 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                                {item.itemNo}
                              </Badge>
                              {item.unit && (
                                <span className="text-xs text-gray-500">({item.unit})</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-900">{item.description}</p>
                            {(item.quantity || item.amount) && (
                              <div className="flex gap-4 mt-1">
                                {item.quantity && (
                                  <span className="text-xs text-gray-600">Qty: {item.quantity}</span>
                                )}
                                {item.amount && (
                                  <span className="text-xs text-gray-600">Amount: {item.amount}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleClassifyItem(item)}
                            disabled={isClassifying}
                            className="shrink-0"
                          >
                            {isClassifying && selectedItem === item ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Brain className="h-4 w-4 mr-1" />
                                Classify
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Special Condition Items */}
              {extractionResult.specialConditionItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    Special Condition Items ({extractionResult.specialConditionItems.length})
                  </h3>
                  <div className="space-y-2">
                    {extractionResult.specialConditionItems.map((item, index) => (
                      <div
                        key={index}
                        className="p-3 bg-orange-50 rounded-lg border-2 border-orange-200 hover:border-orange-400 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                                {item.itemNo}
                              </Badge>
                              {item.unit && (
                                <span className="text-xs text-gray-500">({item.unit})</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-900">{item.description}</p>
                            {item.amount && (
                              <span className="text-xs text-orange-600 mt-1 block">
                                Special Condition Amount: {item.amount}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleClassifyItem(item)}
                            disabled={isClassifying}
                            className="shrink-0 bg-orange-600 hover:bg-orange-700"
                          >
                            {isClassifying && selectedItem === item ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Brain className="h-4 w-4 mr-1" />
                                Classify
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allItems.length === 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No items were extracted from the document. Please try a different document or check if it contains work items.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stage 3: Classification Results */}
        {classificationResult && selectedItem && (
          <div className="space-y-6">
            {/* Header */}
            <Card className="border-2 border-purple-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-purple-600" />
                    <h2 className="text-xl font-semibold text-purple-900">
                      Classification Found
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSelectedItem(null);
                        setClassificationResult(null);
                      }}
                      size="sm"
                    >
                      <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                      Back to Items
                    </Button>
                    <Button variant="outline" onClick={handleClear} size="sm">
                      <X className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  </div>
                </div>
                
                {/* Selected Item */}
                <div className={`p-4 rounded-lg border-2 mb-4 ${
                  selectedItem.type === 'special' 
                    ? 'bg-orange-50 border-orange-200' 
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <h3 className="text-sm font-semibold mb-2 text-gray-900">
                    Selected Item
                  </h3>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={
                      selectedItem.type === 'special' 
                        ? 'bg-orange-100 text-orange-700 border-orange-300'
                        : 'bg-blue-100 text-blue-700 border-blue-300'
                    }>
                      {selectedItem.itemNo}
                    </Badge>
                    {selectedItem.type === 'special' && (
                      <Badge variant="outline" className="bg-orange-200 text-orange-800 border-orange-400">
                        Special Condition
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-900">{selectedItem.description}</p>
                  {(selectedItem.quantity || selectedItem.amount) && (
                    <div className="flex gap-4 mt-2">
                      {selectedItem.quantity && (
                        <span className="text-xs text-gray-600">Qty: {selectedItem.quantity}</span>
                      )}
                      {selectedItem.amount && (
                        <span className="text-xs text-gray-600">Amount: {selectedItem.amount}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Classification Stage Logic */}
                {classificationResult.classificationStage && (
                  <div className={`p-4 rounded-lg border-2 mb-4 ${
                    classificationResult.isDedicatedComponent
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-blue-50 border-blue-300'
                  }`}>
                    <h3 className="text-sm font-semibold mb-2 text-gray-900 flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Classification Logic (Two-Stage Approach)
                    </h3>
                    
                    {classificationResult.isDedicatedComponent ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-amber-500 text-white">
                            Dedicated Component Detected
                          </Badge>
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                            {classificationResult.dedicatedComponentType === 'steel' ? '🔩 Steel (TMT Bars)' : '🏗️ Cement'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <strong>Stage 1 - Dedicated Component Detection:</strong><br />
                          {classificationResult.classificationStage.description}
                        </p>
                        <p className="text-xs text-amber-700 italic mt-2">
                          ℹ️ Dedicated components (Steel TMT / Cement) are classified directly without subclassification.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="mb-2">
                          <Badge className="bg-blue-500 text-white">
                            Regular Classification (Two-Stage)
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-semibold text-blue-900 mb-1">
                              Stage 1 - Main Classification:
                            </p>
                            <p className="text-xs text-gray-700 leading-relaxed pl-3 border-l-2 border-blue-300">
                              {classificationResult.classificationStage.description}
                            </p>
                          </div>
                          {classificationResult.classificationStage.subclassificationStage && (
                            <div>
                              <p className="text-xs font-semibold text-blue-900 mb-1 flex items-center gap-1">
                                <ArrowRight className="h-3 w-3" />
                                Stage 2 - Subclassification:
                              </p>
                              <p className="text-xs text-gray-700 leading-relaxed pl-3 border-l-2 border-blue-300">
                                {classificationResult.classificationStage.subclassificationStage}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Suggested Match */}
                <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-300">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      Best Match (Recommended)
                    </h3>
                    <Badge className={`${getConfidenceColor(classificationResult.suggestedMatch.confidence)} border`}>
                      {classificationResult.suggestedMatch.matchScore.toFixed(0)}% Match
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-purple-600 text-white">
                        {classificationResult.suggestedMatch.code}
                        {classificationResult.suggestedMatch.subCode && ` / ${classificationResult.suggestedMatch.subCode}`}
                      </Badge>
                      <span className="text-sm font-medium text-gray-900">
                        {classificationResult.suggestedMatch.name}
                      </span>
                    </div>
                    {classificationResult.suggestedMatch.subName && (
                      <p className="text-xs text-purple-700 pl-1">
                        → {classificationResult.suggestedMatch.subName}
                      </p>
                    )}
                    <p className="text-xs text-purple-600 italic mt-2">
                      {classificationResult.suggestedMatch.reason}
                    </p>
                    {classificationResult.suggestedMatch.matchedKeywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {classificationResult.suggestedMatch.matchedKeywords.map((keyword, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* All Matches */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-blue-600" />
                      All Matching Classifications ({filteredMatches.length})
                    </CardTitle>
                    <CardDescription>
                      Sorted by match confidence and relevance
                    </CardDescription>
                  </div>
                </div>
                
                {/* Search Filter */}
                <div className="mt-4">
                  <Label htmlFor="search" className="sr-only">Search classifications</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      type="text"
                      placeholder="Search by code, name, or description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredMatches.map((match, index) => {
                    const matchId = `${match.code}-${match.subCode || 'main'}-${index}`;
                    const isExpanded = expandedMatch === matchId;
                    const isSuggested = match.code === classificationResult.suggestedMatch.code && 
                                       match.subCode === classificationResult.suggestedMatch.subCode;

                    return (
                      <div 
                        key={matchId}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          isSuggested 
                            ? 'bg-purple-50 border-purple-300' 
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="default" className="bg-blue-600">
                                {match.code}
                                {match.subCode && ` / ${match.subCode}`}
                              </Badge>
                              <Badge className={`${getConfidenceColor(match.confidence)} border text-xs`}>
                                {match.matchScore.toFixed(0)}%
                              </Badge>
                              {isSuggested && (
                                <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-900">
                              {match.name}
                            </p>
                            {match.subName && (
                              <p className="text-xs text-gray-600 mt-1">
                                → {match.subName}
                              </p>
                            )}
                            <p className="text-xs text-gray-600 mt-2 italic">
                              {match.reason}
                            </p>
                            {match.matchedKeywords.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {match.matchedKeywords.slice(0, 5).map((keyword, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                                {match.matchedKeywords.length > 5 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{match.matchedKeywords.length - 5} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(matchId)}
                            className="ml-2"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase">
                              Component Breakdown
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(match.componentPercentages).map(([key, value]) => {
                                if (value === 0) return null;
                                const label = key
                                  .replace(/([A-Z])/g, ' $1')
                                  .replace(/^./, str => str.toUpperCase())
                                  .trim();
                                return (
                                  <div key={key} className="flex justify-between items-center text-xs">
                                    <span className="text-gray-600">{label}:</span>
                                    <span className="font-medium text-gray-900">{value}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredMatches.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No classifications found matching "{searchTerm}"</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
