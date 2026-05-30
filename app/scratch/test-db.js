const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Testing connection to database...');
  try {
    const userCount = await prisma.user.count();
    console.log('✅ Connected! User count:', userCount);
    
    console.log('Testing query on LabourIndexDocument...');
    const docCount = await prisma.labourIndexDocument.count();
    console.log('✅ LabourIndexDocument count:', docCount);
  } catch (error) {
    console.error('❌ Error executing database operations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
