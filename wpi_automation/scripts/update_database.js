#!/usr/bin/env node

/**
 * Database Update Script
 * Updates MonthlyIndexValue records in PostgreSQL using Prisma
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { sendSlackAlert } = require('./slack-alert');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function updateDatabase(updatesFile) {
  console.log('🗄️  Starting database update process...');
  console.log(`📁 Updates file: ${updatesFile}`);
  
  try {
    // Read updates from file
    const updatesData = JSON.parse(fs.readFileSync(updatesFile, 'utf8'));
    console.log(`📊 Found ${updatesData.length} updates to process`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process each update
    for (const update of updatesData) {
      try {
        console.log(`\n📝 Processing: ${update.priceIndexId}`);
        console.log(`   Month: ${update.month}`);
        console.log(`   Value: ${update.value}`);
        console.log(`   Provisional: ${update.isProvisional}`);
        
        // Convert month to Date object (ensure it's the first day of the month at midnight UTC)
        const monthDate = new Date(update.month);
        monthDate.setUTCHours(0, 0, 0, 0);
        
        // Use upsert to insert or update
        const result = await prisma.monthlyIndexValue.upsert({
          where: {
            priceIndexId_month: {
              priceIndexId: update.priceIndexId,
              month: monthDate
            }
          },
          update: {
            value: update.value,
            source: update.source,
            isProvisional: update.isProvisional,
            updatedAt: new Date()
          },
          create: {
            priceIndexId: update.priceIndexId,
            month: monthDate,
            value: update.value,
            source: update.source,
            isProvisional: update.isProvisional
          }
        });
        
        console.log(`   ✅ Success: ${result.id}`);
        successCount++;
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
        errors.push({
          priceIndexId: update.priceIndexId,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Database Update Summary:');
    console.log('='.repeat(80));
    console.log(`✅ Successful updates: ${successCount}`);
    console.log(`❌ Failed updates: ${errorCount}`);
    console.log('='.repeat(80));
    
    // Return result as JSON (last line will be parsed by Python)
    const result = {
      success: errorCount === 0,
      updated: successCount,
      failed: errorCount,
      errors: errors
    };
    
    console.log(JSON.stringify(result));

    if (errorCount > 0) {
      await sendSlackAlert('warning', 'WPI database update completed with errors', {
        'Updated': String(successCount),
        'Failed': String(errorCount),
        'First Error': errors[0]?.error || 'N/A',
        'Updates File': updatesFile
      });
    } else {
      await sendSlackAlert('info', 'WPI database update completed', {
        'Updated': String(successCount),
        'Failed': '0',
        'Updates File': updatesFile
      });
    }

    await prisma.$disconnect();
    process.exit(errorCount === 0 ? 0 : 1);

  } catch (error) {
    console.error('❌ Fatal error during database update:', error);
    console.error(error.stack);

    await sendSlackAlert('critical', 'WPI database update fatal error', {
      'Error': error.message || String(error),
      'Updates File': updatesFile
    });

    await prisma.$disconnect();
    process.exit(1);
  }
}

// Main execution
const updatesFile = process.argv[2];
if (!updatesFile) {
  console.error('❌ Error: No updates file provided');
  console.error('Usage: node update_database.js <updates_file.json>');
  process.exit(1);
}

if (!fs.existsSync(updatesFile)) {
  console.error(`❌ Error: Updates file not found: ${updatesFile}`);
  process.exit(1);
}

updateDatabase(updatesFile);
