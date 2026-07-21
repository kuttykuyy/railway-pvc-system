
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface IndicesAvailability {
  hasIndices: boolean;
  latestMonth: string | null;
  latestYear: number | null;
  monthNumber: number;
  isProvisional: boolean;
  isComplete: boolean;
  isAllFinal: boolean;
  formattedDate: string;
  provisionalIndicesEnabled: boolean;
  latestMonthStats: {
    total: number;
    required: number;
    final: number;
    provisional: number;
    missing: number;
  };
  latestCompleteMonth: string | null;
  latestCompleteYear: number | null;
  latestCompleteMonthProvisional: boolean;
  totalCompleteMonths: number;
}

export function IndicesAvailabilityIndicator() {
  const [availability, setAvailability] = useState<IndicesAvailability | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLatestIndices();
  }, []);

  const fetchLatestIndices = async () => {
    try {
      const response = await fetch('/api/indices/latest-available');
      if (response.ok) {
        const data = await response.json();
        setAvailability(data);
      }
    } catch (error) {
      console.error('Error fetching indices availability:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="animate-pulse h-9 w-9 bg-emerald-200 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-emerald-200 rounded animate-pulse w-1/2" />
              <div className="h-2.5 bg-emerald-100 rounded animate-pulse w-1/3" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show only completed information (default and only view)
  if (!availability || !availability.hasIndices || !availability.latestCompleteMonth) {
    return (
      <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                No completed indices available yet
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show only completed information
  return (
    <Card className="border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-emerald-100 shadow-lg">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className={`absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20`} />
            <div className={`relative p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full shadow-md`}>
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                Completed up to:
              </span>
              <span className="text-lg font-black bg-gradient-to-r from-emerald-700 to-emerald-900 bg-clip-text text-transparent">
                {availability.latestCompleteMonth} {availability.latestCompleteYear}
              </span>
              {availability.latestCompleteMonthProvisional && (
                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-2 py-0.5">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Provisional
                </Badge>
              )}
            </div>

            {availability.totalCompleteMonths > 0 && (
              <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
                <span>•</span>
                <span>{availability.totalCompleteMonths} complete month{availability.totalCompleteMonths !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}