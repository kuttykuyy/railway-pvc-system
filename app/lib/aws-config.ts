
import { S3Client } from '@aws-sdk/client-s3';

export interface BucketConfig {
  bucketName: string;
  folderPrefix: string;
}

/**
 * Where a setting came from, so the winner can be reported and not just used.
 *
 * Which variable wins has been the cause of every storage failure here: AWS_PROFILE beat
 * the access keys, then AWS_BUCKET_NAME and AWS_REGION beat the Supabase pair and sent an
 * old AbacusAI bucket in us-west-2 to Supabase's address, where no such bucket exists.
 */
export interface ResolvedSetting {
  value: string;
  from: string;
}

function firstSet(names: string[]): ResolvedSetting | null {
  const from = names.find(n => !!process.env[n]);
  return from ? { value: process.env[from]!, from } : null;
}

/**
 * Settings in the order they should be trusted.
 *
 * When an endpoint points storage somewhere other than Amazon, the SUPABASE_* names are
 * believed ahead of the AWS_* ones. Anything left in an AWS_* variable then belongs to a
 * bucket that is not the one being addressed, so preferring it can only ever be wrong —
 * and leaving it to win means a stale value silently replaces the correct one sitting
 * right beside it.
 */
export function resolveStorageSettings() {
  const endpoint = firstSet(['S3_ENDPOINT_URL', 'SUPABASE_S3_ENDPOINT']);
  const bucketNames = ['AWS_BUCKET_NAME', 'S3_BUCKET_NAME', 'SUPABASE_STORAGE_BUCKET'];
  const regionNames = ['AWS_REGION', 'S3_REGION', 'SUPABASE_REGION'];
  if (endpoint) {
    bucketNames.reverse();
    regionNames.reverse();
  }
  return {
    endpoint,
    bucket: firstSet(bucketNames),
    region: firstSet(regionNames),
    // Named so a leftover value can be seen sitting behind the one in use.
    overriddenBucket: endpoint ? firstSet(['AWS_BUCKET_NAME', 'S3_BUCKET_NAME']) : null,
    overriddenRegion: endpoint ? firstSet(['AWS_REGION', 'S3_REGION']) : null,
  };
}

export function getBucketConfig(): BucketConfig {
  const bucketName = resolveStorageSettings().bucket?.value;
  const folderPrefix = process.env.AWS_FOLDER_PREFIX || process.env.S3_FOLDER_PREFIX || '';

  if (!bucketName) {
    throw new Error('Bucket name is not set. Set SUPABASE_STORAGE_BUCKET, S3_BUCKET_NAME, or AWS_BUCKET_NAME.');
  }

  return {
    bucketName,
    folderPrefix
  };
}

export function createS3Client(): S3Client {
  const settings = resolveStorageSettings();
  const endpoint = settings.endpoint?.value;
  const region = settings.region?.value || 'auto';

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region,
    // Since SDK v3.729 every signed upload URL demands a CRC32 checksum header unless
    // told otherwise. The server's own uploads still work — the SDK computes the checksum
    // as it sends — but a browser PUT to such a URL arrives without the promised header
    // and is refused. Server fine, browser dead, deterministically: exactly the split
    // seen here. Amazon's own guidance for S3-compatible stores (Supabase included) is to
    // require checksums only where the operation itself does.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };

  // Hand the SDK the keys directly when we have them, rather than leaving it to hunt
  // through its own credential chain.
  //
  // That chain prefers AWS_PROFILE when it is set, and a profile means a credentials
  // FILE — which does not exist on Vercel. With AWS_PROFILE left over in the
  // environment, a correct access key and secret sitting right beside it were ignored
  // and every upload failed with "Could not load credentials from any providers", which
  // the app then reported as a file-size problem.
  //
  // Falls back to the chain when no keys are set, so a deployment using an instance role
  // still works.
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  }

  if (endpoint) {
    clientConfig.endpoint = endpoint;
    // Supabase Storage and other S3-compatible services typically expect path-style URLs
    clientConfig.forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';
  }

  return new S3Client(clientConfig);
}
