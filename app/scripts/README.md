
# Migration Scripts

This directory contains database migration scripts for the Railway PVC System.

## Available Scripts

### 1. `migrate-17b-bills.ts`

Automatically recalculates all bills with 17B restrictions to ensure they use the correct capped indices for dedicated cement and steel PVC calculations.

#### What It Does

- Finds all bills where the measurement date exceeds the original completion date
- Recalculates PVC using the correct 17B restriction logic with three-month quarterly averages
- Updates dedicated cement and steel PVC to use capped indices
- Updates financial impact calculations to show accurate Railway Savings
- Logs detailed progress and results

#### When To Use

Run this script:
- After the 17B calculation fix is deployed
- To update all existing bills with 17B restrictions
- When bills show incorrect PVC amounts in their reports

#### How To Run

```bash
cd /home/ubuntu/railway_pvc_system/app
yarn tsx scripts/migrate-17b-bills.ts
```

#### What To Expect

The script will:
1. Find all bills that need recalculation
2. Process each bill one by one
3. Show progress for each bill:
   - Bill number and contract
   - Previous and new PVC amounts
   - PVC difference
   - Railway Savings changes
4. Print a summary at the end:
   - Number of successful migrations
   - Number of errors
   - Total financial impact

#### Example Output

```
🚀 Starting 17B Bills Migration...
================================================================================

📊 Found 5 bills that need 17B recalculation

📋 Processing Bill: SR/MAS/Civil/2023/0025-B2-R1 (Contract: AGT/2023/001)
   📅 Quarter recalculated: Q4-2024 → Q3-2024
   🔒 17B restriction applies - using capped indices
   💰 Dedicated Cement PVC: ₹125000.00
   💰 Dedicated Steel PVC: ₹185000.00
   ✅ Success! PVC: ₹850000.00 → ₹780000.00 (Δ -₹70000.00)
   💰 Railway Savings: ₹50000.00 → ₹120000.00

================================================================================
📈 MIGRATION SUMMARY
================================================================================

✅ Successful: 5
❌ Failed: 0
📋 Total: 5

💰 FINANCIAL IMPACT:
--------------------------------------------------------------------------------
Total PVC Change: -₹350000.00
Total Railway Savings Change: ₹350000.00

✨ Migration complete!
```

#### Important Notes

- **Backup Recommended**: Although the script is designed to be safe, it's good practice to backup your database before running migrations
- **One-Time Operation**: This script is designed to be run once after the fix is deployed
- **Idempotent**: Safe to run multiple times - it will recalculate all eligible bills each time
- **Database Changes**: The script modifies the `pvcCalculation` table for affected bills

#### Troubleshooting

If the script fails:
1. Check the error message in the output
2. Verify database connectivity
3. Ensure all required environment variables are set
4. Check that the bill data is complete (has classification, contract details, etc.)

If specific bills fail:
- The script will continue processing other bills
- Failed bills are listed in the error section with details
- You can manually recalculate failed bills using the "Recalculate PVC" button in the UI

## Future Scripts

Additional migration scripts can be added to this directory as needed for:
- Data model changes
- Policy updates
- Performance optimizations
- Batch data corrections
