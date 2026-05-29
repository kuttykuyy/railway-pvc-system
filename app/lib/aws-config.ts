
import { S3Client } from '@aws-sdk/client-s3';

export interface BucketConfig {
  bucketName: string;
  folderPrefix: string;
}

export function getBucketConfig(): BucketConfig {
  const bucketName = process.env.AWS_BUCKET_NAME;
  const folderPrefix = process.env.AWS_FOLDER_PREFIX || '';
  
  if (!bucketName) {
    throw new Error('AWS_BUCKET_NAME environment variable is not set');
  }
  
  return {
    bucketName,
    folderPrefix
  };
}

export function createS3Client(): S3Client {
  return new S3Client({});
}
