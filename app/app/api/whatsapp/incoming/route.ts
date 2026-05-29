
/**
 * Incoming WhatsApp Webhook Endpoint
 * Receives messages from MyDreams WhatsApp API and processes them
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingMessage } from '@/lib/whatsapp-message-handler';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST handler for incoming WhatsApp messages
 * 
 * Expected payload from MyDreams API (based on typical webhook formats):
 * {
 *   "contact": "91XXXXXXXXXX",
 *   "message": "User message text",
 *   "messageId": "unique_message_id",
 *   "timestamp": "2025-11-08T10:30:00Z"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook is configured
    const webhookEnabled = await prisma.adminSettings.findUnique({
      where: { key: 'whatsapp_webhook_enabled' },
    });

    if (!webhookEnabled || webhookEnabled.value !== 'true') {
      console.log('WhatsApp webhook is not enabled');
      return NextResponse.json({ error: 'Webhook not enabled' }, { status: 403 });
    }

    // Parse incoming webhook payload
    const payload = await req.json();
    console.log('Incoming WhatsApp webhook:', payload);

    // Extract message data (adjust based on actual MyDreams webhook format)
    const contact = payload.contact || payload.from || payload.phoneNumber;
    const message = payload.message || payload.text || payload.body;
    const messageId = payload.messageId || payload.id || payload.message_id;

    if (!contact || !message) {
      console.error('Invalid webhook payload:', payload);
      return NextResponse.json(
        { error: 'Invalid payload: missing contact or message' },
        { status: 400 }
      );
    }

    console.log('Processing WhatsApp message:', {
      contact,
      message: message.substring(0, 100),
      messageId,
    });

    // Handle the message asynchronously
    handleIncomingMessage(contact, message).catch((error) => {
      console.error('Error handling WhatsApp message:', error);
    });

    // Respond immediately to webhook (don't wait for processing)
    return NextResponse.json({
      success: true,
      message: 'Message received and queued for processing',
    });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET handler for webhook verification (if required by MyDreams)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Some webhook providers use GET for verification
    const verifyToken = searchParams.get('verify_token');
    const challenge = searchParams.get('challenge');

    // Get expected verification token from settings
    const expectedToken = await prisma.adminSettings.findUnique({
      where: { key: 'whatsapp_webhook_verify_token' },
    });

    if (verifyToken && challenge) {
      if (verifyToken === expectedToken?.value) {
        return new NextResponse(challenge, { status: 200 });
      } else {
        return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
      }
    }

    return NextResponse.json({
      message: 'WhatsApp Incoming Webhook Endpoint',
      status: 'active',
      endpoint: `${process.env.NEXTAUTH_URL}/api/whatsapp/incoming`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
