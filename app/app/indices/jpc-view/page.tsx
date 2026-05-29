'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, ChevronLeft, ChevronRight, Database, Calculator } from 'lucide-react';
import { JPC_ITEMS, JpcItem } from '@/lib/jpc-items';
import toast from 'react-hot-toast';

interface JpcItemData {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  indexMapping: string;
  f1: number | null;
  f2: number | null;
  average: number | null;
  source: string;
}

interface IndexAverage {
  value: number;
  formula: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  PIG_IRON: 'Pig Iron',
  SEMIS: 'Semis',
  WIRE_ROD: 'Wire Rods',
  ROUND: 'MS Rounds',
  TMT: 'TMT Bars',
  ANGLE: 'MS Angles',
  JOIST: 'MS Joists/Beams',
  CHANNEL: 'MS Channels',
  PLATE: 'MS Plates',
  HR_COIL: 'HR Coils',
  CR_COIL: 'CR Coils',
  GP_SHEET: 'GP Sheets',
  GC_SHEET: 'GC Sheets',
  SCRAP: 'Scrap',
  SPONGE: 'Sponge Iron'
};

const INDEX_MAPPING_COLORS: Record<string, string> = {
  'Steel TMT Bars': 'bg-blue-100 text-blue-800',
  'Steel Angle/Channel': 'bg-green-100 text-green-800',
  'Steel Plates': 'bg-purple-100 text-purple-800',
  'Steel Other Sections': 'bg-gray-100 text-gray-700'
};

export default function JpcViewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCity, setSelectedCity] = useState('Chennai');
  const [isLoading, setIsLoading] = useState(false);
  const [itemsData, setItemsData] = useState<Record<string, JpcItemData>>({});
  const [indexAverages, setIndexAverages] = useState<Record<string, IndexAverage>>({});
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  const fetchJpcData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/indices/jpc-items?month=${selectedMonth}&city=${selectedCity}`);
      if (response.ok) {
        const data = await response.json();
        setItemsData(data.items || {});
        setIndexAverages(data.indexAverages || {});
        setItemCount(data.itemCount || 0);
      } else {
        setItemsData({});
        setIndexAverages({});
        setItemCount(0);
      }
    } catch (error) {
      console.error('Error fetching JPC data:', error);
      toast.error('Failed to load JPC data');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedCity]);

  useEffect(() => {
    if (session) {
      fetchJpcData();
    }
  }, [session, fetchJpcData]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1);
    if (direction === 'prev') {
      date.setMonth(date.getMonth() - 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  };

  const formatPrice = (val: number | null) => {
    if (val === null || val === undefined || val === 0) return '-';
    return `₹${val.toLocaleString('en-IN')}`;
  };

  // Group items by category
  const groupedItems = JPC_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, JpcItem[]>);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/indices/view')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">JPC Steel Rates</h1>
          <p className="text-sm text-gray-500">{selectedCity} market prices for 34 steel items (Joint Plant Committee)</p>
        </div>
      </div>

      {/* City Selector */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {['Delhi', 'Mumbai', 'Chennai', 'Kolkata'].map((city) => (
          <Button
            key={city}
            variant={selectedCity === city ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCity(city)}
          >
            {city}
          </Button>
        ))}
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-xl font-semibold text-gray-900 min-w-[180px] text-center">
          {formatMonth(selectedMonth)}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigateMonth('next')}
          disabled={selectedMonth >= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Status Bar */}
      <div className="bg-white border rounded-lg p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-gray-400" />
          <span className="text-sm text-gray-600">
            {itemCount > 0 ? (
              <span className="text-green-600 font-medium">{itemCount} items with data</span>
            ) : (
              <span className="text-amber-600">No data for this month</span>
            )}
          </span>
        </div>
        <span className="text-xs text-gray-400">Source: JPC {selectedCity}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          {/* Calculated Steel Index Averages */}
          {Object.keys(indexAverages).length > 0 && (
            <Card className="mb-6 bg-green-50 border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-green-800 text-lg">
                  <Calculator className="h-5 w-5" />
                  Calculated Steel Index Values
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'TMT', label: 'Steel TMT Bars' },
                    { key: 'ANGLE_CHANNEL', label: 'Steel Angle/Channel' },
                    { key: 'PLATES', label: 'Steel Plates' },
                    { key: 'OTHER_SECTIONS', label: 'Steel Other Sections' }
                  ].map(({ key, label }) => (
                    <div key={key} className="bg-white rounded-lg p-3 border border-green-200">
                      <div className="text-xs text-gray-500 mb-1">{label}</div>
                      <div className="text-lg font-bold text-green-700">
                        {indexAverages[key]?.value ? formatPrice(indexAverages[key].value) : '-'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 truncate" title={indexAverages[key]?.formula}>
                        {indexAverages[key]?.formula || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Items Table by Category */}
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([category, items]) => (
              <Card key={category}>
                <CardHeader className="py-3 bg-gray-50">
                  <CardTitle className="text-base font-semibold text-gray-700">
                    {CATEGORY_LABELS[category] || category} ({items.length} items)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600">F1 (₹/MT)</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600">F2 (₹/MT)</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600">Average</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600">Maps To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const data = itemsData[item.id];
                          const hasData = data && (data.f1 || data.f2);
                          return (
                            <tr 
                              key={item.id} 
                              className={`border-b ${hasData ? 'bg-green-50' : ''}`}
                            >
                              <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2 text-gray-900">{item.name}</td>
                              <td className="px-3 py-2 text-right text-gray-700 font-mono">
                                {formatPrice(data?.f1 || null)}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700 font-mono">
                                {formatPrice(data?.f2 || null)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-gray-900 font-mono">
                                {formatPrice(data?.average || null)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${INDEX_MAPPING_COLORS[item.indexMapping] || 'bg-gray-100 text-gray-700'}`}>
                                  {item.indexMapping.replace('Steel ', '')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Index Mapping Legend</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(INDEX_MAPPING_COLORS).map(([name, className]) => (
                <span key={name} className={`px-2 py-1 rounded text-xs font-medium ${className}`}>
                  {name}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Each JPC item maps to one of the four Railway Steel Indices. The calculated averages above are used in PVC calculations.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
