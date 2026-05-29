/**
 * External API Authentication
 * Validates API keys for external apps like primerp.in
 */

import { prisma } from './db';
import crypto from 'crypto';

export interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  userName?: string;
  userEmail?: string;
  keyId?: string;
  scopes?: string[];
  error?: string;
}

/**
 * Hash an API key for storage/comparison
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 * Format: irpvc_[random 32 chars]
 */
export function generateApiKey(): { key: string; hashedKey: string } {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  const key = `irpvc_${randomPart}`;
  const hashedKey = hashApiKey(key);
  return { key, hashedKey };
}

/**
 * Validate an API key from request headers
 */
export async function validateExternalApiKey(
  request: Request,
  requiredScope?: string
): Promise<ApiKeyValidationResult> {
  try {
    // Get API key from header
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('X-API-Key');
    
    let apiKey: string | null = null;
    
    // Support both Authorization: Bearer <key> and X-API-Key: <key>
    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }
    
    if (!apiKey) {
      return {
        valid: false,
        error: 'Missing API key. Provide via Authorization: Bearer <key> or X-API-Key header'
      };
    }
    
    // Hash the key to compare with stored hash
    const hashedKey = hashApiKey(apiKey);
    
    // Find the API key in database
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });
    
    if (!apiKeyRecord) {
      return {
        valid: false,
        error: 'Invalid API key'
      };
    }
    
    // Check if key is active
    if (!apiKeyRecord.isActive) {
      return {
        valid: false,
        error: 'API key is deactivated'
      };
    }
    
    // Check expiration
    if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
      return {
        valid: false,
        error: 'API key has expired'
      };
    }
    
    // Check rate limit (simple implementation)
    // You can enhance this with a proper rate limiting system
    
    // Parse scopes
    const scopes = Array.isArray(apiKeyRecord.scopes) 
      ? apiKeyRecord.scopes as string[] 
      : [];
    
    // Check required scope if specified
    if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes('*')) {
      return {
        valid: false,
        error: `API key does not have required scope: ${requiredScope}`
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
      valid: true,
      userId: apiKeyRecord.user.id,
      userName: apiKeyRecord.user.name || undefined,
      userEmail: apiKeyRecord.user.email,
      keyId: apiKeyRecord.id,
      scopes
    };
    
  } catch (error) {
    console.error('[ExternalApiAuth] Validation error:', error);
    return {
      valid: false,
      error: 'API key validation failed'
    };
  }
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(
  userId: string,
  name: string,
  options?: {
    description?: string;
    scopes?: string[];
    expiresAt?: Date;
    rateLimit?: number;
  }
) {
  const { key, hashedKey } = generateApiKey();
  
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      key: hashedKey,
      description: options?.description,
      scopes: options?.scopes || ['*'], // Default to all scopes
      expiresAt: options?.expiresAt,
      rateLimit: options?.rateLimit || 100
    }
  });
  
  // Return the plaintext key only once (it won't be recoverable later)
  return {
    id: apiKey.id,
    key: key, // Plaintext key - show this to user only once!
    name: apiKey.name,
    scopes: apiKey.scopes,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt
  };
}

/**
 * Deactivate an API key
 */
export async function deactivateApiKey(keyId: string, userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId }
  });
  
  if (!apiKey) {
    throw new Error('API key not found or access denied');
  }
  
  return prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false }
  });
}

/**
 * Delete an API key
 */
export async function deleteApiKey(keyId: string, userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId }
  });
  
  if (!apiKey) {
    throw new Error('API key not found or access denied');
  }
  
  return prisma.apiKey.delete({
    where: { id: keyId }
  });
}

/**
 * List all API keys for a user (without the actual key values)
 */
export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      description: true,
      scopes: true,
      isActive: true,
      expiresAt: true,
      lastUsedAt: true,
      usageCount: true,
      rateLimit: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
}
