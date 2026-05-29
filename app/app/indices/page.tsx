'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TrendingUp, Fuel, FileSpreadsheet, FileText, ArrowRight, FileUp } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getClientRoleInfo } from '@/lib/role-auth';

export default function IndicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    // Non-admin users go to simple view
    if (!isAdmin) {
      router.replace('/indices/view');
    }
  }, [session, status, router, isAdmin]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3 text-gray-900">
          <div className="p-2 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          Price Indices
        </h1>
        <p className="text-gray-600 mt-2">Manage PVC calculation indices</p>
      </div>

      {/* Two Main Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* View & Add Indices */}
        <Card 
          className="cursor-pointer hover:shadow-xl transition-all border-2 hover:border-blue-500"
          onClick={() => router.push('/indices/spreadsheet')}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-blue-100 rounded-xl">
                <FileSpreadsheet className="h-8 w-8 text-blue-600" />
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-xl mb-2">View & Add Indices</CardTitle>
            <CardDescription className="text-base">
              View all price indices in spreadsheet format and add new values
            </CardDescription>
          </CardContent>
        </Card>

        {/* Fuel Prices */}
        <Card 
          className="cursor-pointer hover:shadow-xl transition-all border-2 hover:border-red-500"
          onClick={() => router.push('/indices/fuel-prices')}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-red-100 rounded-xl">
                <Fuel className="h-8 w-8 text-red-600" />
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-xl mb-2">PPAC Diesel Prices</CardTitle>
            <CardDescription className="text-base">
              View and import daily diesel prices from PPAC
            </CardDescription>
          </CardContent>
        </Card>

        {/* Steel JPC Import */}
        <Card 
          className="cursor-pointer hover:shadow-xl transition-all border-2 hover:border-purple-500"
          onClick={() => router.push('/indices/steel-import')}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-purple-100 rounded-xl">
                <FileUp className="h-8 w-8 text-purple-600" />
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-xl mb-2">Import Steel (JPC)</CardTitle>
            <CardDescription className="text-base">
              Extract Chennai steel prices from JPC PDF or enter manually
            </CardDescription>
          </CardContent>
        </Card>

        {/* Component Documents */}
        <Card 
          className="cursor-pointer hover:shadow-xl transition-all border-2 hover:border-green-500"
          onClick={() => router.push('/indices/component-documents')}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-green-100 rounded-xl">
                <FileText className="h-8 w-8 text-green-600" />
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-xl mb-2">Component Documents</CardTitle>
            <CardDescription className="text-base">
              Upload Labour Index and other component PDFs
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
