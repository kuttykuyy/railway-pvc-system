/**
 * External API Documentation Page
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Key, FileText, ArrowRight, ExternalLink, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export default function ExternalApiDocsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">External API Documentation</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Integrate irpvc.in with external applications like primerp.in
        </p>
      </div>
      
      {/* Quick Start */}
      <Card className="mb-8 bg-gradient-to-r from-emerald-50 to-emerald-50 dark:from-emerald-950 dark:to-emerald-950 border-emerald-200 dark:border-emerald-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600" />
            Quick Start
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">1</span>
              <div>
                <span className="font-medium">Create an API Key</span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Go to <Link href="/settings/api-keys" className="text-emerald-600 hover:underline">Settings → API Keys</Link> and create a new key
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">2</span>
              <div>
                <span className="font-medium">Configure Your External App</span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Add the API key to your external app (e.g., primerp.in)
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">3</span>
              <div>
                <span className="font-medium">Start Making API Calls</span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Use the endpoints below to list contracts and create bills
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
      
      {/* Authentication */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Authentication
          </CardTitle>
          <CardDescription>
            All API requests require authentication via API key
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">Include your API key in the request header:</p>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 overflow-x-auto">
            <pre>{`Authorization: Bearer irpvc_your_api_key_here

# OR

X-API-Key: irpvc_your_api_key_here`}</pre>
          </div>
        </CardContent>
      </Card>
      
      {/* Base URL */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Base URL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <code className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg font-mono">
            https://irpvc.in/api/external
          </code>
        </CardContent>
      </Card>
      
      {/* Endpoints */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Endpoints</h2>
        
        <Tabs defaultValue="contracts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          </TabsList>
          
          {/* Contracts Tab */}
          <TabsContent value="contracts" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-100 text-green-800">GET</Badge>
                  <code className="font-mono text-lg">/contracts</code>
                </div>
                <CardDescription>List all contracts for the authenticated user</CardDescription>
              </CardHeader>
              <CardContent>
                <h4 className="font-semibold mb-2">Query Parameters</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Parameter</th>
                        <th className="text-left py-2">Type</th>
                        <th className="text-left py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2"><code>page</code></td>
                        <td className="py-2">integer</td>
                        <td className="py-2">Page number (default: 1)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>limit</code></td>
                        <td className="py-2">integer</td>
                        <td className="py-2">Items per page (default: 20, max: 100)</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code>search</code></td>
                        <td className="py-2">string</td>
                        <td className="py-2">Search by agreement no, contractor name, or description</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <h4 className="font-semibold mt-6 mb-2">Example Response</h4>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 overflow-x-auto">
                  <pre>{`{
  "success": true,
  "data": [
    {
      "id": "clxyz123",
      "agreementNo": "SR/TPJ/Civil/2025/0067",
      "contractorName": "ABC Constructions",
      "workDescription": "Civil works",
      "baseMonth": "2024-01-01T00:00:00Z",
      "loaDate": "2024-02-15T00:00:00Z",
      "billCount": 5
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}`}</pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Bills Tab */}
          <TabsContent value="bills" className="mt-4 space-y-4">
            {/* GET Bills */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-100 text-green-800">GET</Badge>
                  <code className="font-mono text-lg">/bills</code>
                </div>
                <CardDescription>List bills for the authenticated user</CardDescription>
              </CardHeader>
              <CardContent>
                <h4 className="font-semibold mb-2">Query Parameters</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Parameter</th>
                        <th className="text-left py-2">Type</th>
                        <th className="text-left py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2"><code>contractId</code></td>
                        <td className="py-2">string</td>
                        <td className="py-2">Filter by contract ID</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>page</code></td>
                        <td className="py-2">integer</td>
                        <td className="py-2">Page number (default: 1)</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code>limit</code></td>
                        <td className="py-2">integer</td>
                        <td className="py-2">Items per page (default: 20, max: 100)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            
            {/* POST Bills */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge className="bg-yellow-100 text-yellow-800">POST</Badge>
                  <code className="font-mono text-lg">/bills</code>
                </div>
                <CardDescription>Create a new PVC bill</CardDescription>
              </CardHeader>
              <CardContent>
                <h4 className="font-semibold mb-2">Request Body</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Field</th>
                        <th className="text-left py-2">Type</th>
                        <th className="text-left py-2">Required</th>
                        <th className="text-left py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2"><code>contractId</code></td>
                        <td className="py-2">string</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">Contract ID from /contracts endpoint</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>billNo</code></td>
                        <td className="py-2">string</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">Bill number (e.g., "RA-5")</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>grossBillAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">Total bill amount</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>billAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">Net amount for PVC calculation</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>dateOfMeasurement</code></td>
                        <td className="py-2">string</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">Date in ISO format (YYYY-MM-DD)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>cementAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Cement component amount (default: 0)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>steelTmtBarsAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Steel TMT bars amount (default: 0)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>steelAngleChannelAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Steel angle/channel amount (default: 0)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>steelPlatesAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Steel plates amount (default: 0)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>steelOtherSectionsAmount</code></td>
                        <td className="py-2">number</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Steel other sections amount (default: 0)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2"><code>isFinalPvc</code></td>
                        <td className="py-2">boolean</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Is this the final PVC bill? (default: false)</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code>zone</code></td>
                        <td className="py-2">string</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Railway zone</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <h4 className="font-semibold mt-6 mb-2">Example Request</h4>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 overflow-x-auto">
                  <pre>{`POST /api/external/bills
Authorization: Bearer irpvc_your_api_key_here
Content-Type: application/json

{
  "contractId": "clxyz123abc",
  "billNo": "RA-5",
  "grossBillAmount": 1500000,
  "billAmount": 1200000,
  "dateOfMeasurement": "2025-01-10",
  "cementAmount": 150000,
  "steelTmtBarsAmount": 200000
}`}</pre>
                </div>
                
                <h4 className="font-semibold mt-6 mb-2">Example Response</h4>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 overflow-x-auto">
                  <pre>{`{
  "success": true,
  "message": "Bill created successfully",
  "data": {
    "id": "clbill123",
    "billNo": "RA-5",
    "pvcNumber": "PVC/SR/TPJ/Civil/2025/0067/001",
    "grossBillAmount": 1500000,
    "billAmount": 1200000,
    "quarter": "Q4-2024",
    "dateOfMeasurement": "2025-01-10T00:00:00Z",
    "pvcCalculation": {
      "labourPvc": 15000,
      "cementPvc": 8500,
      "steelPvc": 12000,
      "fuelPvc": 3500,
      "totalPvc": 39000
    },
    "contract": {
      "id": "clxyz123abc",
      "agreementNo": "SR/TPJ/Civil/2025/0067",
      "contractorName": "ABC Constructions"
    },
    "links": {
      "view": "https://irpvc.in/bills/clbill123",
      "pdf": "https://irpvc.in/api/bills/clbill123/pdf-report"
    }
  }
}`}</pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5" />
                  <span className="font-semibold">Managing API Keys</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4">
                  API keys can be managed from the <Link href="/settings/api-keys" className="text-emerald-600 hover:underline">Settings → API Keys</Link> page.
                </p>
                <h4 className="font-semibold mb-2">Available Scopes</h4>
                <ul className="space-y-2 text-sm">
                  <li><code className="bg-gray-100 px-2 py-1 rounded">*</code> - Full access to all endpoints</li>
                  <li><code className="bg-gray-100 px-2 py-1 rounded">bills:read</code> - Read bills</li>
                  <li><code className="bg-gray-100 px-2 py-1 rounded">bills:create</code> - Create bills</li>
                  <li><code className="bg-gray-100 px-2 py-1 rounded">contracts:read</code> - Read contracts</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Error Codes */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Error Codes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">HTTP Status</th>
                  <th className="text-left py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2"><Badge variant="destructive">400</Badge></td>
                  <td className="py-2">Bad Request - Invalid or missing parameters</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2"><Badge variant="destructive">401</Badge></td>
                  <td className="py-2">Unauthorized - Invalid or missing API key</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2"><Badge variant="destructive">402</Badge></td>
                  <td className="py-2">Payment Required - Insufficient credits</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2"><Badge variant="destructive">403</Badge></td>
                  <td className="py-2">Forbidden - Access denied to resource</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2"><Badge variant="destructive">404</Badge></td>
                  <td className="py-2">Not Found - Resource does not exist</td>
                </tr>
                <tr>
                  <td className="py-2"><Badge variant="destructive">500</Badge></td>
                  <td className="py-2">Internal Server Error - Something went wrong</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Support */}
      <Card className="mt-8 mb-8">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Need Help?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Contact us for API support or integration assistance.
              </p>
            </div>
            <Link href="/contact">
              <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                Contact Support
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
