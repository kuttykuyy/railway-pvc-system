
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, Download, FileText, Calendar, ArrowLeft } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

interface CoveringLetterFormData {
  // TO Section
  toDesignation: string;
  toOrganization: string;
  toDivision: string;
  
  // Subject
  workDescription: string;
  
  // Reference
  loaNumber: string;
  loaDate: string;
  agreementNumber: string;
  
  // Bill details
  billNumber: string;
  billAmount: string;
  
  // Additional
  date: string;
  bodyText: string;
}

interface Bill {
  id: string;
  billNo: string;
  pvcCalculation?: {
    totalPvc: number;
  } | null;
}

interface Contract {
  id: string;
  contractNo: string;
  workDescription: string;
  loaNo: string | null;
  agreementNo: string | null;
  bills?: Bill[];
  user?: {
    divisionName?: string;
    division?: string;
    railwayZoneName?: string;
  };
}

export default function ContractCoveringLetterPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [contract, setContract] = useState<Contract | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState<CoveringLetterFormData>({
    toDesignation: 'Sr.DEN/Division',
    toOrganization: 'Indian Railways',
    toDivision: 'Division',
    workDescription: '',
    loaNumber: '',
    loaDate: '',
    agreementNumber: '',
    billNumber: '',
    billAmount: '',
    date: new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }),
    bodyText: 'In connection with the subject work, the price variation bill is worked out to Rs.{billAmount} for {billNumber} as per clause no:46A of GCC 2022 and the same is submitted for early payment please. The calculation sheets along with the indices are submitted here with this letter for the further process at your end.',
  });

  // Fetch contract and bills
  useEffect(() => {
    fetchContractData();
  }, [contractId]);

  // Update form when bills are selected
  useEffect(() => {
    updateBillDetails();
  }, [selectedBillIds, bills]);

  const fetchContractData = async () => {
    try {
      setLoading(true);
      
      // Fetch contract details (includes bills)
      const contractRes = await fetch(`/api/contracts/${contractId}`);
      if (!contractRes.ok) throw new Error('Failed to fetch contract');
      const contractData = await contractRes.json();
      setContract(contractData);
      
      // Extract bills from contract data
      if (contractData.bills && Array.isArray(contractData.bills)) {
        setBills(contractData.bills);
      }
      
      // Extract LOA date if available
      let loaDate = '';
      if (contractData.loaNo) {
        const dateMatch = contractData.loaNo.match(/dt[:\s]*(\d{2}\.\d{2}\.\d{2,4})/);
        if (dateMatch) {
          loaDate = dateMatch[1];
        }
      }
      
      // Prefill form with contract data
      const divisionName = contractData.user?.divisionName || contractData.user?.division;
      const railwayZoneName = contractData.user?.railwayZoneName;
      
      setFormData(prev => ({
        ...prev,
        toDesignation: divisionName 
          ? `Sr.DEN/${divisionName}` 
          : 'Sr.DEN/Division',
        toOrganization: railwayZoneName || 'Indian Railways',
        toDivision: `${divisionName || 'Division'} Division`,
        workDescription: contractData.workDescription || '',
        loaNumber: contractData.loaNo || '',
        loaDate: loaDate,
        agreementNumber: contractData.agreementNo || '',
      }));
      
    } catch (error) {
      console.error('Error fetching contract data:', error);
      toast.error('Failed to load contract data');
    } finally {
      setLoading(false);
    }
  };

  const updateBillDetails = () => {
    const selectedBills = bills.filter(bill => selectedBillIds.has(bill.id));
    
    if (selectedBills.length === 0) {
      setFormData(prev => ({
        ...prev,
        billNumber: '',
        billAmount: '',
      }));
      return;
    }
    
    // Join bill numbers
    const billNumbers = selectedBills.map(b => b.billNo).join(', ');
    
    // Sum total PVC amounts (including negative values)
    const totalPvc = selectedBills.reduce((sum, bill) => {
      const pvcValue = bill.pvcCalculation?.totalPvc ?? 0; // Use nullish coalescing to handle null/undefined
      return sum + pvcValue;
    }, 0);
    
    // Round to nearest integer
    const roundedPvc = Math.round(totalPvc);
    
    // Format amount with proper sign handling
    const formattedAmount = roundedPvc.toLocaleString('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      signDisplay: 'auto', // Show sign for negative numbers
    });
    
    setFormData(prev => ({
      ...prev,
      billNumber: billNumbers,
      billAmount: formattedAmount,
    }));
  };

  const handleBillToggle = (billId: string) => {
    setSelectedBillIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(billId)) {
        newSet.delete(billId);
      } else {
        newSet.add(billId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedBillIds.size === bills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(bills.map(b => b.id)));
    }
  };

  const handleInputChange = (field: keyof CoveringLetterFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGenerate = async () => {
    // Validation
    if (selectedBillIds.size === 0) {
      toast.error('Please select at least one bill');
      return;
    }

    try {
      setGenerating(true);
      
      // Replace placeholders in body text
      let processedBodyText = formData.bodyText
        .replace('{billAmount}', formData.billAmount)
        .replace('{billNumber}', formData.billNumber);
      
      const response = await fetch('/api/bills/covering-letter/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          bodyText: processedBodyText,
          companyName: 'Contractor', // Default value since we removed company details
          companyGSTIN: '', // Optional
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate covering letter');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = selectedBillIds.size > 1 
        ? `Covering_Letter_Multiple_Bills_${new Date().toISOString().split('T')[0]}.pdf`
        : `Covering_Letter_${bills.find(b => selectedBillIds.has(b.id))?.billNo || 'Bill'}.pdf`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Covering letter generated successfully');
    } catch (error) {
      console.error('Error generating covering letter:', error);
      toast.error('Failed to generate covering letter');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-5xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6">
        <BackButton href={`/contracts/${contractId}`} label="Back to Contract" variant="outline" />
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 mt-4">
          <FileText className="h-8 w-8" />
          Create Covering Letter
        </h1>
        {contract && (
          <p className="text-gray-500 mt-2">
            Contract: {contract.contractNo} - {contract.workDescription}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {/* Bills Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Bills</CardTitle>
            <CardDescription>
              Choose one or more bills to include in the covering letter
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bills.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                No bills found for this contract
              </p>
            ) : (
              <>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-sm text-gray-600">
                    {selectedBillIds.size} of {bills.length} bill(s) selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedBillIds.size === bills.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {bills.map(bill => (
                    <div
                      key={bill.id}
                      className="flex items-center space-x-2 p-3 rounded-lg hover:bg-gray-50 border"
                    >
                      <Checkbox
                        id={bill.id}
                        checked={selectedBillIds.has(bill.id)}
                        onCheckedChange={() => handleBillToggle(bill.id)}
                      />
                      <label
                        htmlFor={bill.id}
                        className="flex-1 cursor-pointer flex justify-between"
                      >
                        <span className="font-medium">{bill.billNo}</span>
                        <span className={`font-medium ${(bill.pvcCalculation?.totalPvc ?? 0) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          ₹{(bill.pvcCalculation?.totalPvc ?? 0).toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2,
                            signDisplay: 'auto',
                          })}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recipient Details */}
        <Card>
          <CardHeader>
            <CardTitle>Recipient Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="toDesignation">To Designation</Label>
              <Input
                id="toDesignation"
                value={formData.toDesignation}
                onChange={(e) => handleInputChange('toDesignation', e.target.value)}
                placeholder="Sr.DEN/Division"
              />
            </div>

            <div>
              <Label htmlFor="toOrganization">Organization</Label>
              <Input
                id="toOrganization"
                value={formData.toOrganization}
                onChange={(e) => handleInputChange('toOrganization', e.target.value)}
                placeholder="Indian Railways"
              />
            </div>

            <div>
              <Label htmlFor="toDivision">Division</Label>
              <Input
                id="toDivision"
                value={formData.toDivision}
                onChange={(e) => handleInputChange('toDivision', e.target.value)}
                placeholder="Division"
              />
            </div>
          </CardContent>
        </Card>

        {/* Work & Reference Details */}
        <Card>
          <CardHeader>
            <CardTitle>Work & Reference Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="workDescription">Work Description</Label>
              <Textarea
                id="workDescription"
                value={formData.workDescription}
                onChange={(e) => handleInputChange('workDescription', e.target.value)}
                placeholder="Enter work description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="loaNumber">LOA Number</Label>
                <Input
                  id="loaNumber"
                  value={formData.loaNumber}
                  onChange={(e) => handleInputChange('loaNumber', e.target.value)}
                  placeholder="Enter LOA number"
                />
              </div>

              <div>
                <Label htmlFor="loaDate">LOA Date</Label>
                <Input
                  id="loaDate"
                  value={formData.loaDate}
                  onChange={(e) => handleInputChange('loaDate', e.target.value)}
                  placeholder="DD.MM.YYYY"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="agreementNumber">Agreement Number</Label>
              <Input
                id="agreementNumber"
                value={formData.agreementNumber}
                onChange={(e) => handleInputChange('agreementNumber', e.target.value)}
                placeholder="Enter agreement number"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bill Details */}
        <Card>
          <CardHeader>
            <CardTitle>Bill Details</CardTitle>
            <CardDescription>
              These fields are automatically populated based on your bill selection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="billNumber">Bill Number(s)</Label>
              <Input
                id="billNumber"
                value={formData.billNumber}
                readOnly
                placeholder="Select bills above"
                className="bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="billAmount">Total PVC Amount</Label>
              <Input
                id="billAmount"
                value={formData.billAmount}
                readOnly
                placeholder="₹0.00"
                className="bg-gray-50"
              />
            </div>
          </CardContent>
        </Card>

        {/* Letter Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Letter Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                placeholder="DD/MM/YYYY"
              />
            </div>

            <div>
              <Label htmlFor="bodyText">Body Text</Label>
              <Textarea
                id="bodyText"
                value={formData.bodyText}
                onChange={(e) => handleInputChange('bodyText', e.target.value)}
                placeholder="Enter letter body text"
                rows={5}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use {'{billAmount}'} and {'{billNumber}'} as placeholders
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            onClick={handleGenerate}
            disabled={generating || selectedBillIds.size === 0}
            className="flex-1"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Generate Covering Letter
              </>
            )}
          </Button>

          <Button
            onClick={() => router.back()}
            variant="outline"
            size="lg"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
