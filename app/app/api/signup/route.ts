
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { notifyNewUserSignup } from '@/lib/slack-webhook';
import { resend } from '@/lib/resend';
import { VerificationEmail } from '@/emails/verification-email';
import { randomBytes } from 'crypto';
import { validatePhoneNumber, sendUserSignupWelcome, sendWelcomeMessageToUser, getAdminWhatsAppNumber } from '@/lib/whatsapp-mydreams';
import { isEmailVerificationRequired } from '@/lib/admin-settings';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, whatsappNumber } = await request.json();


    if (!email || !password || !fullName || !whatsappNumber) {
      return NextResponse.json(
        { error: 'Email, password, full name, and WhatsApp number are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Validate WhatsApp number format
    if (!validatePhoneNumber(whatsappNumber)) {
      return NextResponse.json(
        { error: 'Invalid WhatsApp number format. Use format: +[country code][number] (e.g., +919876543210)' },
        { status: 400 }
      );
    }

    // Verify that phone OTP was completed
    const verifiedOtp = await prisma.phoneOtp.findFirst({
      where: {
        phone: whatsappNumber,
        verified: true,
        expiresAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // verified within last 10 min
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verifiedOtp) {
      return NextResponse.json(
        { error: 'WhatsApp number not verified. Please verify your number with OTP first.' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Check if email verification is required
    const emailVerificationRequired = await isEmailVerificationRequired();

    // Generate verification token (only if verification is required)
    const token = emailVerificationRequired ? randomBytes(32).toString('hex') : null;
    const expires = emailVerificationRequired ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null; // 24 hours from now

    // Create user with customer account in a transaction
    const result = await prisma.$transaction(async (prisma: any) => {
      // Create user (emailVerified set based on admin setting)
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name: fullName,
          phone: whatsappNumber,
          emailVerified: emailVerificationRequired ? null : new Date(), // Auto-verify if not required
          freeTrialUsed: 0,
          isTrialActive: true,
          totalBillsProcessed: 0
        }
      });

      // Create customer account
      const customerAccount = await prisma.customerAccount.create({
        data: {
          userId: user.id,
          status: 'active',
          currentTier: 'standard',
          creditBalance: 0,
          monthlyBillCount: 0,
          currentMonthBills: 0,
          lastMonthBills: 0
        }
      });

      // Create verification token (only if verification is required)
      if (emailVerificationRequired && token && expires) {
        await prisma.verificationToken.create({
          data: {
            identifier: user.email,
            token,
            expires,
          }
        });
      }

      return { user, customerAccount, token };
    });

    // Send verification email (only if verification is required)
    if (emailVerificationRequired && result.token) {
      try {
        // Get base URL with multiple fallbacks for reliability
        const envUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
        const forwardedHost = request.headers.get('x-forwarded-host');
        const host = request.headers.get('host');
        
        let baseUrl: string;
        if (envUrl && envUrl.includes('irpvc.in')) {
          baseUrl = envUrl;
        } else if (forwardedHost) {
          baseUrl = `https://${forwardedHost}`;
        } else if (host && host.includes('irpvc.in')) {
          baseUrl = `https://${host}`;
        } else {
          baseUrl = 'https://irpvc.in';
        }
        
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${result.token}`;
        
        console.log('[Signup] Sending verification email to:', result.user.email);
        console.log('[Signup] Verification URL:', verificationUrl);
        
        await resend.emails.send({
          from: 'Railway PVC System <noreply@irpvc.in>',
          to: result.user.email,
          subject: 'Verify your email address',
          react: VerificationEmail({
            verificationUrl,
            userEmail: result.user.email,
          }),
        });

        console.log('✅ Verification email sent to:', result.user.email);
      } catch (emailError) {
        console.error('❌ Failed to send verification email:', emailError);
        // Don't fail the signup if email fails, but log it
      }
    } else {
      console.log('ℹ️ Email verification disabled - user auto-verified:', result.user.email);
    }

    // Send welcome email to new user (async, non-blocking)
    try {
      const appUrl = process.env.NEXTAUTH_URL || 'https://irpvc.in';
      const appHost = (() => { try { return new URL(appUrl).hostname; } catch { return 'irpvc.in'; } })();

      const welcomeHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #1e40af, #4f46e5); border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Welcome to IR-PVC! 🎉</h1>
            <p style="color: #c7d2fe; margin: 8px 0 0; font-size: 14px;">Indian Railway Price Variation Clause System</p>
          </div>

          <div style="padding: 30px 24px; background: #fff; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin: 0 0 20px;">Hello <strong>${fullName}</strong>,</p>
            <p style="margin: 0 0 20px; line-height: 1.6;">Your account has been created successfully. Here's a quick guide to get you started with PVC bill generation.</p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
              <h3 style="margin: 0 0 12px; color: #1e40af; font-size: 15px;">🚀 Getting Started</h3>
              <ol style="margin: 0; padding-left: 20px; line-height: 1.8; font-size: 14px;">
                <li><strong>Add your Contract</strong> — Enter your LOA details, agreement number, base month, and work description.</li>
                <li><strong>Create a Bill</strong> — Add line items with GCC classification codes and measurement period details.</li>
                <li><strong>Auto PVC Calculation</strong> — The system fetches the latest price indices and calculates PVC automatically.</li>
                <li><strong>Download PDF</strong> — Get your PVC statement as a ready-to-submit PDF document.</li>
              </ol>
            </div>

            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
              <h3 style="margin: 0 0 8px; color: #166534; font-size: 15px;">🎁 Free Trial</h3>
              <p style="margin: 0; font-size: 14px; line-height: 1.6;">You have <strong>1 free bill</strong> to explore the platform. After that, check the pricing section on our homepage for volume-based discounts.</p>
            </div>

            <div style="background: #fefce8; border-left: 4px solid #ca8a04; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
              <h3 style="margin: 0 0 8px; color: #854d0e; font-size: 15px;">📚 Need Help?</h3>
              <p style="margin: 0; font-size: 14px; line-height: 1.6;">
                • Visit the <a href="${appUrl}/help" style="color: #2563eb; text-decoration: underline;">Help Center</a> for detailed guides<br/>
                • Use the <strong>AI Assistant</strong> (chat icon on every page) to ask questions<br/>
                • WhatsApp support: <strong>+91 99447 76689</strong>
              </p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${appUrl}/contracts" style="display: inline-block; padding: 12px 32px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Start Adding Your Contract →</a>
            </div>
          </div>

          <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; background: #f9fafb;">
            <p style="margin: 0;">Developed by Southern Railway Contractors Association — Tiruchirappalli Division</p>
          </div>
        </div>
      `;

      fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_WELCOME_EMAIL,
          subject: `Welcome to IR-PVC, ${fullName}! Here's how to get started`,
          body: welcomeHtml,
          is_html: true,
          recipient_email: email.toLowerCase(),
          sender_email: `noreply@${appHost}`,
          sender_alias: 'IR-PVC System',
        }),
      }).then(async (res) => {
        const data = await res.json();
        if (data.success) {
          console.log('✅ Welcome email sent to:', email);
        } else {
          console.error('❌ Welcome email failed:', data.message);
        }
      }).catch((err) => {
        console.error('❌ Welcome email error:', err);
      });
    } catch (welcomeEmailError) {
      console.error('❌ Welcome email setup error:', welcomeEmailError);
    }

    // Send Slack notification asynchronously (don't await to avoid delaying response)
    notifyNewUserSignup({
      email: result.user.email,
      fullName: result.user.name || 'N/A',
      userId: result.user.id,
      signupDate: result.user.createdAt
    }).catch(error => {
      // Log but don't fail the signup if Slack notification fails
      console.error('⚠️ Failed to send Slack notification for new signup:', error);
    });

    // Send WhatsApp notification to admin about new user signup (don't await to avoid delaying response)
    getAdminWhatsAppNumber().then(async (adminWhatsAppNumber) => {
      if (!adminWhatsAppNumber) {
        console.warn('⚠️ Admin WhatsApp number not configured, skipping notification');
        return;
      }

      const whatsappResult = await sendUserSignupWelcome(
        adminWhatsAppNumber, // Send to admin, not user
        result.user.name || 'User',
        result.user.email,
        whatsappNumber || 'N/A', // User's WhatsApp shown as company field
        result.user.createdAt
      );

      if (whatsappResult.success) {
        console.log('✅ WhatsApp signup notification sent to admin:', adminWhatsAppNumber);
        console.log('- New user:', result.user.email);
        console.log('- Message ID:', whatsappResult.messageId);
        
        // Log to database for tracking
        prisma.whatsAppLog.create({
          data: {
            userId: result.user.id,
            phoneNumber: adminWhatsAppNumber,
            recipientName: 'Admin',
            template: 'user_signup_welcome',
            parameters: {
              userName: result.user.name || 'User',
              email: result.user.email,
              companyName: whatsappNumber || 'N/A', // User's phone shown here
              registrationDate: result.user.createdAt.toISOString()
            },
            messageId: whatsappResult.messageId || 'unknown',
            status: 'sent',
            sentAt: new Date(),
          }
        }).catch((err: any) => console.error('Failed to log WhatsApp message:', err));
      } else {
        console.error('❌ Failed to send WhatsApp notification to admin:', whatsappResult.error);
      }
    }).catch(error => {
      console.error('⚠️ Error in admin WhatsApp notification flow:', error);
    });

    // Send welcome WhatsApp message to the user (async, non-blocking)
    if (whatsappNumber && validatePhoneNumber(whatsappNumber)) {
      sendWelcomeMessageToUser(
        whatsappNumber,
        result.user.name || 'User',
        result.user.id
      ).then((userWhatsappResult) => {
        if (userWhatsappResult.success) {
          console.log('✅ Welcome WhatsApp message sent to user:', whatsappNumber);
          console.log('- Message ID:', userWhatsappResult.messageId);
          
          // Log to database for tracking
          prisma.whatsAppLog.create({
            data: {
              userId: result.user.id,
              phoneNumber: whatsappNumber,
              recipientName: result.user.name || 'User',
              template: 'welcome_new_user',
              parameters: {
                userName: result.user.name || 'User',
                supportNumber: '+919944776689'
              },
              messageId: userWhatsappResult.messageId || 'unknown',
              status: 'sent',
              sentAt: new Date(),
            }
          }).catch((err: any) => console.error('Failed to log user WhatsApp message:', err));
        } else {
          console.error('❌ Failed to send welcome WhatsApp to user:', userWhatsappResult.error);
        }
      }).catch(error => {
        console.error('⚠️ Error in user WhatsApp welcome flow:', error);
      });
    } else {
      console.log('⚠️ User WhatsApp number not valid or missing, skipping welcome message');
    }

    return NextResponse.json(
      { 
        message: emailVerificationRequired 
          ? 'User created successfully. Please check your email to verify your account.'
          : 'User created successfully. You can now sign in to your account.', 
        userId: result.user.id,
        success: true,
        requiresVerification: emailVerificationRequired
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('🚨 Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
