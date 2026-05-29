# WPI Automation System - Deployment Summary

**Deployment Date**: December 8, 2025  
**Status**: ✅ ACTIVE  
**System**: Indian Railway PVC Bill Management System

---

## 🎯 Overview

The WPI (Wholesale Price Index) Automation System has been successfully deployed and configured to run twice monthly on the 15th and 30th at 10:00 AM IST.

## 📅 Scheduled Tasks

### Task 1: WPI Update - Provisional Data (15th)
- **Schedule**: 15th of every month at 10:00 AM IST
- **Cron Expression**: `0 10 15 * *`
- **Timezone**: Asia/Kolkata
- **Purpose**: Fetch provisional/preliminary WPI data
- **Database Flag**: `isProvisional = true`
- **Status**: ✅ ACTIVE
- **Next Run**: December 15, 2025 at 10:00 AM IST

### Task 2: WPI Update - Final Data (30th)
- **Schedule**: 30th of every month at 10:00 AM IST
- **Cron Expression**: `0 10 30 * *`
- **Timezone**: Asia/Kolkata
- **Purpose**: Fetch final/revised WPI data
- **Database Flag**: `isProvisional = false`
- **Status**: ✅ ACTIVE
- **Next Run**: December 30, 2025 at 10:00 AM IST

---

## 🗂️ System Components

### Directory Structure
```
/home/ubuntu/railway_pvc_system/wpi_automation/
├── README.md                    # Comprehensive documentation
├── DEPLOYMENT_SUMMARY.md        # This file
├── config/
│   └── indices_mapping.json    # Price indices configuration
├── scripts/
│   ├── fetch_wpi_data.py       # Main orchestration script
│   ├── update_database.js      # Database updater (Prisma)
│   └── send_notification.js    # WhatsApp notifier
└── logs/                        # Execution logs (auto-created)
    ├── wpi_update_*.log
    ├── extracted_data_*.json
    ├── db_updates_*.json
    └── notification_*.json
```

### Scripts Overview

#### 1. fetch_wpi_data.py
- **Language**: Python 3
- **Purpose**: Main orchestration
- **Functions**:
  - Determines run type (provisional/final)
  - Coordinates data extraction
  - Calls Node.js scripts for DB and WhatsApp
  - Comprehensive error handling and logging

#### 2. update_database.js
- **Language**: Node.js
- **Purpose**: Database operations
- **Functions**:
  - Connects to PostgreSQL via Prisma
  - Performs upsert operations
  - Validates data integrity
  - Returns update summary

#### 3. send_notification.js
- **Language**: Node.js
- **Purpose**: WhatsApp notifications
- **Functions**:
  - Retrieves MyDreams credentials from DB
  - Formats notification message
  - Sends to admin (+919944776689)
  - Logs to whatsAppLog table

---

## 📊 Price Indices Tracked (10 Total)

| # | Index Name | WPI Category | Database ID |
|---|-----------|--------------|-------------|
| 1 | Labour | Labour - All Industries | cmfl15a6o0002rocbix5nk3bz |
| 2 | MPNG Fuel | Fuel & Power - Mineral Oils | cmfl15a6v0004rocbk4hsbsc0 |
| 3 | RBI Cement | Cement, Lime & Plaster | cmfl15a710006rocbj5ctalsq |
| 4 | RBI Explosives | Explosives | cmfl15a740007rocbkhi0y6hq |
| 5 | RBI Other Materials | All Commodities | cmfl15a6y0005rocb65lk3dwp |
| 6 | RBI Plant Machinery | Machinery & Equipment | cmfl15a6s0003rocbpzexiyjh |
| 7 | Steel Angle/Channel | Basic Metals | cmfl15a7a0009rocbs4dqlhvv |
| 8 | Steel Other Sections | Basic Metals | cmfl15a7f000brocb4u1cvltg |
| 9 | Steel Plates | Basic Metals | cmfl15a7c000arocbnv4imwxx |
| 10 | Steel TMT Bars | Basic Metals | cmfl15a770008rocbqhdf40on |

---

## 🔄 Execution Workflow

```
┌────────────────────────────────────────────────────────┐
│  Scheduled Task Trigger (15th or 30th at 10:00 AM)    │
└─────────────────────┬──────────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────────┐
│  Step 1: Load Configuration                            │
│  - Read indices_mapping.json                           │
│  - Determine run type (provisional/final)              │
└─────────────────────┬──────────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────────┐
│  Step 2: Browser Automation - Extract WPI Data         │
│  - Navigate to https://eaindustry.nic.in              │
│  - Extract latest data for all 10 indices              │
│  - Handle pagination and multiple categories           │
└─────────────────────┬──────────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────────┐
│  Step 3: Save Extracted Data                           │
│  - Create extracted_data_YYYY-MM-DD.json               │
│  - Validate data format                                │
└─────────────────────┬──────────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────────┐
│  Step 4: Execute Python Script                         │
│  - Load extracted data                                 │
│  - Call update_database.js                             │
│  - Update PostgreSQL via Prisma                        │
└─────────────────────┬──────────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────────┐
│  Step 5: Send WhatsApp Notification                    │
│  - Format notification message                         │
│  - Send via MyDreams API                               │
│  - Include: Month, Status, Updated Count, Key Values   │
└─────────────────────┬──────────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────────┐
│  Step 6: Log Results                                   │
│  - Write comprehensive log file                        │
│  - Archive extracted data                              │
│  - Record notification in database                     │
└────────────────────────────────────────────────────────┘
```

---

## 📱 WhatsApp Notification

### Format
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

### Recipient
- **Phone**: +919944776689
- **Name**: Admin
- **Service**: MyDreams WhatsApp Business API

### Credentials (Verified ✅)
- ✅ `mydreams_license_number` - Configured in adminSettings
- ✅ `mydreams_api_key` - Configured in adminSettings
- ✅ `admin_whatsapp_number` - Configured in adminSettings

---

## 🗄️ Database

### Table: MonthlyIndexValue
```sql
CREATE TABLE monthly_index_values (
    id            TEXT PRIMARY KEY,
    priceIndexId  TEXT NOT NULL,
    month         TIMESTAMP NOT NULL,
    value         DOUBLE PRECISION NOT NULL,
    source        TEXT,
    isProvisional BOOLEAN DEFAULT FALSE,
    createdAt     TIMESTAMP DEFAULT NOW(),
    updatedAt     TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(priceIndexId, month)
);
```

### Operations
- **Upsert Logic**: If record exists for (priceIndexId, month), update it; otherwise, insert new
- **Provisional to Final**: When 30th run executes, it updates existing provisional records with `isProvisional = false`
- **Transaction Safety**: All updates wrapped in Prisma transactions

---

## 🛡️ Error Handling

### Website Unreachable
- **Max Retries**: 3
- **Retry Interval**: 1 hour
- **Action**: Log error, notify admin

### Data Extraction Failure
- **Behavior**: Continue with other indices
- **Result**: Partial success notification
- **Logging**: Detailed error per index

### Database Update Failure
- **Behavior**: Rollback transaction
- **Notification**: Admin notified with error
- **Logging**: Full stack trace in log file

### WhatsApp Notification Failure
- **Behavior**: Task continues (non-critical)
- **Logging**: Error logged but doesn't fail task
- **Reason**: Data update is primary objective

---

## 📋 Logs

### Location
`/home/ubuntu/railway_pvc_system/wpi_automation/logs/`

### Log Types

1. **Main Execution Log**
   - File: `wpi_update_YYYY-MM-DD_HH-MM.log`
   - Content: Complete execution trace
   - Retention: Keep for 12 months

2. **Extracted Data**
   - File: `extracted_data_YYYY-MM-DD.json`
   - Content: Raw WPI data from website
   - Retention: Keep for 6 months

3. **Database Updates**
   - File: `db_updates_YYYYMMDD_HHMMSS.json`
   - Content: Prepared updates for Prisma
   - Retention: Keep for 3 months

4. **Notification Data**
   - File: `notification_YYYYMMDD_HHMMSS.json`
   - Content: Formatted WhatsApp message
   - Retention: Keep for 3 months

---

## ✅ Verification Checklist

- [✅] Configuration file created with all 10 indices
- [✅] Python script created and executable
- [✅] Node.js database updater created
- [✅] Node.js WhatsApp notifier created
- [✅] Logs directory structure created
- [✅] WhatsApp credentials verified in database
- [✅] Database connection string verified
- [✅] Scheduled task created for 15th (Provisional)
- [✅] Scheduled task created for 30th (Final)
- [✅] Timezone set to Asia/Kolkata
- [✅] Next run dates confirmed
- [✅] Documentation created (README.md)
- [✅] Deployment summary created

---

## 🧪 Manual Testing

### Test Extraction Request
```bash
cd /home/ubuntu/railway_pvc_system/wpi_automation/scripts
python3 fetch_wpi_data.py
```

### Test Database Update
```bash
cd /home/ubuntu/railway_pvc_system/app
export $(cat .env | grep DATABASE_URL | xargs)
node ../wpi_automation/scripts/update_database.js ../wpi_automation/logs/db_updates_<timestamp>.json
```

### Test WhatsApp Notification
```bash
cd /home/ubuntu/railway_pvc_system/app
export $(cat .env | grep DATABASE_URL | xargs)
node ../wpi_automation/scripts/send_notification.js ../wpi_automation/logs/notification_<timestamp>.json
```

---

## 📞 Support & Contacts

### System Admin
- **Email**: admin@irpvc.in
- **WhatsApp**: +91 9944776689

### Data Source
- **Website**: https://eaindustry.nic.in
- **Organization**: Office of the Economic Adviser, DPIIT
- **Base Year**: 2011-12 = 100

### Documentation
- **Full Guide**: `/home/ubuntu/railway_pvc_system/wpi_automation/README.md`
- **Dashboard**: https://irpvc.in/indices

---

## 🔮 Future Enhancements

1. **Email Notifications**: Add email alerts alongside WhatsApp
2. **Data Validation**: Cross-verify extracted values with historical trends
3. **Retry Logic**: Implement exponential backoff for failed extractions
4. **Monitoring Dashboard**: Create admin dashboard for task monitoring
5. **Historical Analysis**: Generate monthly trend reports
6. **API Integration**: Expose WPI data via REST API
7. **Alert Thresholds**: Notify if index changes exceed threshold

---

## 📊 Success Metrics

### Expected Outcomes
- ✅ 100% automated data collection (no manual intervention)
- ✅ 10/10 indices updated monthly (provisional and final)
- ✅ < 10 minutes execution time per run
- ✅ Admin notified within 1 minute of completion
- ✅ Zero data loss (all updates logged and traceable)

### Monthly Review
- Check logs on 16th and 31st of each month
- Verify all 10 indices updated successfully
- Confirm WhatsApp notifications received
- Review any errors or partial successes

---

## 🎉 Deployment Status

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ✅ WPI AUTOMATION SYSTEM SUCCESSFULLY DEPLOYED         ║
║                                                          ║
║   📅 Deployment Date: December 8, 2025                  ║
║   🚀 Status: ACTIVE                                     ║
║   ⏰ Next Run: December 15, 2025 at 10:00 AM IST       ║
║   📱 Notifications: Configured and Tested               ║
║   🗄️  Database: Connected and Ready                     ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

**Prepared by**: AI Assistant  
**Reviewed by**: System Admin  
**Version**: 1.0.0  
**Last Updated**: December 8, 2025
