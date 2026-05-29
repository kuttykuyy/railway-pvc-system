/**
 * API Key Management Endpoint
 * Allows users to create and manage their API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/payment-validation';
import { createApiKey, listApiKeys, deleteApiKey } from '@/lib/external-api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }
    
    const keys = await listApiKeys(user.id);
    
    return NextResponse.json({
      success: true,
      data: keys
    });
    
  } catch (error) {
    console.error('[APIKeys] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/external/api-keys
 * Create a new API key
 * 
 * Body:
 * - name: string (required) - Friendly name for the key
 * - description: string (optional) - Description
 * - scopes: string[] (optional) - Array of scopes (default: ['*'])
 * - expiresInDays: number (optional) - Days until expiration
 */
export async function POST(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { name, description, scopes, expiresInDays } = body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }
    
    // Calculate expiration date if specified
    let expiresAt: Date | undefined;
    if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }
    
    // Validate scopes
    const validScopes = ['*', 'bills:read', 'bills:create', 'contracts:read'];
    const requestedScopes = Array.isArray(scopes) ? scopes : ['*'];
    const invalidScopes = requestedScopes.filter(s => !validScopes.includes(s));
    
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${validScopes.join(', ')}` 
        },
        { status: 400 }
      );
    }
    
    const apiKey = await createApiKey(user.id, name.trim(), {
      description: description?.trim(),
      scopes: requestedScopes,
      expiresAt
    });
    
    return NextResponse.json({
      success: true,
      message: 'API key created successfully. Please save the key now - it will not be shown again!',
      data: {
        id: apiKey.id,
        key: apiKey.key, // Only shown once!
        name: apiKey.name,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      }
    }, { status: 201 });
    
  } catch (error) {
    console.error('[APIKeys] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/external/api-keys
 * Delete an API key
 * 
 * Query params:
 * - id: string (required) - ID of the key to delete
 */
export async function DELETE(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');
    
    if (!keyId) {
      return NextResponse.json(
        { success: false, error: 'Key ID is required' },
        { status: 400 }
      );
    }
    
    await deleteApiKey(keyId, user.id);
    
    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully'
    });
    
  } catch (error) {
    console.error('[APIKeys] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
