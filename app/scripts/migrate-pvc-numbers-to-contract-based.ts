
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migratePvcNumbers() {
  console.log('🔄 Migrating PVC numbers to contract-based format...');
  
  try {
    // Find all bills with existing PVC numbers
    const allBills = await prisma.bill.findMany({
      where: {
        pvcNumber: {
          not: null
        }
      },
      include: {
        contract: true
      },
      orderBy: [
        { contractId: 'asc' },
        { dateOfMeasurement: 'asc' }
      ]
    });
    
    console.log(`📊 Found ${allBills.length} bills with PVC numbers to migrate`);
    
    if (allBills.length === 0) {
      console.log('✅ No bills to migrate.');
      return;
    }
    
    // Group bills by contract
    const billsByContract: { [key: string]: any[] } = {};
    
    for (const bill of allBills) {
      const contractId = bill.contractId;
      
      if (!billsByContract[contractId]) {
        billsByContract[contractId] = [];
      }
      billsByContract[contractId].push(bill);
    }
    
    // Regenerate PVC numbers with contract-based sequential numbering
    let updatedCount = 0;
    
    for (const [contractId, bills] of Object.entries(billsByContract)) {
      const contract = bills[0].contract;
      console.log(`\n📝 Processing contract: ${contract.agreementNo} (${bills.length} bills)`);
      
      let sequenceNum = 1;
      
      for (const bill of bills) {
        const sequenceNumber = String(sequenceNum).padStart(3, '0');
        const newPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;
        const oldPvcNumber = bill.pvcNumber;
        
        await prisma.bill.update({
          where: { id: bill.id },
          data: { pvcNumber: newPvcNumber }
        });
        
        console.log(`   ✓ ${bill.billNo}: ${oldPvcNumber} → ${newPvcNumber}`);
        updatedCount++;
        sequenceNum++;
      }
    }
    
    console.log(`\n🎉 Successfully migrated ${updatedCount} PVC numbers to contract-based format!`);
    console.log(`📋 Total contracts processed: ${Object.keys(billsByContract).length}`);
    
  } catch (error) {
    console.error('❌ Error migrating PVC numbers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migratePvcNumbers()
  .then(() => {
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

