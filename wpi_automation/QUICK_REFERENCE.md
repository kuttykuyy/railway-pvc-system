# WPI Automation - Quick Reference Guide

## 📅 Schedule at a Glance

| Task | Date | Time | Purpose | Database Flag |
|------|------|------|---------|---------------|
| **Provisional Data** | 15th | 10:00 AM IST | Preliminary WPI values | `isProvisional: true` |
| **Final Data** | 30th | 10:00 AM IST | Revised/Final WPI values | `isProvisional: false` |

## 📊 10 Price Indices Tracked

1. **Labour** - All Industries
2. **MPNG Fuel** - Mineral Oils
3. **RBI Cement** - Cement, Lime & Plaster
4. **RBI Explosives** - Explosives
5. **RBI Other Materials** - All Commodities
6. **RBI Plant Machinery** - Machinery & Equipment
7. **Steel Angle/Channel** - Basic Metals
8. **Steel Other Sections** - Basic Metals
9. **Steel Plates** - Basic Metals
10. **Steel TMT Bars** - Basic Metals

## 📱 Admin Notification

**Phone**: +919944776689  
**Method**: WhatsApp (MyDreams API)  
**Timing**: Within 1 minute of completion

## 📁 Key Files

```
/home/ubuntu/railway_pvc_system/wpi_automation/
├── README.md                     # Full documentation
├── DEPLOYMENT_SUMMARY.md         # Deployment details
├── QUICK_REFERENCE.md           # This file
├── config/
│   └── indices_mapping.json     # 10 indices configuration
├── scripts/
│   ├── fetch_wpi_data.py        # Main script
│   ├── update_database.js       # DB updater
│   └── send_notification.js     # WhatsApp sender
└── logs/                         # Auto-created logs
```

## 🗄️ Database

**Table**: `monthly_index_values`  
**Operation**: Upsert (insert or update)  
**Key**: `(priceIndexId, month)` - unique constraint

## 🔍 Quick Commands

### View Logs
```bash
cd /home/ubuntu/railway_pvc_system/wpi_automation/logs
ls -lt | head -10
```

### Check Latest Log
```bash
cat /home/ubuntu/railway_pvc_system/wpi_automation/logs/wpi_update_*.log | tail -100
```

### View Scheduled Tasks
```bash
# Use the scheduled task management UI
# Or check task status programmatically
```

### Manual Test Run
```bash
cd /home/ubuntu/railway_pvc_system/wpi_automation/scripts
python3 fetch_wpi_data.py
```

## 📞 Support

**Email**: admin@irpvc.in  
**WhatsApp**: +91 9944776689  
**Dashboard**: https://irpvc.in/indices

## ⚠️ Monitoring

### Check on 16th of Month
- Review provisional data update log
- Verify WhatsApp notification received
- Confirm all 10 indices updated

### Check on 31st of Month
- Review final data update log
- Verify WhatsApp notification received
- Confirm provisional values converted to final

## 🔧 Troubleshooting

### No WhatsApp Notification?
1. Check `/home/ubuntu/railway_pvc_system/wpi_automation/logs/` for recent log
2. Check `whatsAppLog` table in database
3. Verify credentials in `adminSettings` table

### Database Not Updated?
1. Check log file for errors
2. Verify `DATABASE_URL` in `/home/ubuntu/railway_pvc_system/app/.env`
3. Check PostgreSQL connection

### Data Extraction Failed?
1. Check if https://eaindustry.nic.in is accessible
2. Review log for specific index failures
3. Website structure may have changed

## ✅ Success Indicators

- ✅ Log file created in `/logs/` directory
- ✅ WhatsApp notification received
- ✅ All 10 indices have latest month's data
- ✅ No errors in log file
- ✅ `monthly_index_values` table updated

---

**Next Runs**:
- **Provisional**: December 15, 2025 at 10:00 AM IST
- **Final**: December 30, 2025 at 10:00 AM IST

**Status**: ✅ ACTIVE & READY
