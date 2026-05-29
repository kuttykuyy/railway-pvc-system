import { NextRequest } from 'next/server';
import { prisma } from './db';
import crypto from 'crypto';

// Hash API key for lookup
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export interface ApiAuthResult {
  authenticated: boolean;
  userId?: string;
  userName?: string;
  userEmail?: string;
  apiKeyId?: string;
  scopes?: string[];
  error?: string;
}

// Verify API key from request headers
export async function verifyApiKey(request: NextRequest): Promise<ApiAuthResult> {
  try {
    // Get API key from header
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('X-API-Key');

    let apiKey: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      return {
        authenticated: false,
        error: 'No API key provided. Include in Authorization header as "Bearer <key>" or X-API-Key header'
      };
    }

    // Hash the provided key
    const hashedKey = hashApiKey(apiKey);

    // Look up the API key in database
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    if (!apiKeyRecord) {
      return {
        authenticated: false,
        error: 'Invalid API key'
      };
    }

    // Check if key is active
    if (!apiKeyRecord.isActive) {
      return {
        authenticated: false,
        error: 'API key is deactivated'
      };
    }

    // Check if key has expired
    if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
      return {
        authenticated: false,
        error: 'API key has expired'
      };
    }

    // Update last used timestamp and usage count
    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 }
      }
    });

    return {
      authenticated: true,
      userId: apiKeyRecord.userId,
      userName: apiKeyRecord.user.name || undefined,
      userEmail: apiKeyRecord.user.email,
      apiKeyId: apiKeyRecord.id,
      scopes: (apiKeyRecord.scopes as string[]) || []
    };
  } catch (error) {
    console.error('API key verification error:', error);
    return {
      authenticated: false,
      error: 'Internal server error during authentication'
    };
  }
}

// Check if API key has required scope
export function hasScope(authResult: ApiAuthResult, requiredScope: string): boolean {
  if (!authResult.authenticated || !authResult.scopes) {
    return false;
  }

  // If scopes array is empty, allow all access
  if (authResult.scopes.length === 0) {
    return true;
  }

  return authResult.scopes.includes(requiredScope) || authResult.scopes.includes('*');
}
