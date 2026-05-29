
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
