import { prisma } from '../lib/db';

async function main() {
  const groups = await prisma.classificationGroup.findMany({
    include: {
      subClassifications: true
    }
  });
  console.log('Total Classification Groups:', groups.length);
  groups.forEach(group => {
    console.log(`\n${group.code} - ${group.name}`);
    console.log(`  Sub-classifications: ${group.subClassifications.length}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
