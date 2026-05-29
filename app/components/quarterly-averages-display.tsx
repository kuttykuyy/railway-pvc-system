

"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface QuarterlyAverageData {
  quarter: string;
  quarterMonths: string[];
  components: {
    indexName: string;
    baseValue: number;
    averageValue: number | null;
    componentPercentage: number;
    monthlyValues: {
      month: string;
      value: number;
    }[];
  }[];
}

interface QuarterlyAveragesDisplayProps {
  contractId: string;
}

export function QuarterlyAveragesDisplay({ contractId }: QuarterlyAveragesDisplayProps) {
  const [data, setData] = useState<{
    contract: any;
    quarterlyData: QuarterlyAverageData[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuarterlyData();
  }, [contractId]);

  const fetchQuarterlyData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/contracts/${contractId}/quarterly-averages`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch quarterly data');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading quarterly averages...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-red-600">
            <p>Error: {error}</p>
            <Button onClick={fetchQuarterlyData} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.quarterlyData.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          No quarterly data available for this contract.
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            Quarterly Average Indices - Contract {data.contract.agreementNo}
          </CardTitle>
          <p className="text-sm text-gray-600">
            Contractor: {data.contract.contractorName} | Base Month: {data.contract.baseMonth}
          </p>
        </CardHeader>
      </Card>

      {data.quarterlyData.map((quarterData) => {
        // Check if this is an incomplete quarter
        const hasCompleteData = quarterData.components.some(c => c.averageValue !== null);
        const monthCount = quarterData.components[0]?.monthlyValues?.length || 0;
        const isIncomplete = monthCount < 3;
        
        return (
        <Card key={quarterData.quarter} className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Quarter No. {quarterData.quarter}
              {isIncomplete && (
                <span className="text-sm font-normal text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  Incomplete ({monthCount} month{monthCount !== 1 ? 's' : ''} only - minimum 3 required)
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-gray-600">
              Months Considered: {quarterData.quarterMonths.join(', ')}
            </p>
          </CardHeader>
          <CardContent>
            {isIncomplete && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
                <strong>Note:</strong> This quarter is incomplete. A minimum of 3 months of data is required to calculate quarterly averages. 
                Average values will be shown as "N/A" until all 3 months have data.
              </div>
            )}
            {/* Table with Horizontal Month Headers */}
            <div className="overflow-x-auto">
              {/* Get unique months across all components */}
              {(() => {
                const allMonths = new Set<string>();
                quarterData.components.forEach(component => {
                  component.monthlyValues.forEach(mv => allMonths.add(mv.month));
                });
                const sortedMonths = Array.from(allMonths).sort();
                
                return (
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-blue-100">
                        <th colSpan={6 + sortedMonths.length} className="border border-gray-300 p-3 text-center font-bold">
                          QUARTERWISE CALCULATION OF PVC AMOUNT AS PER Average Indices and Amounts of respective Categories
                        </th>
                      </tr>
                      <tr className="bg-gray-100">
                        <th rowSpan={3} className="border border-gray-300 p-2 text-center font-semibold text-sm">
                          ( 1st R Bill considered in this quarter)
                        </th>
                        <th colSpan={5 + sortedMonths.length} className="border border-gray-300 p-2 text-center font-semibold">
                          Final Indices considered for this Quarter
                        </th>
                      </tr>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-2 text-center font-semibold text-sm">
                          AMOUNT FOR PVC CALCULATION
                        </th>
                        <th className="border border-gray-300 p-2 text-center font-semibold text-sm">
                          Average Index of quarter
                        </th>
                        <th className="border border-gray-300 p-2 text-center font-semibold text-sm">
                          Base Index
                        </th>
                        <th className="border border-gray-300 p-2 text-center font-semibold text-sm">
                          Component %
                        </th>
                        {sortedMonths.map(month => (
                          <th key={month} className="border border-gray-300 p-1 text-center font-semibold text-xs">
                            {new Date(month + '-01').toLocaleDateString('en-US', { 
                              month: 'short', 
                              year: '2-digit' 
                            })}
                          </th>
                        ))}
                        <th className="border border-gray-300 p-2 text-center font-semibold text-sm">
                          PVC Payable/Recoverable
                        </th>
                      </tr>
                      <tr className="bg-gray-50">
                        <th colSpan={5 + sortedMonths.length} className="border border-gray-300 p-2 text-left font-semibold text-xs">
                          FORMULA FOR PVC CALCULATION = {'{ ( Amount x (Avg. Index - Base Index) x Component ) / Base Index }'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterData.components.map((component) => {
                        // Create a map for quick value lookup
                        const valueMap = new Map(
                          component.monthlyValues.map(mv => [mv.month, mv.value])
                        );
                        
                        return (
                          <tr key={component.indexName} className="hover:bg-gray-50">
                            <td className="border border-gray-300 p-2 text-sm font-medium">
                              {component.indexName === 'Labour' && 'Labour'}
                              {component.indexName === 'RBI Plant Machinery' && 'Plant Machinery & Spares'}
                              {component.indexName === 'MPNG Fuel' && 'Fuel & Lubricants'}
                              {component.indexName === 'RBI Other Materials' && 'Other Materials'}
                            </td>
                            <td className="border border-gray-300 p-2 text-center text-sm">
                              1,49,38,881.76 x {`{(`}
                            </td>
                            <td className="border border-gray-300 p-2 text-center text-sm">
                              {component.averageValue ? component.averageValue.toFixed(1) : 'N/A'} -
                            </td>
                            <td className="border border-gray-300 p-2 text-center text-sm">
                              {component.baseValue.toFixed(1)} {`/`} {component.baseValue.toFixed(1)} ) x
                            </td>
                            <td className="border border-gray-300 p-2 text-center text-sm">
                              {component.componentPercentage}% =
                            </td>
                            {sortedMonths.map(month => (
                              <td key={month} className="border border-gray-300 p-1 text-center text-xs">
                                {valueMap.get(month)?.toFixed(1) || 'N/A'}
                              </td>
                            ))}
                            <td className="border border-gray-300 p-2 text-center text-sm font-semibold">
                              {/* Calculate PVC amount */}
                              {component.averageValue && component.baseValue ? 
                                (1493881.76 * (component.averageValue - component.baseValue) / component.baseValue * component.componentPercentage / 100).toFixed(2) : 
                                'N/A'
                              }
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-blue-50 font-bold">
                        <td colSpan={4 + sortedMonths.length} className="border border-gray-300 p-2 text-right text-sm">
                          Total for Q7 =
                        </td>
                        <td className="border border-gray-300 p-2 text-center text-sm">
                          {/* Calculate total PVC amount */}
                          {quarterData.components
                            .filter(c => c.averageValue)
                            .reduce((sum, c) => sum + (1493881.76 * (c.averageValue! - c.baseValue) / c.baseValue * c.componentPercentage / 100), 0)
                            .toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
