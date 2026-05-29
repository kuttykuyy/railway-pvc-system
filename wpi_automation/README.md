# WPI Automation System

Automated system for fetching and updating Wholesale Price Index (WPI) data from the Government of India website.

## Overview

This system automatically:
1. **Fetches WPI data** from https://eaindustry.nic.in twice monthly
2. **Updates database** with latest index values for 10 price indices
3. **Sends WhatsApp notifications** to admin with update summary
4. **Maintains comprehensive logs** for auditing and debugging

## Schedule

### Provisional Data Run
- **Date**: 15th of every month
- **Time**: 10:00 AM IST
- **Purpose**: Fetch provisional/preliminary WPI data released by Government
- **Database Flag**: `isProvisional = true`

### Final Data Run
- **Date**: 30th of every month
- **Time**: 10:00 AM IST
- **Purpose**: Fetch final/revised WPI data
- **Database Flag**: `isProvisional = false`

## Architecture

### Components

1. **Python Script** (`scripts/fetch_wpi_data.py`)
   - Main orchestration script
   - Determines run type (provisional vs final)
   - Coordinates data extraction and database update
   - Handles error logging

2. **Node.js Database Updater** (`scripts/update_database.js`)
   - Updates PostgreSQL database using Prisma ORM
   - Performs upsert operations (insert or update)
   - Ensures data integrity with unique constraints

3. **Node.js WhatsApp Notifier** (`scripts/send_notification.js`)
   - Sends notification to admin via MyDreams WhatsApp API
   - Formats message with key index values
   - Logs notification to database

4. **Configuration** (`config/indices_mapping.json`)
   - Maps 10 price indices to WPI categories
   - Defines search keywords for data extraction
   - Contains index IDs from database

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Scheduled Task Trigger                    │
│              (15th or 30th of month at 10 AM IST)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Step 1: Determine Run Type                      │
│          (Provisional on 15th, Final on 30th)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Step 2: Navigate to eaindustry.nic.in               │
│    (Browser automation extracts latest WPI data)            │
│         - Cement/Lime/Plaster                                │
│         - All Commodities                                    │
│         - Fuel & Power/MPNG                                  │
│         - Basic Metal/Steel products                         │
│         - Machinery & Equipment                              │
│         - Labour index                                       │
│         - Explosives                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│      Step 3: Save Extracted Data to JSON                    │
│     (logs/extracted_data_YYYY-MM-DD.json)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│        Step 4: Update Database (Prisma/PostgreSQL)          │
│              - Upsert 10 index values                        │
│              - Set isProvisional flag                        │
│              - Record source URL                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│      Step 5: Send WhatsApp Notification to Admin            │
│         - Update status (success/partial)                    │
│         - Month and data type (provisional/final)            │
│         - Count of updated indices                           │
│         - Key values (Cement, Steel TMT, All Commodities)    │
│         - Dashboard link                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Step 6: Write Comprehensive Log                 │
│       (logs/wpi_update_YYYY-MM-DD_HH-MM.log)                │
└─────────────────────────────────────────────────────────────┘
```

## Price Indices Tracked

| Index Name | WPI Category | Subcategory | Database ID |
|-----------|-------------|-------------|-------------|
| Labour | Labour | All Industries | cmfl15a6o0002rocbix5nk3bz |
| MPNG Fuel | Fuel & Power | Mineral Oils | cmfl15a6v0004rocbk4hsbsc0 |
| RBI Cement | Manufactured Products | Cement, Lime & Plaster | cmfl15a710006rocbj5ctalsq |
| RBI Explosives | Manufactured Products | Explosives | cmfl15a740007rocbkhi0y6hq |
| RBI Other Materials | All Commodities | All Commodities | cmfl15a6y0005rocb65lk3dwp |
| RBI Plant Machinery | Manufactured Products | Machinery & Equipment | cmfl15a6s0003rocbpzexiyjh |
| Steel Angle/Channel | Manufactured Products | Basic Metals | cmfl15a7a0009rocbs4dqlhvv |
| Steel Other Sections | Manufactured Products | Basic Metals | cmfl15a7f000brocb4u1cvltg |
| Steel Plates | Manufactured Products | Basic Metals | cmfl15a7c000arocbnv4imwxx |
| Steel TMT Bars | Manufactured Products | Basic Metals | cmfl15a770008rocbqhdf40on |

## Database Schema

### MonthlyIndexValue Table

```typescript
model MonthlyIndexValue {
  id            String     @id @default(cuid())
  priceIndexId  String     // Foreign key to PriceIndex
  month         DateTime   // Month of the index value (first day of month)
  value         Float      // WPI value
  source        String?    // Source URL
  isProvisional Boolean    @default(false)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  
  @@unique([priceIndexId, month])  // Ensures one value per index per month
}
```

## WhatsApp Notification Format

```
🔔 *WPI Update Complete*

✅ *Status:* Success
📅 *Month:* September 2025
📊 *Data Type:* Provisional
📈 *Indices Updated:* 10/10

*Key Values:*
• Cement: 133.7
• Steel TMT: 142.3
• All Commodities: 154.9

🔗 View Dashboard: https://irpvc.in/indices
📄 Log: wpi_update_2025-09-15.log
```

## Error Handling

### Website Unreachable
- **Action**: Retry after 1 hour
- **Max Retries**: 3
- **Notification**: Admin notified if all retries fail

### Data Extraction Failure
- **Action**: Log specific index that failed
- **Behavior**: Continue with other indices
- **Result**: Partial success notification

### Database Update Failure
- **Action**: Rollback transaction
- **Notification**: Admin notified with error details
- **Logs**: Detailed error in log file

### WhatsApp Notification Failure
- **Action**: Log error
- **Behavior**: Task continues (doesn't fail)
- **Reason**: Notification failure shouldn't fail data update

## Logs

### Location
All logs are stored in `/home/ubuntu/railway_pvc_system/wpi_automation/logs/`

### Log Files

1. **Main Log**: `wpi_update_YYYY-MM-DD_HH-MM.log`
   - Complete execution log
   - Timestamps for each operation
   - Success/failure status
   - Error details

2. **Extraction Request**: `extraction_request_YYYYMMDD_HHMMSS.json`
   - Configuration for browser automation
   - List of indices to fetch
   - Target website and run type

3. **Extracted Data**: `extracted_data_YYYY-MM-DD.json`
   - Raw data extracted from website
   - Month, value, and source for each index
   - Created by browser automation step

4. **Database Updates**: `db_updates_YYYYMMDD_HHMMSS.json`
   - Prepared updates for database
   - Used by update_database.js

5. **Notification Data**: `notification_YYYYMMDD_HHMMSS.json`
   - Formatted notification content
   - Used by send_notification.js

## Manual Execution

### Test Run
```bash
cd /home/ubuntu/railway_pvc_system/wpi_automation/scripts
python3 fetch_wpi_data.py
```

### Database Update Only
```bash
cd /home/ubuntu/railway_pvc_system/app
node ../wpi_automation/scripts/update_database.js ../wpi_automation/logs/db_updates_YYYYMMDD_HHMMSS.json
```

### Send Notification Only
```bash
cd /home/ubuntu/railway_pvc_system/app
node ../wpi_automation/scripts/send_notification.js ../wpi_automation/logs/notification_YYYYMMDD_HHMMSS.json
```

## Dependencies

### Python
- Python 3.8+
- No external packages required (uses standard library)

### Node.js
- Node.js 18+
- Prisma Client (already installed in app)
- Access to PostgreSQL database

### Environment Variables
```bash
DATABASE_URL=postgresql://...  # From app/.env
```

### WhatsApp Credentials
Stored in `adminSettings` table:
- `mydreams_license_number`
- `mydreams_api_key`
- `admin_whatsapp_number` (should be +919944776689)

## Maintenance

### Monthly Review
- Check logs directory for any errors
- Review WhatsApp notification history in database
- Verify all 10 indices are being updated

### Quarterly Audit
- Compare database values with Government website
- Verify provisional values are updated to final
- Check for any missing months

### Annual Tasks
- Review WPI categories mapping (in case of changes)
- Update documentation
- Archive old logs

## Troubleshooting

### Problem: Website Structure Changed
**Solution**: Update the browser automation logic in the execution plan

### Problem: Index Not Found on Website
**Solution**: Update `config/indices_mapping.json` with new search keywords

### Problem: Database Connection Timeout
**Solution**: Check `DATABASE_URL` in app/.env and database status

### Problem: WhatsApp Notification Not Received
**Solution**: 
1. Check admin settings table for credentials
2. Verify phone number format (+919944776689)
3. Check WhatsAppLog table for error details

## Support

For issues or questions:
- **Admin**: admin@irpvc.in
- **WhatsApp**: +91 9944776689
- **Logs**: Check `/home/ubuntu/railway_pvc_system/wpi_automation/logs/`
- **Dashboard**: https://irpvc.in/indices

---

**Last Updated**: December 2025
**Version**: 1.0.0
**Maintainer**: Indian Railway PVC System Admin
