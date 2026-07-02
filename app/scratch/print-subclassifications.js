const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const subClasses = await prisma.subClassification.findMany({
    include: { group: true }
  });
  console.log(`Found ${subClasses.length} subclassifications:`);
  subClasses.forEach(sc => {
    console.log(`Code: ${sc.code} | Group: ${sc.group.code} | Name: ${sc.name} | Steel%: ${sc.steel}% | Cement%: ${sc.cement}%`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());