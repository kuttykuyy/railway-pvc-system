
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { addMonths } from 'date-fns';

// Load environment variables
config();

const prisma = new PrismaClient();

// Import the quarter calculation function
function getQuarterFromDate(date: Date, baseMonth: Date): string {
  // Validate inputs
  if (!date || isNaN(date.getTime())) {
    throw new Error('Invalid measurement date provided');
  }
  
  if (!baseMonth || isNaN(baseMonth.getTime())) {
    throw new Error('Invalid contract base month provided');
  }
  
  const baseYear = baseMonth.getFullYear();
  const baseMonthNum = baseMonth.getMonth(); // 0-based
  const dateYear = date.getFullYear();
  const dateMonthNum = date.getMonth(); // 0-based
  
  // Validate year ranges to prevent overflow
  if (baseYear < 1970 || baseYear > 2100 || dateYear < 1970 || dateYear > 2100) {
    throw new Error('Date years must be between 1970 and 2100');
  }
  
  // Calculate months from the start month (next month after base month)
  const startMonth = (baseMonthNum + 1) % 12; // Next month after base month
  const startYear = baseMonthNum === 11 ? baseYear + 1 : baseYear; // Handle year wrap
  
  // Calculate total months from start
  const monthsFromStart = (dateYear - startYear) * 12 + (dateMonthNum - startMonth);
  
  // Handle cases where date might be before or equal to base month
  // Return Q0 for such cases instead of throwing an error
  if (monthsFromStart < 0) {
    return 'Q0'; // Special case for dates before first quarter
  }
  
  // Calculate quarter (each quarter = 3 months, starting from Q1)
  const quarterNum = Math.floor(monthsFromStart / 3) + 1;
  
  return `Q${quarterNum}`;
}

async function fixMissingQuarters() {
  console.log('🔍 Starting to fix missing or invalid quarters...\n');
  
  try {
    // Find all bills (we'll check quarter validity in code)
    const bills = await prisma.bill.findMany({
      include: {
        contract: true
      },
      orderBy: [
        { contractId: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    
    // Filter bills with missing or invalid quarters
    const billsToFix = bills.filter((bill: any) => 
      !bill.quarter || 
      bill.quarter === '' || 
      bill.quarter === 'null' || 
      bill.quarter === 'undefined' ||
      bill.quarter === 'N/A'
    );
    
    if (billsToFix.length === 0) {
      console.log('✅ No bills found with missing or invalid quarters.');
      return;
    }
    
    console.log(`📊 Total bills in database: ${bills.length}`);
    console.log(`📊 Found ${billsToFix.length} bills with missing or invalid quarters.`);
    console.log('='.repeat(80) + '\n');
    
    let fixed = 0;
    let errors = 0;
    
    for (const bill of billsToFix) {
      try {
        const baseMonthDate = bill.contract.baseMonth 
          ? new Date(bill.contract.baseMonth) 
          : addMonths(new Date(bill.contract.dateOfOpening), -1);
        
        const measurementDate = new Date(bill.dateOfMeasurement);
        const calculatedQuarter = getQuarterFromDate(measurementDate, baseMonthDate);
        
        // Update the bill with the calculated quarter
        await prisma.bill.update({
          where: { id: bill.id },
          data: { quarter: calculatedQuarter }
        });
        
        console.log(`✅ Bill ${bill.billNo} (ID: ${bill.id})`);
        console.log(`   Contract: ${bill.contract.agreementNo}`);
        console.log(`   Measurement Date: ${measurementDate.toISOString().split('T')[0]}`);
        console.log(`   Base Month: ${baseMonthDate.toISOString().split('T')[0]}`);
        console.log(`   Calculated Quarter: ${calculatedQuarter}`);
        console.log('');
        
        fixed++;
      } catch (error: any) {
        console.error(`❌ Error fixing bill ${bill.billNo} (ID: ${bill.id}):`, error.message);
        errors++;
      }
    }
    
    console.log('='.repeat(80));
    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Fixed: ${fixed} bills`);
    if (errors > 0) {
      console.log(`   ❌ Errors: ${errors} bills`);
    }
    console.log('');
    console.log('✅ Quarter fix process completed!');
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixMissingQuarters()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
