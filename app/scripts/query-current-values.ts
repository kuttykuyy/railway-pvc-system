import { prisma } from '../lib/db';

async function main() {
  console.log('🌱 Querying current DB values for 6A, 6D, and 9A...');

  const codes = ['6A', '6D', '9A'];

  for (const code of codes) {
    const dbSub = await prisma.subClassification.findUnique({
      where: { code }
    });

    if (dbSub) {
      console.log(`\nDB SubClassification for ${code}:`);
      console.log(`- ID: ${dbSub.id}`);
      console.log(`- Name: ${dbSub.name}`);
      console.log(`- Percentages: fixed: ${dbSub.fixed}%, labour: ${dbSub.labour}%, steel: ${dbSub.steel}%, cement: ${dbSub.cement}%, plant: ${dbSub.plantMachinery}%, fuel: ${dbSub.fuel}%, materials: ${dbSub.otherMaterials}%, explosives: ${dbSub.explosives}%`);
    } else {
      console.log(`\n❌ SubClassification ${code} NOT found in DB by code!`);
    }

    // Try finding by legacy classification table
    const dbLegacy = await prisma.classification.findUnique({
      where: { code }
    });

    if (dbLegacy) {
      console.log(`Legacy Classification for ${code}:`);
      console.log(`- ID: ${dbLegacy.id}`);
      console.log(`- Name: ${dbLegacy.name}`);
      console.log(`- Percentages: fixed: ${dbLegacy.fixed}%, labour: ${dbLegacy.labour}%, steel: ${dbLegacy.steel}%, cement: ${dbLegacy.cement}%, plant: ${dbLegacy.plantMachinery}%, fuel: ${dbLegacy.fuel}%, materials: ${dbLegacy.otherMaterials}%, explosives: ${dbLegacy.explosives}%`);
    } else {
      console.log(`Legacy Classification ${code} NOT found in DB by code!`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
