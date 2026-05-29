
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadFile, deleteFile, getFileUrl } from '@/lib/s3';

export const dynamic = 'force-dynamic';

// GET /api/settings/branding - Get current branding settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        logoPath: true,
        reportHeaderText: true,
        reportHeaderColor: true,
        reportFooterText: true,
        showLogoInReports: true,
        companyName: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate signed URL for logo if it exists
    let logoUrl = null;
    if (user.logoPath) {
      try {
        logoUrl = await getFileUrl(user.logoPath, 3600); // 1 hour expiry
      } catch (error) {
        console.error('Error generating logo URL:', error);
      }
    }

    return NextResponse.json({
      logoPath: user.logoPath,
      logoUrl,
      reportHeaderText: user.reportHeaderText || 'INDIAN RAILWAY',
      reportHeaderColor: user.reportHeaderColor || '#000000',
      reportFooterText: user.reportFooterText || '',
      showLogoInReports: user.showLogoInReports,
      companyName: user.companyName,
    });
  } catch (error) {
    console.error('Error fetching branding settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch branding settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/branding - Update branding settings (non-logo fields)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { reportHeaderText, reportHeaderColor, reportFooterText, showLogoInReports } = body;

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        reportHeaderText: reportHeaderText || null,
        reportHeaderColor: reportHeaderColor || null,
        reportFooterText: reportFooterText || null,
        showLogoInReports: showLogoInReports !== undefined ? showLogoInReports : true,
      },
      select: {
        logoPath: true,
        reportHeaderText: true,
        reportHeaderColor: true,
        reportFooterText: true,
        showLogoInReports: true,
      },
    });

    // Generate signed URL for logo if it exists
    let logoUrl = null;
    if (user.logoPath) {
      try {
        logoUrl = await getFileUrl(user.logoPath, 3600);
      } catch (error) {
        console.error('Error generating logo URL:', error);
      }
    }

    return NextResponse.json({
      message: 'Branding settings updated successfully',
      logoPath: user.logoPath,
      logoUrl,
      reportHeaderText: user.reportHeaderText || 'INDIAN RAILWAY',
      reportHeaderColor: user.reportHeaderColor || '#000000',
      reportFooterText: user.reportFooterText || '',
      showLogoInReports: user.showLogoInReports,
    });
  } catch (error) {
    console.error('Error updating branding settings:', error);
    return NextResponse.json(
      { error: 'Failed to update branding settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings/branding - Upload logo
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, and GIF are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit' },
        { status: 400 }
      );
    }

    // Get current user to check for existing logo
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { logoPath: true, id: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete old logo if it exists
    if (currentUser.logoPath) {
      try {
        await deleteFile(currentUser.logoPath);
      } catch (error) {
        console.error('Error deleting old logo:', error);
        // Continue even if deletion fails
      }
    }

    // Upload new logo
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop();
    const fileName = `logos/${currentUser.id}-${Date.now()}.${ext}`;
    const logoPath = await uploadFile(buffer, fileName);

    // Update user with new logo path
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { logoPath },
      select: {
        logoPath: true,
        reportHeaderText: true,
        reportHeaderColor: true,
        reportFooterText: true,
        showLogoInReports: true,
      },
    });

    // Generate signed URL for the new logo
    const logoUrl = await getFileUrl(logoPath, 3600);

    return NextResponse.json({
      message: 'Logo uploaded successfully',
      logoPath: user.logoPath,
      logoUrl,
      reportHeaderText: user.reportHeaderText || 'INDIAN RAILWAY',
      reportHeaderColor: user.reportHeaderColor || '#000000',
      reportFooterText: user.reportFooterText || '',
      showLogoInReports: user.showLogoInReports,
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/branding - Delete logo
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { logoPath: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.logoPath) {
      return NextResponse.json({ error: 'No logo to delete' }, { status: 400 });
    }

    // Delete logo from S3
    try {
      await deleteFile(user.logoPath);
    } catch (error) {
      console.error('Error deleting logo from S3:', error);
    }

    // Update user to remove logo path
    await prisma.user.update({
      where: { email: session.user.email },
      data: { logoPath: null },
    });

    return NextResponse.json({ message: 'Logo deleted successfully' });
  } catch (error) {
    console.error('Error deleting logo:', error);
    return NextResponse.json(
      { error: 'Failed to delete logo' },
      { status: 500 }
    );
  }
}
