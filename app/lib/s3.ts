import { logger } from './logger';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig, resolveStorageSettings } from './aws-config';
import { emailLinkOrigin } from './email-link-origin';

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
  existingBuckets?: string[];
}> {
  if (!s3Client || useLocalFallback) {
    return { ok: false, failedAt: 'upload', errorMessage: initError || 'Storage is not configured.' };
  }

  // No folderPrefix: real uploads do not apply one, and a test that writes somewhere
  // uploads never go can pass while every upload fails. A diagnostic has to exercise
  // the path being diagnosed.
  const key = `connection-test/${Date.now()}.txt`;

  /**
   * The names storage will actually answer to.
   *
   * "No such bucket" leaves open whether the bucket has yet to be made or is simply
   * spelled differently here, and those need opposite fixes. The real list settles it.
   */
  const listBucketNames = async (): Promise<string[] | null> => {
    try {
      const result = await s3Client!.send(new ListBucketsCommand({}));
      return (result.Buckets ?? []).map(b => b.Name!).filter(Boolean);
    } catch {
      // Some keys may upload without being allowed to list. Not knowing is no worse
      // than before.
      return null;
    }
  };

  const describe = async (error: any, failedAt: 'upload' | 'read-back' | 'cleanup') => {
    const errorCode = error?.name || error?.Code || undefined;
    const httpStatus = error?.$metadata?.httpStatusCode;
    // The two refusals that account for nearly every failure, each with a different fix.
    let hint: string | undefined;
    let existingBuckets: string[] | undefined;
    if (/NoSuchBucket/i.test(errorCode || '') || httpStatus === 404) {
      const names = await listBucketNames();
      existingBuckets = names ?? undefined;
      if (names && names.length) {
        hint = `No bucket named "${bucketName}" here. Storage does have: ${names.join(', ')}. Either set SUPABASE_STORAGE_BUCKET to one of those, or create "${bucketName}" in Supabase.`;
      } else if (names) {
        hint = `This project has no storage buckets at all yet. Create one in Supabase named "${bucketName}".`;
      } else {
        hint = `No bucket named "${bucketName}" exists at this endpoint. Create it in Supabase under exactly that name, or correct SUPABASE_STORAGE_BUCKET.`;
      }
    } else if (/SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/i.test(errorCode || '') || httpStatus === 403) {
      hint = 'Storage rejected the signature. Usually the region does not match the Supabase project, or the access key and secret are not the S3 access keys from Storage Settings.';
    } else if (httpStatus === 410) {
      // The Supabase project itself is gone. The endpoint answers 410 with the plain
      // text "Project removed.", which the AWS SDK tries to parse as XML and reports as
      // `char 'P' is not expected` — a message about the letter P, for a deleted
      // project. Every file that was in the bucket went with it, and no key, region or
      // bucket name will bring it back: storage has to be pointed at a live project.
      hint = 'The Supabase project behind SUPABASE_S3_ENDPOINT no longer exists — it answers '
        + '"Project removed." Nothing here can be fixed by changing keys or the bucket name. '
        + 'Point SUPABASE_S3_ENDPOINT, SUPABASE_STORAGE_BUCKET, SUPABASE_SERVICE_ROLE_KEY and '
        + 'the S3 access keys at a project that still exists. Files that were in the old '
        + 'bucket are gone with it.';
    }
    return { ok: false as const, failedAt, errorCode, errorMessage: String(error?.message || error), httpStatus, hint, existingBuckets };
  };

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: 'irpvc storage check',
      ContentType: 'text/plain',
    }));
  } catch (error: any) {
    return await describe(error, 'upload');
  }

  try {
    await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  } catch (error: any) {
    return await describe(error, 'read-back');
  }

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
  } catch {
    // Uploading and reading worked, which is the question being asked. A leftover test
    // file is not worth reporting as a failure.
  }

  return { ok: true };
}

/**
 * Uploading a scanned sheet in pieces, so a dropped connection costs one piece.
 *
 * A 16 MB sheet sent as a single PUT lives or dies on one unbroken transfer, and on an
 * unsteady connection it died — twice in a row, retry included. Multipart turns that
 * all-or-nothing bet into 5 MB instalments: each part is retried on its own, and a
 * stumble repeats one part instead of starting the whole file over.
 *
 * The browser never reports the parts it sent — the server asks storage directly which
 * parts arrived (ListParts) before sealing the file, so the completion can't be spoofed
 * into a file with holes, and the ETag headers CORS may withhold are never needed.
 */
export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  if (useLocalFallback || !s3Client) {
    throw new Error('S3 client not initialized or running in database fallback mode');
  }
  const result = await s3Client.send(new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  }));
  if (!result.UploadId) throw new Error('Storage did not return an upload id');
  return result.UploadId;
}

export async function getPartPresignedUrl(key: string, uploadId: string, partNumber: number, expiresIn: number = 3600): Promise<string> {
  if (useLocalFallback || !s3Client) {
    throw new Error('S3 client not initialized or running in database fallback mode');
  }
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function completeMultipartUpload(key: string, uploadId: string, expectedParts: number): Promise<void> {
  if (useLocalFallback || !s3Client) {
    throw new Error('S3 client not initialized or running in database fallback mode');
  }
  // Ask storage what actually arrived rather than trusting the browser's account of
  // itself. A part that went missing turns up here as a gap, before the file is sealed.
  const listed = await s3Client.send(new ListPartsCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
  }));
  const parts = (listed.Parts ?? [])
    .filter(p => p.PartNumber != null && p.ETag)
    .sort((a, b) => a.PartNumber! - b.PartNumber!);
  if (parts.length !== expectedParts) {
    throw new Error(`Storage received ${parts.length} of ${expectedParts} parts — the file would have holes.`);
  }
  await s3Client.send(new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
    },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  if (useLocalFallback || !s3Client) return;
  try {
    await s3Client.send(new AbortMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      UploadId: uploadId,
    }));
  } catch (error) {
    // Abandoned parts cost a little storage until cleaned up; failing the caller over
    // them would turn tidying into a second error.
    logger.warn(`⚠️ Could not abort multipart upload for ${key}:`, error);
  }
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

/** So a browser-side probe can tidy up after itself without a server round trip. */
export async function getDeletePresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  if (useLocalFallback || !s3Client) {
    throw new Error('S3 client not initialized or running in database fallback mode');
  }
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * The largest file the database will hold, for the migration that pulls a document out
 * of storage. Not a preference: Supabase counts egress across the database as well as
 * storage, so a row is no cheaper to read than an object — and base64 is a third larger
 * than the file it encodes. Files belong in storage; this bound exists only so the
 * migration refuses to put something absurd in a column.
 */
export const DB_STORAGE_MAX_BYTES = 6 * 1024 * 1024;

export async function uploadFile(buffer: Buffer, fileName: string): Promise<string> {
  const contentType = getContentType(fileName);

  /**
   * The other door, tried before giving up on the bucket entirely.
   *
   * Supabase Storage has two: the S3 protocol one, and the REST one their own client
   * uses. This code has always used S3 for server transfers on the grounds that it
   * works — and in production it stopped, answering 410 Gone to every upload with a
   * body the SDK could not even parse ("char 'P' is not expected"). Falling straight to
   * the database from there means large files are simply lost, so the REST door gets a
   * turn first. It is the same bucket; only the doorway differs.
   */
  const viaRest = async (): Promise<string | null> => {
    try {
      const { isRestUploadAvailable, restUploadFile } = await import('./supabase-storage');
      if (!isRestUploadAvailable()) return null;
      const ok = await restUploadFile(bucketName, fileName, buffer, contentType);
      if (!ok) return null;
      logger.log(`✅ Uploaded file through the Supabase REST door at: ${fileName}`);
      return fileName;
    } catch (error) {
      console.error('❌ REST upload failed:', error);
      return null;
    }
  };

  if (useLocalFallback || !s3Client) {
    // No S3 client at all — but the REST door needs only the service key, and may well
    // be configured when the S3 one is not.
    return (await viaRest()) ?? `db://${fileName}`;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    logger.log(`✅ Uploaded file to S3 at: ${fileName}`);
    return fileName;
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    // The bucket is not necessarily unreachable — that door is. Try the other one
    // before falling back to the database, where anything over a few megabytes is
    // dropped rather than kept.
    return (await viaRest()) ?? `db://${fileName}`;
  }
}

/**
 * Is this object actually in the bucket?
 *
 * Needed after the storage project was deleted: the database still holds the key of
 * every file that was in the old bucket, and nothing in the row itself says the file
 * behind it is gone. Only asking storage settles it.
 *
 * Three answers, not two. "Present", "missing", and "could not tell" — a network
 * failure or a refused credential is not evidence that a file is gone, and reporting it
 * as gone would send somebody re-uploading files that are sitting there.
 */
export async function objectExists(key: string): Promise<'present' | 'missing' | 'unknown'> {
  if (!key || key.startsWith('db://')) return 'present';
  if (useLocalFallback || !s3Client) return 'unknown';
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return 'present';
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    const name = String(error?.name || '');
    if (status === 404 || /NotFound|NoSuchKey/i.test(name)) return 'missing';
    return 'unknown';
  }
}

/**
 * Get a signed URL for downloading/viewing a file.
 * Database-backed files are always served through the authenticated
 * /api/public/uploads endpoint. S3-backed files use presigned URLs.
 */
export async function getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  // The site's own address: this URL is handed to a person to click. NEXTAUTH_URL names
  // the platform host on this deployment, which is a link to a domain they cannot use.
  const baseUrl = emailLinkOrigin();

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
    // Same reasoning as the upload: the file is in the bucket, and if the S3 door will
    // not sign for it the REST door will. A file that cannot be handed back is a file
    // that might as well not have been kept.
    try {
      const { isRestUploadAvailable, createRestSignedDownloadUrl } = await import('./supabase-storage');
      if (isRestUploadAvailable()) return await createRestSignedDownloadUrl(bucketName, key, expiresIn);
    } catch (restError) {
      logger.warn(`⚠️ REST signing also failed for key ${key}:`, restError);
    }
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
