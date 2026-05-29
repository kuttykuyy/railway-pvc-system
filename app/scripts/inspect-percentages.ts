import { prisma } from '../lib/db';

async function main() {
  console.log('--- Inspecting Component Percentages & Database values for Bill ---');
  
  const bill = await prisma.bill.findFirst({
    where: { billNo: 'NCR/NCRC/Civil/2024/0045/B1' },
    include: {
      classificationEntries: {
        include: {
          classification: true,
          subClassification: true
        }
      },
      pvcCalculation: true
    }
  });

  if (!bill) {
    console.error('❌ Target bill not found!');
    process.exit(1);
  }

  console.log('\n--- Bill Info ---');
  console.log('ID:', bill.id);
  console.log('Bill No:', bill.billNo);
  console.log('Bill Amount (allocated):', bill.classificationEntries.reduce((sum, e) => sum + e.amount, 0));

  console.log('\n--- Classification Entries in Database ---');
  for (const entry of bill.classificationEntries) {
    console.log(`- Entry ID: ${entry.id}`);
    console.log(`  Amount: ${entry.amount}`);
    console.log(`  Description: ${entry.description}`);
    console.log(`  SubClassification ID: ${entry.subClassificationId}`);
    if (entry.subClassification) {
      console.log(`  SubClassification Code: ${entry.subClassification.code} | Name: ${entry.subClassification.name}`);
      console.log(`  Percentages: Fixed: ${entry.subClassification.fixed}%, Labour: ${entry.subClassification.labour}%, Steel: ${entry.subClassification.steel}%, Cement: ${entry.subClassification.cement}%, Plant: ${entry.subClassification.plantMachinery}%, Fuel: ${entry.subClassification.fuel}%, Materials: ${entry.subClassification.otherMaterials}%, Explosives: ${entry.subClassification.explosives}%`);
    }
    console.log(`  Classification ID: ${entry.classificationId}`);
    if (entry.classification) {
      console.log(`  Classification Code: ${entry.classification.code} | Name: ${entry.classification.name}`);
      console.log(`  Percentages: Fixed: ${entry.classification.fixed}%, Labour: ${entry.classification.labour}%, Steel: ${entry.classification.steel}%, Cement: ${entry.classification.cement}%, Plant: ${entry.classification.plantMachinery}%, Fuel: ${entry.classification.fuel}%, Materials: ${entry.classification.otherMaterials}%, Explosives: ${entry.classification.explosives}%`);
    }
  }

  console.log('\n--- PvcCalculation Record in Database ---');
  if (bill.pvcCalculation) {
    console.log(JSON.stringify(bill.pvcCalculation, null, 2));
  } else {
    console.log('❌ No pvcCalculation record found for this bill.');
  }

  // Also query all classifications or sub-classifications in the system to check if there are others that mismatch
  const allSubClasses = await prisma.subClassification.findMany({
    include: {
      group: true
    }
  });
  console.log(`\nTotal SubClassifications: ${allSubClasses.length}`);
  
  // Let's print out all subclassifications code, name, and percentages
  allSubClasses.forEach(sc => {
    const sum = sc.fixed + sc.labour + sc.steel + sc.cement + sc.plantMachinery + sc.fuel + sc.otherMaterials + sc.explosives;
    console.log(`- Code: ${sc.code} | Group: ${sc.group.code} | Name: ${sc.name} | Total%: ${sum}`);
    if (sum !== 100) {
      console.log(`  ⚠️ WARNING: Sum of percentages is ${sum}%, expected 100%!`);
    }
  });

  const allLegacyClassifications = await prisma.classification.findMany();
  console.log(`\nTotal Legacy Classifications: ${allLegacyClassifications.length}`);
  allLegacyClassifications.forEach(c => {
    const sum = c.fixed + c.labour + c.steel + c.cement + c.plantMachinery + c.fuel + c.otherMaterials + c.explosives;
    console.log(`- Code: ${c.code} | Name: ${c.name} | Total%: ${sum}`);
    if (sum !== 100) {
      console.log(`  ⚠️ WARNING: Sum of percentages is ${sum}%, expected 100%!`);
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
