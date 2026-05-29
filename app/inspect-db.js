const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- Inspecting Database for Bill Details Navigation ---');
  
  // 1. Find the bill
  const bill = await prisma.bill.findFirst({
    where: { billNo: 'NCR/NCRC/Civil/2024/0045/B1' },
    include: {
      contract: true
    }
  });

  if (!bill) {
    console.log('❌ Bill not found!');
    process.exit(0);
  }

  console.log('\n--- Bill Info ---');
  console.log('ID:', bill.id);
  console.log('Bill No:', bill.billNo);
  console.log('Contract ID:', bill.contractId);
  console.log('Contract Owner (userId):', bill.contract.userId);
  console.log('Agreement No:', bill.contract.agreementNo);

  // 2. Find all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  });

  console.log('\n--- Users list ---');
  users.forEach(u => {
    console.log(`- ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.role}`);
  });

  process.exit(0);
}

run().catch(console.error);
