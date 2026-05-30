const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- Testing ReportTemplate Prisma CRUD operations ---');
  
  // 1. Get first user in DB to attach the template
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('❌ No user found in DB! Cannot test template creation.');
    process.exit(1);
  }
  console.log(`Using User: ${user.name} (${user.email}) [ID: ${user.id}]`);

  // 2. Create template
  console.log('Creating test template...');
  const template = await prisma.reportTemplate.create({
    data: {
      userId: user.id,
      name: 'Test GCC Report Template ' + Date.now(),
      description: 'Prisma validation test template',
      isDefault: false,
      isGlobal: false,
      sections: {
        contractDetails: true,
        workClassification: true,
        allBillsTable: true,
        monthlyIndices: true,
        pvcCalculation: true,
        componentIndexDocuments: true
      },
      fields: {
        contractDetails: {
          agreementNo: true,
          loaNo: true,
          contractorName: true
        },
        workClassification: {
          code: true,
          name: true
        },
        pvcCalculation: {
          summary: true,
          componentWise: true
        }
      }
    }
  });
  console.log('✅ Template created successfully with ID:', template.id);

  // 3. Fetch template
  console.log('Fetching template back from DB...');
  const fetched = await prisma.reportTemplate.findUnique({
    where: { id: template.id }
  });
  if (fetched && fetched.name === template.name) {
    console.log('✅ Template fetched and matches original name:', fetched.name);
    console.log('Sections JSON field parsed correctly:', fetched.sections);
    console.log('Fields JSON field parsed correctly:', fetched.fields);
  } else {
    console.log('❌ Template fetch failed or data mismatch!');
  }

  // 4. Delete template
  console.log('Deleting test template...');
  await prisma.reportTemplate.delete({
    where: { id: template.id }
  });
  console.log('✅ Test template deleted successfully.');
  
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error during test run:', err);
  process.exit(1);
});
