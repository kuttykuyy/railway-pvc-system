const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting trial limit database update...');
  
  // Update the FREE_TRIAL_BILLS setting
  const setting = await prisma.adminSettings.upsert({
    where: { key: 'FREE_TRIAL_BILLS' },
    update: { value: '1' },
    create: {
      key: 'FREE_TRIAL_BILLS',
      value: '1',
      description: 'Number of free trial bills for new users',
      dataType: 'number'
    }
  });
  
  console.log('Database setting updated:', setting);
  
  // Find any active standard trial users whose freeTrialUsed >= 1 and disable their isTrialActive state
  const updatedUsers = await prisma.user.updateMany({
    where: {
      isTrialActive: true,
      freeTrialUsed: { gte: 1 },
      role: 'contractor',
      isFreeAccount: false
    },
    data: {
      isTrialActive: false
    }
  });
  
  console.log(`Updated ${updatedUsers.count} trial status records for existing users who already used 1 or more trial bills.`);
}

main()
  .catch((e) => {
    console.error('Error updating trial limit:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
