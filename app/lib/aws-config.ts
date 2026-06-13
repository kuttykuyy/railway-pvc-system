
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

  if (endpoint) {
    clientConfig.endpoint = endpoint;
    // Supabase Storage and other S3-compatible services typically expect path-style URLs
    clientConfig.forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';
  }

  return new S3Client(clientConfig);
}
