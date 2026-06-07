import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkRailwayOfficialContractQuota } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

const ADMIN_PHONE = '919944776689'; // Admin WhatsApp number

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true, phone: true, role: true, railwayZone: true, designation: true, division: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.role !== 'railway_official') {
      return NextResponse.json({ error: 'Not applicable' }, { status: 403 });
    }

    const quota = await checkRailwayOfficialContractQuota(user.id);

    // welcome_new_user template: {{1}} = name, {{2}} = email
    const params = [
      user.name || 'Railway Official', // {{1}}
      user.email,                       // {{2}}
    ];

    const [lic, apiKey] = await Promise.all([
      prisma.adminSettings.findUnique({ where: { key: 'mydreams_license_number' } }),
      prisma.adminSettings.findUnique({ where: { key: 'mydreams_api_key' } }),
    ]);

    if (!lic?.value || !apiKey?.value) {
      return NextResponse.json({ error: 'WhatsApp API not configured' }, { status: 500 });
    }

    const sendTemplate = async (contact: string) => {
      const url = new URL('https://wa.mydreamstechnology.in/api/sendtemplate.php');
      url.searchParams.append('LicenseNumber', lic.value);
      url.searchParams.append('APIKey', apiKey.value);
      url.searchParams.append('Contact', contact);
      url.searchParams.append('Template', 'welcome_new_user');
      url.searchParams.append('Param', params.join(','));
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      return res.json().catch(() => ({}));
    };

    // Send to admin
    const adminData = await sendTemplate(ADMIN_PHONE);
    const adminOk = adminData.ApiResponse === 'Success' || adminData.status === 'success' || adminData.ApiMessage?.Status === 'Success';

    if (!adminOk) {
      return NextResponse.json(
        { error: 'Failed to send message. Please call admin directly.' },
        { status: 500 }
      );
    }

    // Send confirmation to user (best-effort — don't fail if user has no phone)
    if (user.phone) {
      const userPhone = user.phone.replace(/\D/g, '');
      await sendTemplate(userPhone.startsWith('91') ? userPhone : `91${userPhone}`).catch(() => {});
    }

    return NextResponse.json({ success: true, message: 'Request sent to admin via WhatsApp.' });
  } catch (err: any) {
    console.error('Quota increase request error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
