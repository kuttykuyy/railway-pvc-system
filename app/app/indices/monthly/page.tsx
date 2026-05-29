
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientRoleInfo } from '@/lib/role-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TrendingUp, Save, Calendar, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { format } from 'date-fns';

interface PriceIndex {
  id: string;
  name: string;
  baseValue: number;
  description?: string;
  monthlyValues: {
    month: Date;
    value: number;
    isProvisional: boolean;
  }[];
}

export default function MonthlyIndicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [indices, setIndices] = useState<PriceIndex[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [provisionalStatus, setProvisionalStatus] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if user is admin
  const { isAdmin } = getClientRoleInfo(session);

  // Redirect unauthenticated users only
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    fetchIndices();
    // Set default month to current month
    const now = new Date();
    setSelectedMonth(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
  }, []);

  useEffect(() => {
    if (selectedMonth && indices.length > 0) {
      loadExistingValues();
    }
  }, [selectedMonth, indices]);

  const fetchIndices = async () => {
    try {
      const response = await fetch('/api/indices');
      if (!response.ok) throw new Error('Failed to fetch indices');
      
      const data = await response.json();
      setIndices(data);
    } catch (error: any) {
      console.error('Error fetching indices:', error);
      setError(error.message || 'Failed to fetch price indices');
    } finally {
      setIsLoading(false);
    }
  };

  const loadExistingValues = () => {
    const monthDate = new Date(selectedMonth);
    const newValues: Record<string, string> = {};
    const newProvisionalStatus: Record<string, boolean> = {};
    
    indices.forEach(index => {
      const existingValue = index.monthlyValues.find(mv => {
        const mvMonth = new Date(mv.month);
        return mvMonth.getFullYear() === monthDate.getFullYear() && 
               mvMonth.getMonth() === monthDate.getMonth();
      });
      
      newValues[index.id] = existingValue ? existingValue.value.toString() : '';
      newProvisionalStatus[index.id] = existingValue ? existingValue.isProvisional : false;
    });
    
    setValues(newValues);
    setProvisionalStatus(newProvisionalStatus);
  };

  const handleValueChange = (indexId: string, value: string) => {
    setValues(prev => ({
      ...prev,
      [indexId]: value
    }));
  };

  const handleProvisionalStatusChange = (indexId: string, isProvisional: boolean) => {
    setProvisionalStatus(prev => ({
      ...prev,
      [indexId]: isProvisional
    }));
  };

  const setAllToProvisional = () => {
    const newStatus: Record<string, boolean> = {};
    indices.forEach(index => {
      newStatus[index.id] = true;
    });
    setProvisionalStatus(newStatus);
    setSuccess('All indices set to Provisional status');
    setTimeout(() => setSuccess(''), 2000);
  };

  const setAllToFinal = () => {
    const newStatus: Record<string, boolean> = {};
    indices.forEach(index => {
      newStatus[index.id] = false;
    });
    setProvisionalStatus(newStatus);
    setSuccess('All indices set to Final status');
    setTimeout(() => setSuccess(''), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const valuesToUpdate = Object.entries(values)
        .filter(([_, value]) => value !== '')
        .map(([priceIndexId, value]) => ({
          priceIndexId,
          month: selectedMonth,
          value: parseFloat(value),
          isProvisional: provisionalStatus[priceIndexId] || false
        }));

      if (valuesToUpdate.length === 0) {
        setError('Please enter at least one index value');
        return;
      }

      const response = await fetch('/api/indices/monthly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: valuesToUpdate })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update values');
      }

      setSuccess(`Successfully updated ${valuesToUpdate.length} index values for ${format(new Date(selectedMonth), 'MMMM yyyy')}`);
      
      // Refresh data
      fetchIndices();
    } catch (error: any) {
      console.error('Error saving values:', error);
      setError(error.message || 'Failed to save index values');
    } finally {
      setSaving(false);
    }
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
      <div className="flex items-center gap-4">
        <BackButton href="/indices" label="Back to Indices" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-green-600" />
            Update Monthly Values
          </h1>
          <p className="text-gray-600 mt-2">
            Enter monthly index values for PVC calculations
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <StatusMessage type="error" title="Error" message={error} />
        )}
        
        {success && (
          <StatusMessage type="success" title="Success" message={success} />
        )}

        {/* Month Selection */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Select Month
            </CardTitle>
            <CardDescription>
              Choose the month for which you want to update index values
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm">
              <Label htmlFor="month">Month *</Label>
              <Input
                id="month"
                type="month"
                value={selectedMonth ? format(new Date(selectedMonth), 'yyyy-MM') : ''}
                onChange={(e) => setSelectedMonth(e.target.value ? e.target.value + '-01' : '')}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Index Values */}
        {selectedMonth && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>
                    Index Values for {format(new Date(selectedMonth), 'MMMM yyyy')}
                  </CardTitle>
                  <CardDescription>
                    Enter the monthly values for each price index. Leave blank to skip.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setAllToFinal}
                    className="whitespace-nowrap border-green-600 text-green-600 hover:bg-green-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    Set All Final
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setAllToProvisional}
                    className="whitespace-nowrap border-orange-600 text-orange-600 hover:bg-orange-50"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                    Set All Provisional
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {indices.map((index) => {
                  const currentValue = values[index.id] || '';
                  const isProvisional = provisionalStatus[index.id] || false;
                  const baseValue = index.baseValue;
                  const hasValue = currentValue !== '';
                  const numericValue = parseFloat(currentValue);
                  const changePercent = hasValue && !isNaN(numericValue) 
                    ? ((numericValue - baseValue) / baseValue * 100)
                    : 0;

                  return (
                    <div key={index.id} className="p-3 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <Label htmlFor={index.id} className="text-sm font-semibold text-gray-900">
                            {index.name}
                          </Label>
                          <Badge 
                            variant={isProvisional ? "secondary" : "default"} 
                            className="text-[10px] px-1.5 py-0 h-5 ml-2"
                          >
                            {isProvisional ? (
                              <><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Provisional</>
                            ) : (
                              <><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Final</>
                            )}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="space-y-2.5">
                        <Input
                          id={index.id}
                          type="number"
                          step="0.01"
                          value={currentValue}
                          onChange={(e) => handleValueChange(index.id, e.target.value)}
                          placeholder={`Base: ${baseValue.toLocaleString('en-IN')}`}
                          className="text-right h-9"
                        />
                        
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-700">Status</Label>
                          <RadioGroup 
                            value={isProvisional ? "provisional" : "final"} 
                            onValueChange={(value) => handleProvisionalStatusChange(index.id, value === "provisional")}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="final" id={`${index.id}-final`} className="h-4 w-4" />
                              <Label 
                                htmlFor={`${index.id}-final`} 
                                className="text-xs font-normal cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle className="h-3 w-3 text-green-600" />
                                Final
                              </Label>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="provisional" id={`${index.id}-provisional`} className="h-4 w-4" />
                              <Label 
                                htmlFor={`${index.id}-provisional`} 
                                className="text-xs font-normal cursor-pointer flex items-center gap-1"
                              >
                                <AlertTriangle className="h-3 w-3 text-orange-600" />
                                Provisional
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                        
                        <div className="flex justify-between text-xs text-gray-600 pt-1 border-t">
                          <span>Base: {baseValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          {hasValue && !isNaN(numericValue) && (
                            <span className={changePercent >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        {selectedMonth && (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {isSaving ? (
                <LoadingSpinner size="sm" text="Saving..." />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Index Values
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
