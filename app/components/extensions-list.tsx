
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Calendar, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Trash2,
  Clock
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ExtensionFormDialog } from './extension-form-dialog';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Extension {
  id: string;
  extensionType: string;
  extensionSubcategory: string | null;
  extensionReason: string | null;
  originalCompletionDate: Date;
  extendedCompletionDate: Date;
  extensionDuration: number;
  isPvcRestricted: boolean;
  pvcRestrictionDate: Date | null;
  approvedBy: string | null;
  approvalDate: Date;
  orderNumber: string | null;
  liquidatedDamagesRate: number | null;
  isLiquidatedDamages: boolean;
}

interface ExtensionsListProps {
  contractId: string;
  extensions: Extension[];
  originalCompletionDate: Date | null;
}

export function ExtensionsList({ 
  contractId, 
  extensions: initialExtensions,
  originalCompletionDate 
}: ExtensionsListProps) {
  const router = useRouter();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [extensionToDelete, setExtensionToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!extensionToDelete) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/contracts/${contractId}/extensions/${extensionToDelete}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete extension');
      }

      toast.success('Extension deleted successfully');
      router.refresh();
    } catch (error) {
      console.error('Error deleting extension:', error);
      toast.error('Failed to delete extension');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setExtensionToDelete(null);
    }
  };

  if (initialExtensions.length === 0) {
    return (
      <>
        <div className="text-center py-12">
          <CalendarClock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Extensions Recorded
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            This contract has no time extensions yet. Add an extension when 
            additional time is granted under GCC Clauses 17A or 17B.
          </p>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Extension
          </Button>
        </div>

        <ExtensionFormDialog
          contractId={contractId}
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          originalCompletionDate={originalCompletionDate}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Add Extension Button */}
        <div className="flex justify-end">
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Extension
          </Button>
        </div>

        {/* Extensions Timeline */}
        <div className="space-y-4">
          {initialExtensions.map((extension, index) => (
            <div
              key={extension.id}
              className="relative border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-white"
            >
              {/* Timeline connector */}
              {index < initialExtensions.length - 1 && (
                <div className="absolute left-7 top-full h-4 w-0.5 bg-gray-300" />
              )}

              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  extension.extensionType === '17A'
                    ? 'bg-green-100'
                    : 'bg-orange-100'
                }`}>
                  {extension.extensionType === '17A' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant={extension.extensionType === '17A' ? 'default' : 'destructive'}
                          className="font-mono"
                        >
                          GCC {extension.extensionType}
                          {extension.extensionType === '17A' && extension.extensionSubcategory && (
                            <span className="ml-1">({extension.extensionSubcategory})</span>
                          )}
                        </Badge>
                        <span className="text-sm text-gray-600">
                          Extension #{initialExtensions.length - index}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-gray-900">
                        {extension.extensionType === '17A' 
                          ? 'Extension Without Liquidated Damages'
                          : 'Extension With Liquidated Damages (PVC Restricted)'}
                      </h4>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setExtensionToDelete(extension.id);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Reason */}
                  <div className="mb-3">
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-100">
                      {extension.extensionReason || 'No reason provided'}
                    </p>
                  </div>

                  {/* Dates and Duration */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Original Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(extension.originalCompletionDate), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Extended To</p>
                        <p className="text-sm font-medium text-emerald-700">
                          {format(new Date(extension.extendedCompletionDate), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Duration</p>
                        <p className="text-sm font-medium text-emerald-700">
                          {extension.extensionDuration} days
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                    {extension.approvedBy && (
                      <span className="flex items-center gap-1">
                        <strong>Approved by:</strong> {extension.approvedBy}
                      </span>
                    )}
                    {extension.orderNumber && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <strong>Order:</strong> {extension.orderNumber}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <strong>Approved:</strong> {format(new Date(extension.approvalDate), 'dd MMM yyyy')}
                    </span>
                    {extension.isLiquidatedDamages && extension.liquidatedDamagesRate && (
                      <span className="flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-3 w-3" />
                        <strong>LD Rate:</strong> {extension.liquidatedDamagesRate}% per week
                      </span>
                    )}
                  </div>

                  {/* PVC Restriction Notice */}
                  {extension.isPvcRestricted && (
                    <div className="mt-3 flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>PVC Restriction:</strong> Price indices capped at{' '}
                        {extension.pvcRestrictionDate && 
                          format(new Date(extension.pvcRestrictionDate), 'MMMM yyyy')
                        } values for bills during this extension period.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Extension Dialog */}
      <ExtensionFormDialog
        contractId={contractId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        originalCompletionDate={originalCompletionDate}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Extension?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contract extension? This action cannot be undone.
              If this is the latest extension, the contract completion date will revert to the previous state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CalendarClock({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <circle cx="12" cy="16" r="3" />
      <polyline points="12 14 12 16 13 17" />
    </svg>
  );
}
