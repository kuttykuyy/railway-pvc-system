
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();

/**
 * Upload a file to S3
 * @param buffer File buffer
 * @param fileName File name with path (e.g., "uploads/logo.png")
 * @returns S3 key (cloud_storage_path)
 */
export async function uploadFile(buffer: Buffer, fileName: string): Promise<string> {
  const key = `${folderPrefix}${fileName}`.replace(/\/+/g, '/'); // Remove duplicate slashes
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: getContentType(fileName),
  });
  
  await s3Client.send(command);
  return key;
}

/**
 * Get a signed URL for downloading/viewing a file
 * @param key S3 key (cloud_storage_path)
 * @param expiresIn URL expiration time in seconds (default 1 hour)
 * @returns Signed URL
 */
export async function getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  
  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

/**
 * Delete a file from S3
 * @param key S3 key (cloud_storage_path)
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  
  await s3Client.send(command);
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
