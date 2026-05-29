import { encode as defaultEncode, decode as defaultDecode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';

/**
 * Custom JWT decode handler that catches decryption errors
 * and returns null instead of throwing
 */
export async function decode(params: any): Promise<JWT | null> {
  try {
    const decoded = await defaultDecode(params);
    return decoded;
  } catch (error: any) {
    // Log the error for debugging
    console.error('JWT decode error:', error?.message || error);
    
    // Return null to indicate invalid/expired token
    // This will cause NextAuth to treat the session as unauthenticated
    return null;
  }
}

/**
 * Custom JWT encode handler with error handling
 */
export async function encode(params: any): Promise<string> {
  try {
    const encoded = await defaultEncode(params);
    return encoded;
  } catch (error) {
    console.error('JWT encode error:', error);
    throw error;
  }
}
