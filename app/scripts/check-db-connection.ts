import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkConnection() {
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT current_database(), current_user, version()`;
    console.log('✅ Database connected successfully');
    console.log(result);
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkConnection();
