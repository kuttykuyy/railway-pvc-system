import { logger } from './logger';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig, resolveStorageSettings } from './aws-config';

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
  // Read from the same resolution the client uses, so what is reported cannot drift from
  // what is actually in force. Every storage failure here has been a leftover AWS_*
  // variable outranking the Supabase one meant to be used, and a list of names alone
  // hides that.
  const { bucket, region, endpoint, overriddenBucket, overriddenRegion } = resolveStorageSettings();
  return {
    configured: isS3Configured(),
    initError: initError || null,
    // Bucket, region and endpoint are not secrets, and their VALUES are what must be
    // compared against the Supabase dashboard — the bucket must exist under exactly this
    // name, and Supabase checks the region as part of the signature.
    bucket,
    region,
    endpoint,
    regionIsAuto: !region,
    // Stale values still sitting in Vercel behind the ones in use. Harmless now, but worth
    // deleting so they cannot be mistaken for the live settings.
    overriddenBucket,
    overriddenRegion,
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

/**
 * Actually put a file in the bucket, read it back, and remove it.
 *
 * Signing an upload URL is pure arithmetic — it never contacts storage — so a bucket that
 * does not exist and a region that does not match both produce a perfectly valid-looking
 * URL that is then refused at the moment of upload. From the browser that refusal arrives
 * as a bare network failure, which is how a wrong bucket name came to be reported as a
 * file being too large.
 *
 * This does the round trip server-side and hands back what storage actually said, so the
 * cause can be read off rather than inferred.
 */
export async function testS3RoundTrip(): Promise<{
  ok: boolean;
  failedAt?: 'upload' | 'read-back' | 'cleanup';
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  hint?: string;
}> {
  if (!s3Client || useLocalFallback) {
    return { ok: false, failedAt: 'upload', errorMessage: initError || 'Storage is not configured.' };
  }

  const key = `${folderPrefix}connection-test/${Date.now()}.txt`;
  const describe = (error: any, failedAt: 'upload' | 'read-back' | 'cleanup') => {
    const errorCode = error?.name || error?.Code || undefined;
    const httpStatus = error?.$metadata?.httpStatusCode;
    // The two refusals that account for nearly every failure, each with a different fix.
    let hint: string | undefined;
    if (/NoSuchBucket/i.test(errorCode || '') || httpStatus === 404) {
      hint = `No bucket named "${bucketName}" exists at this endpoint. Create the bucket in Supabase under exactly that name, or correct SUPABASE_STORAGE_BUCKET.`;
    } else if (/SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/i.test(errorCode || '') || httpStatus === 403) {
      hint = 'Storage rejected the signature. Usually the region does not match the Supabase project, or the access key and secret are not the S3 access keys from Storage Settings.';
    }
    return { ok: false as const, failedAt, errorCode, errorMessage: String(error?.message || error), httpStatus, hint };
  };

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: 'irpvc storage check',
      ContentType: 'text/plain',
    }));
  } catch (error: any) {
    return describe(error, 'upload');
  }

  try {
    await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  } catch (error: any) {
    return describe(error, 'read-back');
  }

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
  } catch {
    // Uploading and reading worked, which is the question being asked. A leftover test
    // file is not worth reporting as a failure.
  }

  return { ok: true };
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
