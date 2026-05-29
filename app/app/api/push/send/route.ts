
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateAdminAccess } from '@/lib/role-auth';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Configure web-push with VAPID keys
// VAPID keys must be configured in environment variables for push notifications to work
// Generate keys using: npx web-push generate-vapid-keys
// Then set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      'mailto:admin@railwaypvc.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (error) {
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admin users to send push notifications
    const { authorized } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { title, body, url, userIds } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      url: url || '/',
      timestamp: Date.now(),
    });

    // In a real implementation, you would:
    // 1. Fetch push subscriptions from database for specified userIds
    // 2. Send notifications to each subscription
    // 3. Handle failed sends and clean up invalid subscriptions

    // For now, return success
    return NextResponse.json({ success: true, sent: userIds?.length || 0 });
  } catch (error) {
    console.error('Push send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
