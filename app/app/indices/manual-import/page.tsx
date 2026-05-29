

'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientRoleInfo } from '@/lib/role-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Download, Calendar, TrendingUp, Save, FileSpreadsheet, FileUp } from 'lucide-react';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { useRouter } from 'next/navigation';

interface PriceIndex {
  id: string;
  name: string;
  baseValue: number;
  description?: string;
}

interface ManualIndexEntry {
  priceIndexId: string;
  month: string;
  value: string;
}

export default function ManualImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [priceIndices, setPriceIndices] = useState<PriceIndex[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if user is admin
  const { isAdmin } = getClientRoleInfo(session);

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    if (!isAdmin) {
      router.push('/contracts');
      return;
    }
  }, [session, status, isAdmin, router]);
  
  const [manualEntries, setManualEntries] = useState<ManualIndexEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [uploadMode, setUploadMode] = useState<'manual' | 'file'>('manual');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPriceIndices();
  }, []);

  const fetchPriceIndices = async () => {
    try {
      const response = await fetch('/api/indices');
      if (!response.ok) throw new Error('Failed to fetch price indices');
      
      const data = await response.json();
      setPriceIndices(data);
      
      // Initialize manual entries with all indices
      const entries = data.map((index: PriceIndex) => ({
        priceIndexId: index.id,
        month: '',
        value: ''
      }));
      setManualEntries(entries);
    } catch (error: any) {
      console.error('Error fetching price indices:', error);
      setError(error.message || 'Failed to fetch price indices');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    // Update all entries with the selected month
    setManualEntries(prev => prev.map(entry => ({
      ...entry,
      month
    })));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const processUploadedFile = async () => {
    if (!uploadedFile) return;
    
    setIsUploading(true);
    setError('');
    setSuccess('');
    
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      if (uploadedFile.name.toLowerCase().endsWith('.csv') && selectedMonth) {
        formData.append('month', selectedMonth);
      }

      const response = await fetch('/api/indices/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process file');
      }

      const result = await response.json();
      setSuccess(`Successfully imported ${result.imported} indices for ${result.monthsProcessed || 1} month(s)`);
      setUploadedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error: any) {
      console.error('Error processing file:', error);
      setError(error.message || 'Failed to process uploaded file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleValueChange = (priceIndexId: string, value: string) => {
    setManualEntries(prev => prev.map(entry => 
      entry.priceIndexId === priceIndexId 
        ? { ...entry, value }
        : entry
    ));
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      // Filter out empty values
      const validEntries = manualEntries.filter(entry => 
        entry.month && entry.value && parseFloat(entry.value) > 0
      );

      if (validEntries.length === 0) {
        throw new Error('Please enter at least one valid index value');
      }

      // Convert to the format expected by API
      const monthlyData = validEntries.map(entry => ({
        priceIndexId: entry.priceIndexId,
        month: entry.month,
        value: parseFloat(entry.value)
      }));

      const response = await fetch('/api/indices/monthly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ monthlyData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save manual indices');
      }

      const result = await response.json();
      setSuccess(`Successfully saved ${result.count} manual index values`);
      
      // Reset form
      setManualEntries(prev => prev.map(entry => ({
        ...entry,
        value: ''
      })));
      
      // Redirect back to indices page after 2 seconds
      setTimeout(() => {
        router.push('/indices?success=Manual indices imported successfully');
      }, 2000);
    } catch (error: any) {
      console.error('Error saving manual indices:', error);
      setError(error.message || 'Failed to save manual indices');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadTemplate = () => {
    // Create Excel-style template with months in first column and indices as headers
    const excelHeaders = ['Month', 'Labour', 'MPNG Fuel', 'RBI Cement', 'RBI Explosives', 'RBI Other Materials', 'RBI Plant Machinery', 'Steel Angle/Channel', 'Steel Other Sections', 'Steel Plates', 'Steel TMT Bars'];
    
    const csvContent = [
      excelHeaders,
      ['Aug-22', '', '', '', '', '', '', '', '', '', ''], // Example row
      ['Sep-22', '', '', '', '', '', '', '', '', '', ''], // Example row
      ['Oct-22', '', '', '', '', '', '', '', '', '', ''], // Example row
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'price_indices_excel_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading price indices..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/indices" label="Back to Price Indices" variant="outline" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Save className="h-8 w-8 text-blue-600" />
              Manual Indices Entry
            </h1>
            <p className="text-gray-600 mt-2">
              Manually enter price index values for a specific month
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/indices/manage">
            <TrendingUp className="h-4 w-4 mr-2" />
            View & Edit Manual Indices
          </Link>
        </Button>
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Manual Entry or File Upload Form */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>
                {uploadMode === 'manual' ? 'Manual Index Entry' : 'File Import'}
              </CardTitle>
              <CardDescription>
                {uploadMode === 'manual' 
                  ? 'Enter price index values manually for calculation purposes'
                  : 'Upload a CSV or Excel file with price index data'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mode Toggle */}
              <div className="mb-6 flex gap-2 p-1 bg-gray-100 rounded-lg">
                <Button
                  type="button"
                  variant={uploadMode === 'manual' ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setUploadMode('manual')}
                >
                  Manual Entry
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === 'file' ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setUploadMode('file')}
                >
                  <FileUp className="h-4 w-4 mr-2" />
                  File Upload
                </Button>
              </div>

              {error && (
                <StatusMessage type="error" title="Error" message={error} />
              )}
              
              {success && (
                <StatusMessage type="success" title="Success" message={success} />
              )}

              {/* Month Selection - Only for manual mode and CSV files */}
              {(uploadMode === 'manual' || (uploadMode === 'file' && uploadedFile?.name.toLowerCase().endsWith('.csv'))) && (
                <div className="space-y-2 mb-6">
                  <Label htmlFor="month" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Month for Index Values *
                  </Label>
                  <Input
                    id="month"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    required
                  />
                  <p className="text-sm text-gray-600">
                    {uploadMode === 'manual' 
                      ? 'Select the month for which you are entering index values'
                      : 'Select the month for CSV import (Excel files contain month data)'}
                  </p>
                </div>
              )}

              {uploadMode === 'file' ? (
                /* File Upload Mode */
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="file" className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        Upload File
                      </Label>
                      <Input
                        ref={fileInputRef}
                        id="file"
                        type="file"
                        accept=".csv,.xls,.xlsx"
                        onChange={handleFileUpload}
                        className="cursor-pointer"
                      />
                      <p className="text-sm text-gray-600">
                        <strong>Excel Format:</strong> Month in first column (Aug-22 format), index values in subsequent columns<br/>
                        <strong>CSV Format:</strong> Index Name, Current Value, Month columns
                      </p>
                    </div>
                    
                    {uploadedFile && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-800">
                            {uploadedFile.name}
                          </span>
                          <span className="text-sm text-green-600">
                            ({(uploadedFile.size / 1024).toFixed(2)} KB)
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-end space-x-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={isUploading}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={processUploadedFile}
                        disabled={isUploading || !uploadedFile || (uploadedFile?.name.toLowerCase().endsWith('.csv') && !selectedMonth)}
                        className="bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
                      >
                        {isUploading ? (
                          <LoadingSpinner size="sm" text="Processing..." />
                        ) : (
                          <>
                            <FileUp className="h-4 w-4 mr-2" />
                            Import from File
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Manual Entry Mode */
                <form onSubmit={handleSubmit} className="space-y-6">

                {/* Index Values Grid */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Price Index Values</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {priceIndices.map((index) => {
                      const entry = manualEntries.find(e => e.priceIndexId === index.id);
                      return (
                        <div key={index.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              {index.name}
                            </Label>
                            <p className="text-xs text-gray-600">
                              Base: {index.baseValue}
                            </p>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Enter current value"
                              value={entry?.value || ''}
                              onChange={(e) => handleValueChange(index.id, e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving || !selectedMonth}
                    className="bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
                  >
                    {isSaving ? (
                      <LoadingSpinner size="sm" text="Saving..." />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Manual Indices
                      </>
                    )}
                  </Button>
                </div>
              </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Panel */}
        <div className="space-y-6">
          {/* Template Download */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="h-5 w-5" />
                Download Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={downloadTemplate} variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Excel-format Template
              </Button>
              <p className="text-sm text-gray-600 mt-2">
                Download a CSV template matching your Excel file format (Month, Index columns)
              </p>
            </CardContent>
          </Card>

          {/* Import Guidelines */}
          <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-green-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Import Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Excel File Format:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Month in first column (Aug-22 format)</li>
                    <li>• Each row represents one month</li>
                    <li>• Index values in subsequent columns</li>
                    <li>• Matches your uploaded file structure</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-semibold text-sm mb-2">Manual Entry:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Enter values for specific month</li>
                    <li>• All values should be positive numbers</li>
                    <li>• Used for PVC calculations</li>
                  </ul>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Imported data will update existing values for matching months
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Index Requirements */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Classification 7A Indices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Labour (50%)</span>
                  <span className="font-medium">Required</span>
                </div>
                <div className="flex justify-between">
                  <span>Plant Machinery (15%)</span>
                  <span className="font-medium">Required</span>
                </div>
                <div className="flex justify-between">
                  <span>Fuel & Lubricants (15%)</span>
                  <span className="font-medium">Required</span>
                </div>
                <div className="flex justify-between">
                  <span>Other Materials (5%)</span>
                  <span className="font-medium">Required</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
