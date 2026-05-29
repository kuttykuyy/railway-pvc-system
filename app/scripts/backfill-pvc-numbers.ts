
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillPvcNumbers() {
  console.log('Starting contract-based PVC number backfill...');
  
  try {
    // Find all bills without PVC numbers or with old format
    const billsWithoutPvcNumber = await prisma.bill.findMany({
      where: {
        OR: [
          { pvcNumber: null },
          { pvcNumber: '' }
        ]
      },
      include: {
        contract: true
      },
      orderBy: {
        dateOfMeasurement: 'asc'
      }
    });
    
    console.log(`Found ${billsWithoutPvcNumber.length} bills without PVC numbers`);
    
    if (billsWithoutPvcNumber.length === 0) {
      console.log('All bills already have PVC numbers. Nothing to do.');
      return;
    }
    
    // Group bills by contract for sequential numbering
    const billsByContract: { [key: string]: any[] } = {};
    
    for (const bill of billsWithoutPvcNumber) {
      const contractId = bill.contractId;
      
      if (!billsByContract[contractId]) {
        billsByContract[contractId] = [];
      }
      billsByContract[contractId].push(bill);
    }
    
    // Generate and update PVC numbers
    let updatedCount = 0;
    
    for (const [contractId, bills] of Object.entries(billsByContract)) {
      const contract = bills[0].contract;
      
      // Get existing count for this contract to continue sequence
      const existingCount = await prisma.bill.count({
        where: {
          contractId: contractId,
          pvcNumber: { not: null }
        }
      });
      
      let sequenceNum = existingCount + 1;
      
      for (const bill of bills) {
        const sequenceNumber = String(sequenceNum).padStart(3, '0');
        const pvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;
        
        await prisma.bill.update({
          where: { id: bill.id },
          data: { pvcNumber }
        });
        
        console.log(`Updated Bill ${bill.billNo}: ${pvcNumber}`);
        updatedCount++;
        sequenceNum++;
      }
    }
    
    console.log(`\nSuccessfully backfilled ${updatedCount} PVC numbers with contract-based numbering`);
    
  } catch (error) {
    console.error('Error backfilling PVC numbers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backfillPvcNumbers()
  .then(() => {
    console.log('Backfill completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
