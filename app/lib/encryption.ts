
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 10000;

// Get encryption key from environment
const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return key;
};

/**
 * Derives a key from the encryption key using PBKDF2
 */
function deriveKey(key: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(key, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Encrypts sensitive data
 * @param text - The plaintext to encrypt
 * @returns Encrypted string with format: salt:iv:authTag:encrypted
 */
export function encrypt(text: string): string {
  try {
    const key = getEncryptionKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = deriveKey(key, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: salt:iv:authTag:encrypted
    return [
      salt.toString('hex'),
      iv.toString('hex'),
      authTag.toString('hex'),
      encrypted
    ].join(':');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts encrypted data
 * @param encryptedData - The encrypted string with format: salt:iv:authTag:encrypted
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];
    
    const derivedKey = deriveKey(key, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Generates a secure random token
 * @param length - Length of the token in bytes (default: 32)
 * @returns Hex-encoded random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hashes a string using SHA-256
 * @param data - The data to hash
 * @returns Hex-encoded hash
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
