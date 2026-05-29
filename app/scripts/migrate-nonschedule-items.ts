
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
config();

const prisma = new PrismaClient();

async function migrateNonScheduleItems() {
  console.log('Starting migration of non-schedule amounts to non-schedule items array...');
  
  try {
    // Get all bills with non-schedule amounts
    const bills = await prisma.$queryRaw<any[]>`
      SELECT id, "nonScheduleAmount" 
      FROM bills 
      WHERE "nonScheduleAmount" IS NOT NULL AND "nonScheduleAmount" > 0
    `;
    
    console.log(`Found ${bills.length} bills with non-schedule amounts`);
    
    for (const bill of bills) {
      const nonScheduleItems = [{
        description: 'Non-Schedule Items',
        amount: bill.nonScheduleAmount
      }];
      
      await prisma.$executeRaw`
        UPDATE bills 
        SET "nonScheduleItems" = ${JSON.stringify(nonScheduleItems)}::jsonb
        WHERE id = ${bill.id}
      `;
      
      console.log(`Migrated bill ${bill.id}: ₹${bill.nonScheduleAmount}`);
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateNonScheduleItems();
