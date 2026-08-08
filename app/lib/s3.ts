import { logger } from './logger';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

let s3Client: S3Client | null = null;
let bucketName = '';
let folderPrefix = '';
let useLocalFallback = false;

let initError = '';

try {
  s3Client = createS3Client();
  const config = getBucketConfig();
  bucketName = config.bucketName;
  folderPrefix = config.folderPrefix;
} catch (error: any) {
  logger.warn('⚠️ AWS S3 initialization failed. Database fallback will be used for uploads:', error);
  useLocalFallback = true;
  initError = String(error?.message || error);
}

export function isS3Configured(): boolean {
  return s3Client !== null && !useLocalFallback && !!bucketName;
}

/**
 * Why storage is off, when it is.
 *
 * The failure above is swallowed and everything falls back to storing files in the
 * database, so a mistyped variable, one set only for Preview, and none at all all look
 * identical from outside — the file is simply squeezed and the quality suffers. This
 * reports which variables are PRESENT (never their values) and what the failure said,
 * so the cause can be read rather than guessed at.
 */
export function getS3Diagnostics() {
  const present = (...names: string[]) => names.filter(n => !!process.env[n]);
  return {
    configured: isS3Configured(),
    initError: initError || null,
    bucketSetVia: present('AWS_BUCKET_NAME', 'S3_BUCKET_NAME', 'SUPABASE_STORAGE_BUCKET'),
    endpointSetVia: present('S3_ENDPOINT_URL', 'SUPABASE_S3_ENDPOINT'),
    regionSetVia: present('AWS_REGION', 'S3_REGION', 'SUPABASE_REGION'),
    credentialsSetVia: present('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'),
    // A leftover AWS_PROFILE used to win over the keys and send the SDK looking for a
    // credentials file that does not exist on Vercel. The client now passes the keys
    // explicitly, so this is only worth flagging as clutter.
    awsProfileAlsoSet: !!process.env.AWS_PROFILE,
    // The endpoint is not a secret and its shape is the commonest mistake — a Supabase
    // endpoint must keep its /storage/v1/s3 path.
    endpointLooksRight: (() => {
      const endpoint = process.env.S3_ENDPOINT_URL || process.env.SUPABASE_S3_ENDPOINT;
      if (!endpoint) return null;
      if (/supabase/i.test(endpoint)) return /\/storage\/v1\/s3\/?$/.test(endpoint);
      return true;
    })(),
  };
}

export async function getUploadPresignedUrl(key: string, contentType: string, expiresIn: number = 3600): Promise<string> {
  if (useLocalFallback || !s3Client) {
    throw new Error('S3 client not initialized or running in database fallback mode');
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
    // If S3 is not available, store the file in the database instead of exposing
    // it on the public filesystem.
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
    // Fall back to database storage in serverless environments. Never write to
    // the public web root.
    return `db://${fileName}`;
  }
}

/**
 * Get a signed URL for downloading/viewing a file.
 * Database-backed files are always served through the authenticated
 * /api/public/uploads endpoint. S3-backed files use presigned URLs.
 */
export async function getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';

  // Database-backed files are served through the authenticated streaming API.
  if (key.startsWith('db://')) {
    return `${baseUrl}/api/public/uploads?key=${encodeURIComponent(key)}`;
  }

  if (useLocalFallback || !s3Client) {
    throw new Error('S3 is not configured and no local public fallback is available');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.warn(`⚠️ Failed to generate S3 URL for key ${key}:`, error);
    throw new Error('Failed to generate file URL');
  }
}

/**
 * Delete a file from S3. Database-backed files are removed by the caller
 * when the associated database record is deleted.
 */
export async function deleteFile(key: string): Promise<void> {
  if (key.startsWith('db://')) {
    // Database-backed files are deleted with their owning record.
    return;
  }

  if (useLocalFallback || !s3Client) {
    logger.warn(`⚠️ S3 not configured; cannot delete file ${key}`);
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
