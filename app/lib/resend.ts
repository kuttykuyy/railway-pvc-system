
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set in environment variables');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export function getVerificationEmailHtml(verificationUrl: string, userEmail: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify your email address</title>
      </head>
      <body style="background-color: #f6f9fc; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; margin: 0; padding: 0;">
        <div style="background-color: #ffffff; margin: 60px auto; padding: 20px 0 48px; max-width: 580px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #1e40af; padding: 24px; border-top-left-radius: 8px; border-top-right-radius: 8px; text-align: center;">
            <h1 style="font-size: 24px; font-weight: bold; color: #ffffff; margin: 0;">Railway PVC System</h1>
          </div>
          
          <div style="padding: 24px 32px;">
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">Hello,</p>
            
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">
              Thank you for registering with Railway PVC System. Please verify your email address to activate your account.
            </p>
            
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">
              Email: <strong>${userEmail}</strong>
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verificationUrl}" style="background-color: #1e40af; border-radius: 6px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; display: inline-block; padding: 12px 32px;">
                Verify Email Address
              </a>
            </div>
            
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">
              Or copy and paste this URL into your browser:
            </p>
            
            <p style="font-size: 14px; color: #1e40af; text-decoration: none; word-break: break-all; margin: 16px 0;">${verificationUrl}</p>
            
            <hr style="border-top: 1px solid #e5e5e5; margin: 32px 0;" />
            
            <p style="font-size: 14px; line-height: 20px; color: #737373; margin: 8px 0;">
              If you didn't create an account with Railway PVC System, you can safely ignore this email.
            </p>
            
            <p style="font-size: 14px; line-height: 20px; color: #737373; margin: 8px 0;">
              This verification link will expire in 24 hours.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function getAiFeatureAnnouncementHtml(appUrl: string = 'https://irpvc.in') {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>New: Automatic PDF Bill Extraction</title>
  </head>
  <body style="margin:0; padding:0; background-color:#eef2f8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <span style="display:none; font-size:1px; color:#eef2f8; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Upload your signed railway bill PDF and IR-PVC fills in the schedules, quantities, rates and classifications for you.</span>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f8; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(15,23,42,0.10);">

            <!-- Header -->
            <tr>
              <td style="background:#1e3a8a; background-image:linear-gradient(135deg,#1e40af 0%,#4338ca 100%); padding:34px 40px 30px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:15px; font-weight:700; letter-spacing:0.4px; color:#c7d2fe;">IR-PVC</td>
                    <td align="right" style="font-size:11px; font-weight:600; color:#c7d2fe; text-transform:uppercase; letter-spacing:1px;">Product Update</td>
                  </tr>
                </table>
                <div style="display:inline-block; margin-top:22px; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#1e3a8a; background:#ffffff; border-radius:999px; padding:5px 14px;">✨ New Feature</div>
                <h1 style="margin:14px 0 0; font-size:27px; line-height:34px; font-weight:800; color:#ffffff;">Upload the bill PDF.<br>Get a ready PVC bill.</h1>
                <p style="margin:12px 0 0; font-size:15px; line-height:23px; color:#dbeafe;">No more typing every line — let IR-PVC read your signed railway bill for you.</p>
              </td>
            </tr>

            <!-- Intro -->
            <tr>
              <td style="padding:32px 40px 8px;">
                <p style="margin:0; font-size:16px; line-height:25px; color:#334155;">
                  Hello,<br><br>
                  We've launched <strong style="color:#0f172a;">Automatic PDF Bill Extraction</strong>. Upload your signed railway bill PDF and IR-PVC instantly reads out the schedules, current quantities, agreement rates, work classifications, and cement/steel material calculations — all laid out for a quick review before you save.
                </p>
              </td>
            </tr>

            <!-- Feature highlights -->
            <tr>
              <td style="padding:20px 40px 4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" valign="top" style="padding:10px 8px 10px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e6ebf2; border-radius:10px;">
                        <tr><td style="padding:14px 16px;"><span style="font-size:20px;">📄</span><p style="margin:8px 0 2px; font-size:14px; font-weight:700; color:#0f172a;">Reads the whole bill</p><p style="margin:0; font-size:12.5px; line-height:19px; color:#64748b;">Schedules, items, quantities &amp; rates captured automatically.</p></td></tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding:10px 0 10px 8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e6ebf2; border-radius:10px;">
                        <tr><td style="padding:14px 16px;"><span style="font-size:20px;">🏷️</span><p style="margin:8px 0 2px; font-size:14px; font-weight:700; color:#0f172a;">Auto-classifies work</p><p style="margin:0; font-size:12.5px; line-height:19px; color:#64748b;">GCC classifications &amp; cement/steel splits, ready to review.</p></td></tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" valign="top" style="padding:0 8px 10px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e6ebf2; border-radius:10px;">
                        <tr><td style="padding:14px 16px;"><span style="font-size:20px;">👀</span><p style="margin:8px 0 2px; font-size:14px; font-weight:700; color:#0f172a;">You stay in control</p><p style="margin:0; font-size:12.5px; line-height:19px; color:#64748b;">Every extracted line is editable before you save.</p></td></tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding:0 0 10px 8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e6ebf2; border-radius:10px;">
                        <tr><td style="padding:14px 16px;"><span style="font-size:20px;">📚</span><p style="margin:8px 0 2px; font-size:14px; font-weight:700; color:#0f172a;">Single or bulk</p><p style="margin:0; font-size:12.5px; line-height:19px; color:#64748b;">Works for one bill or a whole batch upload.</p></td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- How it works -->
            <tr>
              <td style="padding:16px 40px 6px;">
                <p style="margin:0 0 12px; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#94a3b8;">How it works</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="24" valign="top"><div style="width:22px; height:22px; border-radius:999px; background:#1e40af; color:#ffffff; font-size:12px; font-weight:700; text-align:center; line-height:22px;">1</div></td>
                    <td style="padding:0 0 12px 10px; font-size:14px; line-height:22px; color:#334155;">Open <strong>Create Bill</strong> and upload your signed bill PDF.</td>
                  </tr>
                  <tr>
                    <td width="24" valign="top"><div style="width:22px; height:22px; border-radius:999px; background:#1e40af; color:#ffffff; font-size:12px; font-weight:700; text-align:center; line-height:22px;">2</div></td>
                    <td style="padding:0 0 12px 10px; font-size:14px; line-height:22px; color:#334155;">Review the extracted items, classifications and amounts.</td>
                  </tr>
                  <tr>
                    <td width="24" valign="top"><div style="width:22px; height:22px; border-radius:999px; background:#1e40af; color:#ffffff; font-size:12px; font-weight:700; text-align:center; line-height:22px;">3</div></td>
                    <td style="padding:0 0 4px 10px; font-size:14px; line-height:22px; color:#334155;">Save — your IR Standard PVC statement is ready.</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Pricing -->
            <tr>
              <td style="padding:22px 40px 6px;">
                <p style="margin:0 0 12px; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#94a3b8;">Simple, transparent pricing</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" valign="top" style="padding-right:8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
                        <tr><td style="padding:16px 18px;"><p style="margin:0 0 6px; font-size:12px; font-weight:700; color:#475569;">✍️ Manual entry</p><p style="margin:0; font-size:26px; font-weight:800; color:#0f172a;">₹199<span style="font-size:12px; font-weight:500; color:#94a3b8;"> / bill</span></p></td></tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding-left:8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px;">
                        <tr><td style="padding:16px 18px;"><p style="margin:0 0 6px; font-size:12px; font-weight:700; color:#4338ca;">🤖 AI PDF auto-extract</p><p style="margin:0; font-size:26px; font-weight:800; color:#3730a3;">₹499<span style="font-size:12px; font-weight:500; color:#818cf8;"> / bill</span></p></td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <p style="margin:12px 0 0; font-size:12.5px; line-height:19px; color:#64748b;">
                  Extraction and preview are <strong style="color:#0f172a;">free</strong> — you're charged only when you save a bill. Your <strong style="color:#0f172a;">first bill is always free</strong>. Bulk creation uses the same per-bill rates.
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:28px 40px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px; background:#1e40af; background-image:linear-gradient(135deg,#1e40af 0%,#4338ca 100%);">
                      <a href="${appUrl}" style="display:inline-block; padding:14px 40px; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px;">Try it on your next bill →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 40px 30px;">
                <hr style="border:none; border-top:1px solid #eef2f7; margin:0 0 16px;">
                <p style="margin:0; font-size:12px; line-height:19px; color:#94a3b8;">
                  You're receiving this because you have an IR-PVC account.<br>
                  Developed for the Southern Railway Contractors Association, Tiruchirappalli Division · <a href="${appUrl}" style="color:#64748b; text-decoration:underline;">irpvc.in</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function getResetPasswordEmailHtml(resetUrl: string, userEmail: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
      </head>
      <body style="background-color: #f6f9fc; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; margin: 0; padding: 0;">
        <div style="background-color: #ffffff; margin: 60px auto; padding: 20px 0 48px; max-width: 580px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #1e40af; padding: 24px; border-top-left-radius: 8px; border-top-right-radius: 8px; text-align: center;">
            <h1 style="font-size: 24px; font-weight: bold; color: #ffffff; margin: 0;">Railway PVC System</h1>
          </div>
          
          <div style="padding: 24px 32px;">
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">Hello,</p>
            
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">
              We received a request to reset the password for your Railway PVC System account.
            </p>
            
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">
              Email: <strong>${userEmail}</strong>
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}" style="background-color: #1e40af; border-radius: 6px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; display: inline-block; padding: 12px 32px;">
                Reset Password
              </a>
            </div>
            
            <p style="font-size: 16px; line-height: 24px; color: #525252; margin: 16px 0;">
              Or copy and paste this URL into your browser:
            </p>
            
            <p style="font-size: 14px; color: #1e40af; text-decoration: none; word-break: break-all; margin: 16px 0;">${resetUrl}</p>
            
            <hr style="border-top: 1px solid #e5e5e5; margin: 32px 0;" />
            
            <p style="font-size: 14px; line-height: 20px; color: #737373; margin: 8px 0;">
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
            
            <p style="font-size: 14px; line-height: 20px; color: #737373; margin: 8px 0;">
              This password reset link will expire in 1 hour for security reasons.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}
