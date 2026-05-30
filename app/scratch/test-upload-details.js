const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { uploadFile, deleteFile } = require('../lib/s3');

async function run() {
  console.log('--- Test S3 Upload & DB Insert ---');
  const dummyBuffer = Buffer.from('%PDF-1.4 dummy pdf content');
  const dummyS3Key = 'component-indices/labour/test-file.pdf';
  
  let cloudStoragePath = '';
  try {
    console.log('Testing uploadFile...');
    cloudStoragePath = await uploadFile(dummyBuffer, dummyS3Key);
    console.log('✅ uploadFile succeeded! cloudStoragePath:', cloudStoragePath);
  } catch (error) {
    console.error('❌ uploadFile failed:', error);
  }

  if (cloudStoragePath) {
    let createdDocId = null;
    try {
      console.log('Fetching first user in database...');
      const user = await prisma.user.findFirst();
      if (!user) {
        throw new Error('No user found in database to link as uploader');
      }
      console.log(`Using user: ${user.email} (${user.id})`);

      console.log('Testing prisma.labourIndexDocument.create...');
      const newDoc = await prisma.labourIndexDocument.create({
        data: {
          componentType: 'LABOUR',
          year: 2024,
          months: [1, 2, 3],
          fileName: 'test-file.pdf',
          cloudStoragePath: cloudStoragePath,
          uploadedBy: user.id,
        },
      });
      createdDocId = newDoc.id;
      console.log('✅ prisma.labourIndexDocument.create succeeded! Doc ID:', createdDocId);
    } catch (error) {
      console.error('❌ prisma.labourIndexDocument.create failed:', error);
    }

    if (createdDocId) {
      try {
        console.log('Cleaning up: deleting created doc from database...');
        await prisma.labourIndexDocument.delete({
          where: { id: createdDocId },
        });
        console.log('✅ Deleted doc from database.');
      } catch (error) {
        console.error('❌ Failed to delete doc from database:', error);
      }
    }

    try {
      console.log('Cleaning up: deleting file from storage...');
      await deleteFile(cloudStoragePath);
      console.log('✅ Deleted file from storage.');
    } catch (error) {
      console.error('❌ Failed to delete file from storage:', error);
    }
  }

  await prisma.$disconnect();
}

run();
