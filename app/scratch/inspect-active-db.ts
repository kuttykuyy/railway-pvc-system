import { prisma } from '../lib/db';

async function main() {
  console.log('--- Inspecting active DB classifications ---');
  
  const subClasses = await prisma.subClassification.findMany({
    orderBy: { code: 'asc' }
  });
  
  console.log(`Found ${subClasses.length} subclassifications in DB:`);
  for (const sc of subClasses) {
    console.log(`- Code: ${sc.code} | Name: ${sc.name}`);
    console.log(`  Percentages: fixed: ${sc.fixed}%, labour: ${sc.labour}%, steel: ${sc.steel}%, cement: ${sc.cement}%, plant: ${sc.plantMachinery}%, fuel: ${sc.fuel}%, materials: ${sc.otherMaterials}%, explosives: ${sc.explosives}%`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
