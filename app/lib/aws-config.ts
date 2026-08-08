
import { S3Client } from '@aws-sdk/client-s3';

export interface BucketConfig {
  bucketName: string;
  folderPrefix: string;
}

export function getBucketConfig(): BucketConfig {
  const bucketName = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || process.env.SUPABASE_STORAGE_BUCKET;
  const folderPrefix = process.env.AWS_FOLDER_PREFIX || process.env.S3_FOLDER_PREFIX || '';

  if (!bucketName) {
    throw new Error('Bucket name is not set. Set AWS_BUCKET_NAME, S3_BUCKET_NAME, or SUPABASE_STORAGE_BUCKET.');
  }

  return {
    bucketName,
    folderPrefix
  };
}

export function createS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT_URL || process.env.SUPABASE_S3_ENDPOINT;
  const region = process.env.AWS_REGION || process.env.S3_REGION || process.env.SUPABASE_REGION || 'auto';

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region,
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
