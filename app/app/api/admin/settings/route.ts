
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { clearSettingsCache } from '@/lib/admin-settings';

export const dynamic = "force-dynamic";

// Default system settings
const DEFAULT_SETTINGS = [
  {
    key: 'BILL_PROCESSING_COST',
    value: '10',
    description: 'Cost in credits per bill processing',
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
    value: '3',
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
