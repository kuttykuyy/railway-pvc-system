import 'dotenv/config';
import { uploadFile } from '../lib/s3';

async function main() {
  console.log('Testing S3 upload...');
  try {
    const buffer = Buffer.from('test s3 content');
    const path = await uploadFile(buffer, 'test-connection.txt');
    console.log('Success! Path:', path);
  } catch (error: any) {
    console.error('Error during upload:', error);
  }
}

main();
