import { prisma } from '../lib/db';

async function main() {
  const count = await prisma.labourIndexDocument.count();
  console.log('Total labour index documents:', count);
  
  const docs = await prisma.labourIndexDocument.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log('Latest 10 documents:', JSON.stringify(docs, null, 2));
}

main().catch(console.error);
