
'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, MapPin, X, Train } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export function PostingDetailsNotice() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const data = await response.json();
          setUserData(data);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Don't render while loading
  if (isLoading) {
    return null;
  }

  // Check if posting details are incomplete
  const isIncomplete = 
    !userData?.designation || 
    !userData?.department || 
    !userData?.railwayZone || 
    !userData?.division;

  // Don't show notice if not a railway official or if already complete or if dismissed
  if (userData?.role !== 'railway_official' || !isIncomplete || dismissed) {
    return null;
  }

  return (
    <Card className="border-0 shadow-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 overflow-hidden">
      <CardContent className="p-0">
        <div className="relative">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(251, 146, 60, 0.3) 2px, transparent 0)',
              backgroundSize: '40px 40px'
            }} />
          </div>
          
          {/* Content */}
          <div className="relative p-4 sm:p-8 md:p-12">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 text-center max-w-3xl mx-auto">
                {/* Icon and Title */}
                <div className="flex flex-col items-center gap-6 mb-6">
                  <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-5 rounded-2xl shadow-xl">
                    <Train className="h-12 w-12 text-white" />
                  </div>
                  
                  <div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-amber-900 mb-3">
                      Complete Your Railway Posting Details
                    </h2>
                    <p className="text-lg text-amber-800 leading-relaxed max-w-2xl mx-auto">
                      Your posting information is required to enable bill routing and approval workflows. 
                      Please update your designation, department, railway zone, and division to process bills in your jurisdiction.
                    </p>
                  </div>
                </div>

                {/* Missing Information Notice */}
                <div className="bg-white/80 backdrop-blur-sm border-2 border-amber-300 rounded-xl p-6 mb-6 max-w-xl mx-auto">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <h3 className="text-lg font-semibold text-amber-900">Missing Information</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {!userData?.designation && (
                      <div className="bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        <span className="text-amber-700 font-medium">• Designation</span>
                      </div>
                    )}
                    {!userData?.department && (
                      <div className="bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        <span className="text-amber-700 font-medium">• Department</span>
                      </div>
                    )}
                    {!userData?.railwayZone && (
                      <div className="bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        <span className="text-amber-700 font-medium">• Railway Zone</span>
                      </div>
                    )}
                    {!userData?.division && (
                      <div className="bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        <span className="text-amber-700 font-medium">• Division</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                  <Button 
                    size="lg"
                    className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 text-lg px-8 py-6 h-auto"
                    onClick={() => router.push('/profile')}
                  >
                    <MapPin className="mr-3 h-5 w-5" />
                    Update Posting Details Now
                  </Button>
                </div>

                <p className="text-sm text-amber-700 mt-4">
                  This notice will appear until your posting details are complete
                </p>
              </div>
              
              {/* Dismiss Button */}
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-amber-600 hover:text-amber-900 hover:bg-amber-100/50 h-10 w-10 p-0 rounded-full"
                onClick={() => setDismissed(true)}
                title="Dismiss temporarily"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
