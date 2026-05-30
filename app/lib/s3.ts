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
  console.warn('⚠️ AWS S3 initialization failed. Falling back to local storage:', error);
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
    console.log(`✅ Saved file locally at: ${fullPath}`);
    return key;
  } catch (error) {
    console.error('❌ Local file upload fallback failed:', error);
    throw new Error('Failed to upload file to local storage fallback');
  }
}

/**
 * Upload a file to S3 (falls back to local filesystem if credentials fail)
 * @param buffer File buffer
 * @param fileName File name with path (e.g., "uploads/logo.png")
 * @returns S3 key (cloud_storage_path)
 */
export async function uploadFile(buffer: Buffer, fileName: string): Promise<string> {
  const key = `${folderPrefix}${fileName}`.replace(/\/+/g, '/'); // Remove duplicate slashes
  
  if (useLocalFallback || !s3Client) {
    return uploadLocalFile(buffer, key);
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: getContentType(fileName),
    });
    
    await s3Client.send(command);
    return key;
  } catch (error) {
    console.warn(`⚠️ S3 upload failed for ${key}, falling back to local file storage:`, error);
    return uploadLocalFile(buffer, key);
  }
}

/**
 * Get a signed URL for downloading/viewing a file (falls back to local absolute URL)
 * @param key S3 key (cloud_storage_path)
 * @param expiresIn URL expiration time in seconds (default 1 hour)
 * @returns Signed URL or local URL
 */
export async function getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  // Check if file exists locally first (always prioritize local if it's there)
  const localFilePath = path.join(process.cwd(), 'public', 'uploads', key);
  if (fs.existsSync(localFilePath)) {
    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    return `${baseUrl}/uploads/${key}`;
  }

  if (useLocalFallback || !s3Client) {
    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
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
    console.warn(`⚠️ Failed to generate S3 URL for key ${key}, falling back to local URL:`, error);
    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
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
      console.log(`✅ Deleted local file at: ${localFilePath}`);
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
