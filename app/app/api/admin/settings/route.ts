
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { clearSettingsCache } from '@/lib/admin-settings';

export const dynamic = "force-dynamic";

// Default system settings
const DEFAULT_SETTINGS = [
  {
    key: 'BILL_PROCESSING_COST',
    value: '199',
    description: 'Cost in credits per bill processing',
    dataType: 'number'
  },
  {
    key: 'AI_BILL_PROCESSING_COST',
    value: '499',
    description: 'Cost in credits per AI-assisted bill processing',
    dataType: 'number'
  },
  {
    key: 'PAYMENT_PROCESSING_ENABLED',
    value: 'true',
    description: 'Enable/disable payment processing for bills',
    dataType: 'boolean'
  },
  {
    key: 'FREE_TRIAL_BILLS',
    value: '1',
    description: 'Number of free trial bills for new users',
    dataType: 'number'
  },
  {
    key: 'LOW_CREDIT_THRESHOLD',
    value: '50',
    description: 'Credit balance threshold for low credit warning',
    dataType: 'number'
  },
  {
    key: 'PROVISIONAL_INDICES_CHECK_ENABLED',
    value: 'true',
    description: 'Enable/disable validation to prevent bill processing if provisional indices match measurement date',
    dataType: 'boolean'
  },
  {
    key: 'ADMIN_CAN_DELETE_OTHER_USERS_BILLS',
    value: 'false',
    description: 'Allow admins to delete bills created by other users. When disabled, admins can only delete their own bills.',
    dataType: 'boolean'
  },
  {
    key: 'ALLOW_MULTIPLE_BILL_EDITS',
    value: 'false',
    description: 'Allow users to edit bills multiple times. When disabled, bills can only be edited once.',
    dataType: 'boolean'
  },
  {
    key: 'PAYMENT_METHOD',
    value: 'manual',
    description: 'Payment method for credit top-ups (manual or razorpay)',
    dataType: 'string'
  },
  {
    key: 'SINGLE_BILL_MAINTENANCE_ENABLED',
    value: 'false',
    description: 'Enable maintenance mode for single bill creation. When enabled, users cannot create individual bills.',
    dataType: 'boolean'
  },
  {
    key: 'BULK_BILLING_MAINTENANCE_ENABLED',
    value: 'false',
    description: 'Enable maintenance mode for bulk billing. When enabled, users cannot create bills in bulk.',
    dataType: 'boolean'
  },
  {
    key: 'EMAIL_VERIFICATION_REQUIRED',
    value: 'true',
    description: 'Require users to verify their email before accessing the system. When disabled, users can sign up and access the system immediately without email verification.',
    dataType: 'boolean'
  },
  {
    key: 'RAILWAY_OFFICIAL_CONTRACT_LIMIT',
    value: '5',
    description: 'Maximum number of contracts a Railway Official free account can create in total. Set to 0 for unlimited.',
    dataType: 'number'
  },
  {
    key: 'AI_MODEL',
    value: 'gemini-3.8-flash',
    description: 'Which AI model reads uploaded LOAs, agreements and bills (sent to Abacus RouteLLM). Examples: gemini-3.8-flash, route-llm (Abacus auto-router), gpt-4.1. Leave as the default unless you know the exact model name your Abacus account exposes.',
    dataType: 'string'
  },
  {
    key: 'SCANNED_LOA_OCR_ENABLED',
    value: 'false',
    description: 'Read a scanned LOA/agreement (no text layer) through the Docling OCR service. Accurate but slow (minutes on CPU), so OFF by default. When off, a scanned agreement PDF is not sent to OCR — the user is asked to upload the original text PDF.',
    dataType: 'boolean'
  },
  {
    key: 'OCR_FALLBACK_ENABLED',
    value: 'false',
    description: 'PROTOTYPE. When a bill PDF has no readable text (Print-to-PDF, screenshot, or scan), read the page images with AI instead of rejecting it. The result is a draft the user must review. Off by default while accuracy and cost are measured.',
    dataType: 'boolean'
  },
  {
    key: 'BILL_PACKS',
    value: JSON.stringify([
      { bills: 10, price: 1499 }, { bills: 30, price: 3499 },
      { bills: 10, price: 3999, ai: true }, { bills: 30, price: 9999, ai: true },
    ]),
    description: 'Bill packs offered in the top-up dialog, as JSON: [{"bills":10,"price":1499}, {"bills":10,"price":3999,"ai":true}, ...]. "price" is rupees before GST. A normal pack credits bills × BILL_PROCESSING_COST; a pack with "ai": true credits bills × AI_BILL_PROCESSING_COST. The discount arrives as extra credits. Set to [] to sell no packs.',
    dataType: 'json'
  }
];

// GET /api/admin/settings - Get all admin settings
export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    // Get all settings from database
    let settings = await prisma.adminSettings.findMany({
      orderBy: { key: 'asc' }
    });

    // This legacy fee is no longer charged; AI extraction is included in AI bill processing.
    settings = settings.filter((setting: any) => setting.key !== 'AI_BILL_EXTRACTION_COST');

    // Check if any default settings are missing and add them
    const existingKeys = new Set(settings.map((s: any) => s.key));
    const missingSettings = DEFAULT_SETTINGS.filter(
      defaultSetting => !existingKeys.has(defaultSetting.key)
    );

    if (missingSettings.length > 0) {
      await prisma.$transaction(async (prisma: any) => {
        for (const setting of missingSettings) {
          await prisma.adminSettings.create({ data: setting });
        }
      });

      // Refresh settings after adding missing ones
      settings = await prisma.adminSettings.findMany({
        orderBy: { key: 'asc' }
      });
      settings = settings.filter((setting: any) => setting.key !== 'AI_BILL_EXTRACTION_COST');
    }

    return NextResponse.json(settings);

  } catch (error) {
    console.error('Error fetching admin settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin settings' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/settings - Update multiple settings
export async function PUT(request: NextRequest) {
  try {
    // Check admin access
    const { authorized, user: adminUser, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json(
        { error: 'Settings array is required' },
        { status: 400 }
      );
    }

    // Update settings in transaction
    const updatedSettings = await prisma.$transaction(async (prisma: any) => {
      const results = [];
      
      for (const setting of settings) {
        const { key, value } = setting;
        
        if (!key || value === undefined) {
          continue;
        }

        const updated = await prisma.adminSettings.upsert({
          where: { key },
          update: {
            value: String(value),
            updatedByUserId: adminUser.id,
            updatedByUserEmail: adminUser.email
          },
          create: {
            key,
            value: String(value),
            description: setting.description || '',
            dataType: setting.dataType || 'string',
            updatedByUserId: adminUser.id,
            updatedByUserEmail: adminUser.email
          }
        });
        
        results.push(updated);
      }
      
      return results;
    });

    // Clear the settings cache to ensure changes take effect immediately
    clearSettingsCache();

    return NextResponse.json({
      message: 'Settings updated successfully',
      updatedSettings
    });

  } catch (error) {
    console.error('Error updating admin settings:', error);
    return NextResponse.json(
      { error: 'Failed to update admin settings' },
      { status: 500 }
    );
  }
}
