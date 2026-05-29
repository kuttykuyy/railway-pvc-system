'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Book, Code, Key, Lock } from 'lucide-react';

export default function ApiDocsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="text-muted-foreground mt-2">
          Complete guide to using the IR-PVC API for external applications
        </p>
      </div>

      {/* Getting Started */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Getting Started
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">1. Create an API Key</h3>
            <p className="text-sm text-muted-foreground">
              Go to Admin &gt; API Keys and generate a new API key. Save it securely as it will only be shown once.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">2. Authenticate Your Requests</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Include your API key in one of two ways:
            </p>
            <div className="bg-gray-50 p-4 rounded space-y-2">
              <p className="text-sm font-mono">Authorization: Bearer YOUR_API_KEY</p>
              <p className="text-sm text-muted-foreground">or</p>
              <p className="text-sm font-mono">X-API-Key: YOUR_API_KEY</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">3. Make API Calls</h3>
            <p className="text-sm text-muted-foreground">
              All public API endpoints are versioned and start with <code className="bg-gray-100 px-1 rounded">/api/v1/</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Base URL */}
      <Card>
        <CardHeader>
          <CardTitle>Base URL</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="text-sm bg-gray-100 p-3 rounded block">
            https://irpvc.in/api/v1
          </code>
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All API requests must include a valid API key. Unauthorized requests will return a 401 error.
          </p>

          <div>
            <h4 className="font-semibold mb-2">Example Request (cURL):</h4>
            <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto">
{`curl -X GET 'https://irpvc.in/api/v1/contracts' \\
  -H 'Authorization: Bearer YOUR_API_KEY'`}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Example Request (JavaScript):</h4>
            <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto">
{`const response = await fetch('https://irpvc.in/api/v1/contracts', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const data = await response.json();`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Available Endpoints
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contracts */}
          <div>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              📄 Contracts
            </h3>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-sm">/api/v1/contracts</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">List all contracts</p>
                <div className="text-xs">
                  <p className="font-semibold mb-1">Required Scope:</p>
                  <code className="bg-gray-100 px-2 py-1 rounded">contracts:read</code>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-sm">/api/v1/contracts/:id</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Get contract details with bills and extensions</p>
                <div className="text-xs">
                  <p className="font-semibold mb-1">Required Scope:</p>
                  <code className="bg-gray-100 px-2 py-1 rounded">contracts:read</code>
                </div>
              </div>
            </div>
          </div>

          {/* Bills */}
          <div>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              📋 Bills
            </h3>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-sm">/api/v1/bills</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">List all bills</p>
                <div className="text-xs space-y-2">
                  <div>
                    <p className="font-semibold mb-1">Required Scope:</p>
                    <code className="bg-gray-100 px-2 py-1 rounded">bills:read</code>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Query Parameters:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><code>contractId</code> - Filter by contract</li>
                      <li><code>status</code> - Filter by status (draft, pending, approved, rejected)</li>
                      <li><code>limit</code> - Number of results (default: 50, max: 200)</li>
                      <li><code>offset</code> - Pagination offset</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-sm">/api/v1/bills/:id</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Get complete bill details with PVC calculations</p>
                <div className="text-xs">
                  <p className="font-semibold mb-1">Required Scope:</p>
                  <code className="bg-gray-100 px-2 py-1 rounded">bills:read</code>
                </div>
              </div>
            </div>
          </div>

          {/* Indices */}
          <div>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              📊 Price Indices
            </h3>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-sm">/api/v1/indices</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Get price indices with monthly values</p>
                <div className="text-xs space-y-2">
                  <div>
                    <p className="font-semibold mb-1">Required Scope:</p>
                    <code className="bg-gray-100 px-2 py-1 rounded">indices:read</code>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Query Parameters:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><code>component</code> - Filter by component (LABOUR, CEMENT, TMT_BARS, etc.)</li>
                      <li><code>month</code> - Filter by month (YYYY-MM format)</li>
                      <li><code>isProvisional</code> - Filter by provisional status (true/false)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Response Format */}
      <Card>
        <CardHeader>
          <CardTitle>Response Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Success Response:</h4>
            <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto">
{`{
  "success": true,
  "count": 10,
  "data": [...]
}`}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Error Response:</h4>
            <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto">
{`{
  "error": "Error message"
}`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiting */}
      <Card>
        <CardHeader>
          <CardTitle>Rate Limiting</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            Each API key has a configurable rate limit (default: 100 requests per minute). Exceeding this limit will result in a 429 Too Many Requests error.
          </p>
          <p className="text-sm text-muted-foreground">
            Contact your administrator to adjust rate limits if needed.
          </p>
        </CardContent>
      </Card>

      {/* Scopes */}
      <Card>
        <CardHeader>
          <CardTitle>API Scopes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">contracts:read</Badge>
              <span className="text-sm text-muted-foreground">Access to contract data</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">bills:read</Badge>
              <span className="text-sm text-muted-foreground">Access to bill data</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">indices:read</Badge>
              <span className="text-sm text-muted-foreground">Access to price indices</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">*</Badge>
              <span className="text-sm text-muted-foreground">Full access to all resources</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <strong>Note:</strong> If no scopes are specified when creating an API key, it will have full access (*) by default.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
