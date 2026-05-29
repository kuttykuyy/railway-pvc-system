
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/role-auth';

export async function POST(req: NextRequest) {
  try {
    // Check if user is admin
    const { isAdmin } = await isUserAdmin();
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only admins can modify settings.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { allowProvisional } = body;

    if (typeof allowProvisional !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid value. Must be a boolean.' },
        { status: 400 }
      );
    }

    // Update or create the setting
    const setting = await prisma.adminSettings.upsert({
      where: { key: 'allow_provisional_indices' },
      update: {
        value: String(allowProvisional),
        updatedAt: new Date(),
      },
      create: {
        key: 'allow_provisional_indices',
        value: String(allowProvisional),
        description: 'Allow provisional indices in PVC calculations',
        dataType: 'boolean',
      },
    });

    return NextResponse.json({
      success: true,
      setting: {
        key: setting.key,
        value: setting.value === 'true',
        description: setting.description,
      },
    });
  } catch (error) {
    console.error('Error updating provisional indices setting:', error);
    return NextResponse.json(
      { error: 'Failed to update setting' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const setting = await prisma.adminSettings.findUnique({
      where: { key: 'allow_provisional_indices' },
    });

    if (!setting) {
      // Return default value if setting doesn't exist
      return NextResponse.json({
        key: 'allow_provisional_indices',
        value: true,
        description: 'Allow provisional indices in PVC calculations',
      });
    }

    return NextResponse.json({
      key: setting.key,
      value: setting.value === 'true',
      description: setting.description,
    });
  } catch (error) {
    console.error('Error fetching provisional indices setting:', error);
    return NextResponse.json(
      { error: 'Failed to fetch setting' },
      { status: 500 }
    );
  }
}
