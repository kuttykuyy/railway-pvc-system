'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Search, Plus, FileText, Eye, Edit, Trash2, AlertCircle, Calculator, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: Date;
  quarter: string;
  contract: {
    agreementNo: string;
    contractorName: string;
    isExtended: boolean;
    extensionType: string | null;
  };
  pvcCalculation?: {
    totalPvc: number;
    isIndexCapped?: boolean;
    originalPvcAmount?: number;
    restrictedPvcAmount?: number;
  };
}

export default function MobileBillsList() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBills();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = bills.filter(bill =>
        bill.billNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.contract.agreementNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.contract.contractorName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredBills(filtered);
    } else {
      setFilteredBills(bills);
    }
  }, [bills, searchTerm]);

  const loadBills = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/bills');
      if (response.ok) {
        const data = await response.json();
        setBills(data);
      } else {
        setError('Failed to load bills');
      }
    } catch (err) {
      console.error('Error loading bills:', err);
      setError('Failed to load bills');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (billId: string) => {
    if (!confirm('Are you sure you want to delete this bill?')) return;

    try {
      const response = await fetch(`/api/bills/${billId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setBills(bills.filter(b => b.id !== billId));
        toast.success('Bill deleted successfully');
      } else {
        toast.error('Failed to delete bill');
      }
    } catch (err) {
      console.error('Error deleting bill:', err);
      toast.error('Failed to delete bill');
    }
  };

  const recalculateBill = async (billId: string) => {
    setRecalculating(billId);
    try {
      const response = await fetch(`/api/bills/${billId}/recalculate`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        // Update the bill in the list with new calculation
        setBills(prev => prev.map(bill => 
          bill.id === billId 
            ? { ...bill, pvcCalculation: data.pvcCalculation }
            : bill
        ));
        toast.success('PVC recalculated successfully');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to recalculate PVC');
      }
    } catch (error) {
      console.error('Error recalculating bill:', error);
      const message = error instanceof Error ? error.message : 'Failed to recalculate PVC';
      toast.error(message);
    } finally {
      setRecalculating(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <h1 className="text-lg font-semibold">Bills</h1>
          </div>
          <Button
            size="sm"
            onClick={() => router.push('/bills/new/mobile')}
            className="h-9"
          >
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search bills..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Bills List */}
      <div className="p-4 space-y-3 pb-24">
        {filteredBills.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {searchTerm ? 'No bills found' : 'No bills yet'}
            </p>
            {!searchTerm && (
              <Button
                size="sm"
                onClick={() => router.push('/bills/new/mobile')}
                className="mt-4"
              >
                Create First Bill
              </Button>
            )}
          </div>
        ) : (
          filteredBills.map((bill) => (
            <div
              key={bill.id}
              className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
            >
              {/* Bill Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="font-medium text-base">{bill.billNo}</div>
                  <div className="text-sm text-gray-600">{bill.contract.agreementNo}</div>
                  {/* Extension Marker */}
                  {bill.contract?.isExtended && bill.contract?.extensionType && (
                    <Badge className={`text-xs mt-2 ${
                      bill.contract.extensionType === '17B' 
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300' 
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-300'
                    }`}>
                      <Clock className="h-3 w-3 mr-1" />
                      GCC {bill.contract.extensionType}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">
                  Q{bill.quarter}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-2 mb-3 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Contractor</span>
                  <span className="font-medium">{bill.contract.contractorName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Bill Amount</span>
                  <span className="font-medium">₹{bill.billAmount.toLocaleString()}</span>
                </div>
                {bill.pvcCalculation && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">PVC Amount</span>
                    {/* Show dual amounts for 17B extension bills */}
                    {bill.contract?.isExtended && bill.contract?.extensionType === '17B' && bill.pvcCalculation.isIndexCapped && bill.pvcCalculation.originalPvcAmount && bill.pvcCalculation.restrictedPvcAmount ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="text-xs text-gray-500">
                          <span className="font-medium">Without 17B:</span>
                          <span className="ml-1">₹{bill.pvcCalculation.originalPvcAmount.toLocaleString()}</span>
                        </div>
                        <div className="text-sm font-medium text-green-600">
                          <span className="text-xs text-gray-500 font-normal">With 17B:</span>
                          <span className="ml-1">₹{bill.pvcCalculation.restrictedPvcAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="font-medium text-green-600">
                        ₹{bill.pvcCalculation.totalPvc.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Date</span>
                  <span className="font-medium">
                    {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {/* Recalculate button - hidden as per user request */}
                {/* {bill.contract?.isExtended && bill.contract?.extensionType === '17B' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => recalculateBill(bill.id)}
                    disabled={recalculating === bill.id}
                    className="w-full h-9 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  >
                    {recalculating === bill.id ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">Recalculating...</span>
                      </>
                    ) : (
                      <>
                        <Calculator className="h-4 w-4 mr-1" />
                        Recalculate PVC
                      </>
                    )}
                  </Button>
                )} */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/reports/full/${bill.id}`)}
                    className="flex-1 h-9"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/bills/edit/${bill.id}`)}
                    className="flex-1 h-9"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(bill.id)}
                    className="h-9 px-3"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
