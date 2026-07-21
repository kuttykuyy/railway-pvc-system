
"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { ApprovalActions } from '@/components/bills/approval-actions';
import { 
  Calendar, 
  Building2, 
  User, 
  FileText, 
  Calculator, 
  MapPin, 
  Hash, 
  CheckCircle2, 
  Clock,
  AlertCircle,
  TrendingUp,
  Edit,
  Eye,
  Send
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface BillCardProps {
  bill: {
    id: string;
    billNo: string;
    quarter: string;
    dateOfMeasurement: Date;
    billAmount: number;
    zone?: string | null;
    pvcNumber?: string | null;
    isFinalPvc?: boolean;
    dateOfCompletion?: Date | null;
    createdAt: Date;
    status?: string; // Added status field
    contract?: {
      id: string;
      agreementNo: string;
      contractorName: string;
      workDescription: string;
      isExtended: boolean;
      extensionType?: string | null;
      coveringLetterDesignation?: string | null;
      loaDate?: Date | null;
      baseMonth?: Date | string | null;
      user?: {
        id: string;
        name: string | null;
        email: string;
      } | null;
    };
    pvcCalculation?: {
      totalPvc: number;
      cumulativePvc: number;
      labourPvc?: number;
      plantMachineryPvc?: number;
      fuelPowerPvc?: number;
      otherMaterialsPvc?: number;
      cementPvc?: number;
      steelPvc?: number;
      explosivesPvc?: number;
      dedicatedCementPvc?: number;
      dedicatedSteelPvc?: number;
      isIndexCapped?: boolean;
      originalPvcAmount?: number | null;
      restrictedPvcAmount?: number | null;
    } | null;
    indicesStatus?: {
      isProvisional: boolean;
    };
  };
  variant?: 'default' | 'compact';
  showActions?: boolean;
  showContract?: boolean;
  userRole?: string; // Added userRole for approval actions
  onRecalculate?: () => void;
  onActionComplete?: () => void; // Added callback for approval actions
}

export function BillCard({ 
  bill, 
  variant = 'default', 
  showActions = true,
  showContract = true,
  userRole = 'user',
  onActionComplete
}: BillCardProps) {
  const [isSubmittingForApproval, setIsSubmittingForApproval] = useState(false);

  const isCompact = variant === 'compact';
  const is17BRestricted = bill.contract?.isExtended && bill.contract?.extensionType === '17B';
  const is17ACapped = bill.pvcCalculation?.isIndexCapped && is17BRestricted;
  
  // Check if user can see creator info
  const canSeeCreator = userRole === 'admin' || userRole === 'railway_official';
  
  // Check if bill can be submitted for approval
  const canSubmitForApproval = bill.status === 'draft' || bill.status === 'revision_requested';

  const handleSubmitForApproval = async () => {
    if (!confirm('Are you sure you want to submit this bill for approval?')) return;
    
    setIsSubmittingForApproval(true);
    try {
      const response = await fetch('/api/bills/approval/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: bill.id })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Bill submitted for approval successfully!');
        onActionComplete?.();
      } else {
        toast.error(data.error || 'Failed to submit bill for approval');
      }
    } catch (error) {
      console.error('Error submitting bill:', error);
      toast.error('Failed to submit bill for approval');
    } finally {
      setIsSubmittingForApproval(false);
    }
  };

  return (
    <Card className={`border-0 shadow-md hover:shadow-xl transition-all duration-300 ${
      bill.isFinalPvc ? 'ring-2 ring-green-500' : ''
    }`}>
      <div className={`${isCompact ? 'p-4' : 'p-6'}`}>
        {/* Header Section */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`${isCompact ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>
                {bill.billNo}
              </h3>
              {/* Base Month Badge */}
              {bill.contract?.baseMonth && (
                <Badge variant="outline" className="text-xs bg-gray-50">
                  Base: {format(new Date(bill.contract.baseMonth), 'MMM yyyy')}
                </Badge>
              )}
              {/* Quarter Badge */}
              <Badge variant="outline" className="text-xs">
                {bill.quarter}
              </Badge>
              
              {/* Final PVC Badge */}
              {bill.isFinalPvc && (
                <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-200 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Final PVC
                </Badge>
              )}
              
              {/* Indices Status Badge */}
              {bill.indicesStatus?.isProvisional ? (
                <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Provisional
                </Badge>
              ) : (
                <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Final
                </Badge>
              )}
              
              {/* Extension Marker */}
              {bill.contract?.isExtended && bill.contract?.extensionType && (
                <Badge className={`text-xs ${
                  bill.contract.extensionType === '17B' 
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300' 
                    : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-300'
                }`}>
                  <Clock className="h-3 w-3 mr-1" />
                  GCC {bill.contract.extensionType}
                </Badge>
              )}
            </div>
            
            {/* Zone and PVC Number */}
            <div className="flex items-center gap-4 text-xs text-gray-600">
              {bill.zone && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="font-medium">{bill.zone}</span>
                </div>
              )}
              {bill.pvcNumber && (
                <div className="flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  <span className="font-medium">{bill.pvcNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contract Info (if enabled) */}
        {showContract && bill.contract && (
          <div className="space-y-2 mb-4 pb-4 border-b border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-gray-500" />
              <Link 
                href={`/contracts/${bill.contract.id}`}
                className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                {bill.contract.agreementNo}
              </Link>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="h-4 w-4 text-gray-500" />
              <span>{bill.contract.contractorName}</span>
            </div>
            
            {!isCompact && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <FileText className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{bill.contract.workDescription}</span>
              </div>
            )}
            
            {/* Creator Information - Visible to Admin and Railway Officials */}
            {canSeeCreator && bill.contract.user && (
              <div className="flex items-center gap-2 text-xs pt-2 border-t border-gray-100">
                <User className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-gray-600">
                  <span className="text-gray-500">Created by: </span>
                  <span className="font-medium text-emerald-600">
                    {bill.contract.user.name || bill.contract.user.email}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Dates Section */}
        <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mb-4 pb-4 border-b border-gray-200`}>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Calendar className="h-3.5 w-3.5 text-gray-500" />
            <div>
              <span className="text-gray-500">Measured: </span>
              <span className="font-medium text-gray-900">
                {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
              </span>
            </div>
          </div>
          
          {bill.isFinalPvc && bill.dateOfCompletion && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              <div>
                <span className="text-gray-500">Completed: </span>
                <span className="font-medium text-gray-900">
                  {format(new Date(bill.dateOfCompletion), 'dd MMM yyyy')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Financial Summary */}
        <div className={`grid ${isCompact ? 'grid-cols-2' : 'grid-cols-3'} gap-4 mb-4 pb-4 border-b border-gray-200`}>
          {/* Bill Amount */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Bill Amount
            </p>
            <p className="text-lg font-bold text-emerald-600">
              ₹{bill.billAmount?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
            </p>
          </div>

          {/* PVC Amount */}
          {bill.pvcCalculation && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {is17ACapped ? 'PVC (17B Restricted)' : 'PVC Amount'}
                </p>
                
                {/* Dual display for 17B restricted bills */}
                {is17ACapped && bill.pvcCalculation.originalPvcAmount != null && bill.pvcCalculation.restrictedPvcAmount != null ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-green-600">
                      ₹{bill.pvcCalculation.restrictedPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                    {!isCompact && (
                      <p className="text-[10px] text-gray-500 leading-tight">
                        Without 17B: ₹{bill.pvcCalculation.originalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-lg font-bold text-green-600">
                    ₹{bill.pvcCalculation.totalPvc?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                  </p>
                )}
              </div>

              {/* Cumulative PVC */}
              {!isCompact && bill.pvcCalculation.cumulativePvc != null && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Calculator className="h-3 w-3" />
                    Cumulative PVC
                  </p>
                  <p className="text-lg font-bold text-emerald-600">
                    ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Component Breakdown Preview - Show all components including negative values */}
        {!isCompact && bill.pvcCalculation && (
          <div className="space-y-2 mb-4 pb-4 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <Calculator className="h-3.5 w-3.5" />
              Component Breakdown
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Labour */}
              {bill.pvcCalculation.labourPvc != null && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Labour:</span>
                  <span className={`font-medium ${bill.pvcCalculation.labourPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.labourPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Plant & Machinery */}
              {bill.pvcCalculation.plantMachineryPvc != null && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Plant:</span>
                  <span className={`font-medium ${bill.pvcCalculation.plantMachineryPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.plantMachineryPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Fuel & Power */}
              {bill.pvcCalculation.fuelPowerPvc != null && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Fuel:</span>
                  <span className={`font-medium ${bill.pvcCalculation.fuelPowerPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.fuelPowerPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Other Materials */}
              {bill.pvcCalculation.otherMaterialsPvc != null && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Materials:</span>
                  <span className={`font-medium ${bill.pvcCalculation.otherMaterialsPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.otherMaterialsPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Cement (General) */}
              {bill.pvcCalculation.cementPvc != null && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Cement:</span>
                  <span className={`font-medium ${bill.pvcCalculation.cementPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.cementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Steel (General) */}
              {bill.pvcCalculation.steelPvc != null && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Steel:</span>
                  <span className={`font-medium ${bill.pvcCalculation.steelPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.steelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Explosives */}
              {bill.pvcCalculation.explosivesPvc != null && bill.pvcCalculation.explosivesPvc !== 0 && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Explosives:</span>
                  <span className={`font-medium ${bill.pvcCalculation.explosivesPvc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    ₹{bill.pvcCalculation.explosivesPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Dedicated Cement */}
              {bill.pvcCalculation.dedicatedCementPvc != null && bill.pvcCalculation.dedicatedCementPvc !== 0 && (
                <div className="flex justify-between items-center p-2 bg-amber-50 rounded border border-amber-200">
                  <span className="text-gray-600 font-medium">Dedicated Cement:</span>
                  <span className={`font-semibold ${bill.pvcCalculation.dedicatedCementPvc < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    ₹{bill.pvcCalculation.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Dedicated Steel */}
              {bill.pvcCalculation.dedicatedSteelPvc != null && bill.pvcCalculation.dedicatedSteelPvc !== 0 && (
                <div className="flex justify-between items-center p-2 bg-emerald-50 rounded border border-emerald-200">
                  <span className="text-gray-600 font-medium">Dedicated Steel:</span>
                  <span className={`font-semibold ${bill.pvcCalculation.dedicatedSteelPvc < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    ₹{bill.pvcCalculation.dedicatedSteelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {showActions && (
          <div className="space-y-2 mt-4 pt-4 border-t border-gray-200">
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href={`/bills/${bill.id}`}>
                  <Eye className="h-3.5 w-3.5 mr-2" />
                  View Report
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href={`/bills/edit/${bill.id}`}>
                  <Edit className="h-3.5 w-3.5 mr-2" />
                  Edit
                </Link>
              </Button>
            </div>
            
            {/* Submit for Approval Button - Show for draft or revision_requested bills */}
            {canSubmitForApproval && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-green-600 text-green-600 hover:bg-green-50 hover:border-green-700 font-medium"
                onClick={handleSubmitForApproval}
                disabled={isSubmittingForApproval}
              >
                {isSubmittingForApproval ? (
                  <>
                    <div className="h-3.5 w-3.5 mr-2 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-2" />
                    Submit for Approval
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
