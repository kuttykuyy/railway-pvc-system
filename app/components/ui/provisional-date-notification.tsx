
'use client';

import { useState, useEffect } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Calendar, CheckCircle, X } from 'lucide-react';
import { validateDateForApi } from '@/lib/date-validation';

interface ProvisionalDateNotificationProps {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface IndicesStatus {
  month: string;
  provisionalIndices: string[];
  finalIndices: string[];
  missingIndices: string[];
  hasProvisionalData: boolean;
}

export function ProvisionalDateNotification({ 
  selectedDate, 
  onDateChange, 
  open, 
  onOpenChange 
}: ProvisionalDateNotificationProps) {
  const [indicesStatus, setIndicesStatus] = useState<IndicesStatus | null>(null);
  const [availableFinalMonths, setAvailableFinalMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && selectedDate) {
      checkIndicesStatus();
      fetchAvailableFinalMonths();
    }
  }, [open, selectedDate]);

  const checkIndicesStatus = async () => {
    try {
      setLoading(true);
      
      // Validate date before making API call
      const validatedDate = validateDateForApi(selectedDate, 'ProvisionalDateNotification');
      if (!validatedDate) {
        console.error('Invalid date provided to ProvisionalDateNotification:', selectedDate);
        setLoading(false);
        return;
      }
      
      const response = await fetch(`/api/indices/check-provisional?date=${validatedDate}`);
      if (response.ok) {
        const data = await response.json();
        setIndicesStatus(data);
      } else {
        console.error('API error checking indices status:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error checking indices status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableFinalMonths = async () => {
    try {
      const response = await fetch('/api/indices/available-final-months');
      if (response.ok) {
        const data = await response.json();
        setAvailableFinalMonths(data.months || []);
      }
    } catch (error) {
      console.error('Error fetching available final months:', error);
    }
  };

  const handleDateSelect = (month: string) => {
    if (onDateChange) {
      onDateChange(month + '-15'); // Set to 15th of the month
    }
    onOpenChange(false);
  };

  const formatMonth = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric'
    });
  };

  if (!indicesStatus) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-orange-700">
            <AlertTriangle className="h-5 w-5" />
            Provisional Month Detected - Do Not Process
          </AlertDialogTitle>
          <AlertDialogDescription>
            The selected measurement date ({formatMonth(selectedDate)}) contains provisional indices. 
            Processing bills with provisional data is not recommended as the indices may change.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
            </div>
          ) : (
            <>
              {/* Current Month Status */}
              <div className="p-4 border border-orange-200 bg-orange-50 rounded-lg">
                <h4 className="font-semibold text-orange-800 mb-2">
                  {formatMonth(selectedDate)} - Index Status
                </h4>
                
                {indicesStatus.provisionalIndices.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-red-700 mb-1">
                      Provisional Indices ({indicesStatus.provisionalIndices.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {indicesStatus.provisionalIndices.map((index) => (
                        <Badge key={index} variant="destructive" className="text-xs">
                          {index}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {indicesStatus.finalIndices.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-green-700 mb-1">
                      Final Indices ({indicesStatus.finalIndices.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {indicesStatus.finalIndices.map((index) => (
                        <Badge key={index} variant="secondary" className="text-xs bg-green-100 text-green-800">
                          {index}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {indicesStatus.missingIndices.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      Missing Indices ({indicesStatus.missingIndices.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {indicesStatus.missingIndices.map((index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {index}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Available Final Months */}
              {availableFinalMonths.length > 0 && (
                <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Available Final Indices Months
                  </h4>
                  <p className="text-sm text-green-700 mb-3">
                    Select from these months which have complete final indices:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {availableFinalMonths.map((month) => (
                      <Button
                        key={month}
                        variant="outline"
                        size="sm"
                        className="justify-start border-green-300 hover:bg-green-100"
                        onClick={() => handleDateSelect(month)}
                      >
                        <Calendar className="h-3 w-3 mr-2" />
                        {formatMonth(month + '-01')}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {availableFinalMonths.length === 0 && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    No months with complete final indices found. Please ensure final indices are entered 
                    in the <strong>Price Indices</strong> section before processing bills.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <AlertDialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Keep Current Date
          </Button>
          {availableFinalMonths.length > 0 && (
            <Button 
              variant="default"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => onOpenChange(false)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              I'll Select Final Month
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
