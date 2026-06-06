import { logger } from './logger';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

let s3Client: S3Client | null = null;
let bucketName = '';
let folderPrefix = '';
let useLocalFallback = false;

try {
  s3Client = createS3Client();
  const config = getBucketConfig();
  bucketName = config.bucketName;
  folderPrefix = config.folderPrefix;
} catch (error) {
  logger.warn('⚠️ AWS S3 initialization failed. Falling back to local storage:', error);
  useLocalFallback = true;
}

/**
 * Helper to upload file to local storage fallback
 */
function uploadLocalFile(buffer: Buffer, key: string): string {
  try {
    const localDir = path.join(process.cwd(), 'public', 'uploads');
    const fullPath = path.join(localDir, key);
    
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    
    // Write buffer to file
    fs.writeFileSync(fullPath, buffer);
    logger.log(`✅ Saved file locally at: ${fullPath}`);
    return key;
  } catch (error) {
    console.error('❌ Local file upload fallback failed:', error);
    const innerError = error instanceof Error ? error.message : String(error);
    throw new Error(`Local storage write failed: ${innerError}`);
  }
}

export function isS3Configured(): boolean {
  return s3Client !== null && !useLocalFallback && !!bucketName;
}

export async function getUploadPresignedUrl(key: string, contentType: string, expiresIn: number = 3600): Promise<string> {
  if (useLocalFallback || !s3Client) {
    throw new Error('S3 client not initialized or running in local fallback mode');
  }
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function uploadFile(buffer: Buffer, fileName: string): Promise<string> {
  if (useLocalFallback || !s3Client) {
    // If not using S3, return virtual db path for database storage fallback
    return `db://${fileName}`;
  }
  
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: getContentType(fileName),
    });
    
    await s3Client.send(command);
    logger.log(`✅ Uploaded file to S3 at: ${fileName}`);
    return fileName;
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    // If S3 upload fails, fall back to database storage in serverless environments
    return `db://${fileName}`;
  }
}

/**
 * Get a signed URL for downloading/viewing a file (falls back to local absolute URL)
 * @param key S3 key (cloud_storage_path)
 * @param expiresIn URL expiration time in seconds (default 1 hour)
 * @returns Signed URL or local URL
 */
export async function getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  
  // If this is a database-backed file, route it to our new database streaming API
  if (key.startsWith('db://')) {
    return `${baseUrl}/api/public/uploads?key=${encodeURIComponent(key)}`;
  }

  // Check if file exists locally first (always prioritize local if it's there)
  const localFilePath = path.join(process.cwd(), 'public', 'uploads', key);
  if (fs.existsSync(localFilePath)) {
    return `${baseUrl}/uploads/${key}`;
  }

  if (useLocalFallback || !s3Client) {
    return `${baseUrl}/uploads/${key}`;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.warn(`⚠️ Failed to generate S3 URL for key ${key}, falling back to local URL:`, error);
    return `${baseUrl}/uploads/${key}`;
  }
}

/**
 * Delete a file from S3 and local storage
 * @param key S3 key (cloud_storage_path)
 */
export async function deleteFile(key: string): Promise<void> {
  // Try deleting local file
  try {
    const localFilePath = path.join(process.cwd(), 'public', 'uploads', key);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
      logger.log(`✅ Deleted local file at: ${localFilePath}`);
    }
  } catch (err) {
    console.error('Error deleting local file:', err);
  }

  if (useLocalFallback || !s3Client) {
    return;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    await s3Client.send(command);
  } catch (error) {
    console.error(`Error deleting file from S3:`, error);
  }
}

/**
 * Rename/move a file in S3
 * @param oldKey Old S3 key
 * @param newKey New S3 key
 */
export async function renameFile(oldKey: string, newKey: string): Promise<string> {
  // S3 doesn't support renaming, so we need to copy and delete
  // For simplicity, we'll just return the new key and handle this at the application level
  return newKey;
}

/**
 * Get content type from file name
 * @param fileName File name
 * @returns Content type
 */
function getContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const contentTypes: { [key: string]: string } = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  
  return contentTypes[ext || ''] || 'application/octet-stream';
}

