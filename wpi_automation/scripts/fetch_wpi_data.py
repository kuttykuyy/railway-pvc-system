#!/usr/bin/env python3
"""
WPI Data Fetcher and Database Updater
Automatically fetches latest WPI data from Government of India website
and updates the railway PVC system database.
"""

import os
import sys
import json
import logging
import traceback
from datetime import datetime, date
from pathlib import Path
import time
import re

# Setup paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
WPI_ROOT = SCRIPT_DIR.parent
CONFIG_DIR = WPI_ROOT / "config"
LOGS_DIR = WPI_ROOT / "logs"

# Ensure logs directory exists
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Setup logging
log_filename = LOGS_DIR / f"wpi_update_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def load_config():
    """Load indices mapping configuration"""
    config_path = CONFIG_DIR / "indices_mapping.json"
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        logger.info(f"✅ Loaded configuration for {len(config['indices'])} indices")
        return config
    except Exception as e:
        logger.error(f"❌ Failed to load configuration: {e}")
        raise

def determine_run_type():
    """Determine if this is a provisional or final data run based on current date"""
    today = date.today()
    day = today.day
    
    if day == 15:
        run_type = "provisional"
        is_provisional = True
    elif day == 30:
        run_type = "final"
        is_provisional = False
    else:
        # If run on other days, determine based on proximity
        if day < 22:
            run_type = "provisional"
            is_provisional = True
        else:
            run_type = "final"
            is_provisional = False
    
    logger.info(f"📅 Run date: {today.strftime('%Y-%m-%d')}")
    logger.info(f"🔖 Run type: {run_type.upper()} (isProvisional={is_provisional})")
    
    return is_provisional, run_type

def fetch_wpi_data_from_website(index_config, max_retries=3):
    """
    Fetch WPI data from Government website for a specific index
    This will be handled by the execution agent's browser automation
    Returns: Dictionary with month, value, and source URL
    """
    logger.info(f"📊 Fetching WPI data for: {index_config['name']}")
    logger.info(f"   Category: {index_config['wpi_category']}")
    logger.info(f"   Subcategory: {index_config.get('wpi_subcategory', 'N/A')}")
    
    # This placeholder will be replaced by actual data extraction
    # The execution agent will navigate the website and extract data
    return {
        "month": None,
        "value": None,
        "source": "https://eaindustry.nic.in",
        "status": "pending_extraction"
    }

def save_extracted_data(extracted_data, output_path):
    """Save extracted WPI data to JSON file"""
    try:
        with open(output_path, 'w') as f:
            json.dump(extracted_data, separators=(',', ':'), fp=f, indent=2)
        logger.info(f"✅ Saved extracted data to: {output_path}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to save extracted data: {e}")
        return False

def load_extracted_data(input_path):
    """Load extracted WPI data from JSON file"""
    try:
        with open(input_path, 'r') as f:
            data = json.load(f)
        logger.info(f"✅ Loaded extracted data from: {input_path}")
        return data
    except Exception as e:
        logger.error(f"❌ Failed to load extracted data: {e}")
        raise

def update_database(extracted_data, is_provisional):
    """Update PostgreSQL database with extracted WPI data using Prisma"""
    import subprocess
    import json
    
    logger.info("🗄️  Starting database update...")
    
    # Prepare the data for database update
    updates = []
    for item in extracted_data.get('indices', []):
        if item.get('value') is not None and item.get('month'):
            updates.append({
                'priceIndexId': item['id'],
                'month': item['month'],
                'value': float(item['value']),
                'source': item.get('source', 'https://eaindustry.nic.in'),
                'isProvisional': is_provisional
            })
    
    if not updates:
        logger.warning("⚠️  No valid data to update in database")
        return {"success": False, "updated": 0, "errors": ["No valid data"]}
    
    logger.info(f"📝 Prepared {len(updates)} updates for database")
    
    # Write updates to temporary file for Node.js script to process
    temp_file = LOGS_DIR / f"db_updates_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(temp_file, 'w') as f:
        json.dump(updates, f, indent=2)
    
    logger.info(f"💾 Wrote updates to: {temp_file}")
    
    # Call Node.js script to perform database updates using Prisma
    node_script = SCRIPT_DIR / "update_database.js"
    try:
        result = subprocess.run(
            ['node', str(node_script), str(temp_file)],
            cwd=PROJECT_ROOT / "app",
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            logger.info("✅ Database update completed successfully")
            logger.info(result.stdout)
            
            # Parse result
            try:
                result_data = json.loads(result.stdout.split('\n')[-2])  # Get last JSON line
                return result_data
            except:
                return {"success": True, "updated": len(updates)}
        else:
            logger.error(f"❌ Database update failed: {result.stderr}")
            return {"success": False, "updated": 0, "errors": [result.stderr]}
            
    except subprocess.TimeoutExpired:
        logger.error("❌ Database update timed out")
        return {"success": False, "updated": 0, "errors": ["Timeout"]}
    except Exception as e:
        logger.error(f"❌ Database update error: {e}")
        return {"success": False, "updated": 0, "errors": [str(e)]}

def send_whatsapp_notification(update_result, extracted_data, is_provisional, run_type):
    """Send WhatsApp notification to admin about WPI update"""
    import subprocess
    
    logger.info("📱 Sending WhatsApp notification to admin...")
    
    # Determine data month from extracted data
    month_str = "Unknown"
    if extracted_data.get('indices') and len(extracted_data['indices']) > 0:
        first_item = extracted_data['indices'][0]
        if first_item.get('month'):
            try:
                month_date = datetime.fromisoformat(first_item['month'].replace('Z', '+00:00'))
                month_str = month_date.strftime('%B %Y')
            except:
                month_str = first_item.get('month', 'Unknown')
    
    # Extract key values for notification
    key_values = {}
    for item in extracted_data.get('indices', []):
        name = item.get('name', '')
        if 'Cement' in name:
            key_values['cement'] = item.get('value', 'N/A')
        elif 'TMT' in name:
            key_values['tmt'] = item.get('value', 'N/A')
        elif 'All Commodities' in name or 'Other Materials' in name:
            key_values['all_commodities'] = item.get('value', 'N/A')
    
    # Prepare notification data
    notification_data = {
        'month': month_str,
        'status': 'Provisional' if is_provisional else 'Final',
        'updated_count': update_result.get('updated', 0),
        'total_count': len(extracted_data.get('indices', [])),
        'key_values': key_values,
        'success': update_result.get('success', False),
        'run_type': run_type
    }
    
    # Write notification data to file
    notif_file = LOGS_DIR / f"notification_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(notif_file, 'w') as f:
        json.dump(notification_data, f, indent=2)
    
    # Call Node.js script to send WhatsApp notification
    node_script = SCRIPT_DIR / "send_notification.js"
    try:
        result = subprocess.run(
            ['node', str(node_script), str(notif_file)],
            cwd=PROJECT_ROOT / "app",
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            logger.info("✅ WhatsApp notification sent successfully")
            logger.info(result.stdout)
            return True
        else:
            logger.error(f"⚠️  WhatsApp notification failed: {result.stderr}")
            # Don't fail the task if notification fails
            return False
            
    except Exception as e:
        logger.error(f"⚠️  WhatsApp notification error: {e}")
        # Don't fail the task if notification fails
        return False

def main():
    """Main execution function"""
    try:
        logger.info("="*80)
        logger.info("🚀 Starting WPI Data Update Process")
        logger.info("="*80)
        
        # Load configuration
        config = load_config()
        indices = config['indices']
        
        # Determine run type
        is_provisional, run_type = determine_run_type()
        
        # Step 1: Prepare data structure for extraction
        extraction_request = {
            "indices": indices,
            "target_website": "https://eaindustry.nic.in",
            "is_provisional": is_provisional,
            "run_type": run_type,
            "timestamp": datetime.now().isoformat()
        }
        
        # Save extraction request
        request_file = LOGS_DIR / f"extraction_request_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        save_extracted_data(extraction_request, request_file)
        
        logger.info("📋 Extraction request prepared")
        logger.info(f"   Request file: {request_file}")
        
        # Step 2: Wait for extracted data file
        # The execution agent will create this file after extracting data from website
        extracted_data_file = LOGS_DIR / f"extracted_data_{datetime.now().strftime('%Y%m%d')}.json"
        
        logger.info("⏳ Waiting for data extraction to complete...")
        logger.info(f"   Expected file: {extracted_data_file}")
        
        # Check if extracted data already exists (from browser automation step)
        if not extracted_data_file.exists():
            logger.info("ℹ️  Extracted data file not found yet")
            logger.info("   The browser automation step should create this file")
            logger.info("   This script will be called again after data extraction")
            
            # Return gracefully - the execution agent will call this script again
            # after the browser automation step completes
            return {
                "status": "pending_extraction",
                "message": "Waiting for WPI data extraction from website",
                "request_file": str(request_file),
                "expected_output": str(extracted_data_file)
            }
        
        # Load extracted data
        extracted_data = load_extracted_data(extracted_data_file)
        logger.info(f"✅ Loaded extracted data for {len(extracted_data.get('indices', []))} indices")
        
        # Step 3: Update database
        update_result = update_database(extracted_data, is_provisional)
        
        if update_result.get('success'):
            logger.info(f"✅ Database updated: {update_result.get('updated', 0)} records")
        else:
            logger.error(f"❌ Database update failed: {update_result.get('errors', [])}")
        
        # Step 4: Send WhatsApp notification
        notification_sent = send_whatsapp_notification(
            update_result, 
            extracted_data, 
            is_provisional, 
            run_type
        )
        
        # Final summary
        logger.info("="*80)
        logger.info("📊 WPI Update Summary")
        logger.info("="*80)
        logger.info(f"  Run Type: {run_type.upper()}")
        logger.info(f"  Indices Processed: {len(extracted_data.get('indices', []))}")
        logger.info(f"  Database Updates: {update_result.get('updated', 0)}")
        logger.info(f"  WhatsApp Notification: {'✅ Sent' if notification_sent else '⚠️  Failed'}")
        logger.info(f"  Log File: {log_filename}")
        logger.info("="*80)
        
        return {
            "status": "completed",
            "run_type": run_type,
            "is_provisional": is_provisional,
            "updated_count": update_result.get('updated', 0),
            "total_count": len(extracted_data.get('indices', [])),
            "notification_sent": notification_sent,
            "log_file": str(log_filename)
        }
        
    except Exception as e:
        logger.error("="*80)
        logger.error("❌ FATAL ERROR")
        logger.error("="*80)
        logger.error(f"Error: {e}")
        logger.error(traceback.format_exc())
        logger.error("="*80)
        
        return {
            "status": "failed",
            "error": str(e),
            "log_file": str(log_filename)
        }

if __name__ == "__main__":
    result = main()
    print("\n" + "="*80)
    print("EXECUTION RESULT:")
    print(json.dumps(result, indent=2))
    print("="*80)
    
    # Exit with appropriate code
    sys.exit(0 if result.get('status') in ['completed', 'pending_extraction'] else 1)
