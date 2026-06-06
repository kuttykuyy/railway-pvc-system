import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Button,
  Hr,
  Link,
} from '@react-email/components';

interface VerificationEmailProps {
  verificationUrl: string;
  userEmail: string;
}

export const VerificationEmail = ({
  verificationUrl,
  userEmail,
}: VerificationEmailProps) => {
  return (
    <Html lang="en">
      <Head />
      <Body style={main}>
        <Container style={wrapper}>
          {/* Header */}
          <Section style={header}>
            <Row>
              <Column align="center">
                <div style={logoMark}>🚂</div>
                <Text style={brandName}>IR PVC System</Text>
                <Text style={brandSub}>Indian Railways · Price Variation Calculator</Text>
              </Column>
            </Row>
          </Section>

          {/* Body */}
          <Section style={body}>
            <div style={iconCircle}>✉️</div>

            <Text style={title}>Verify your email address</Text>

            <Text style={bodyText}>
              You're almost there! Click the button below to verify your email and activate your IR PVC System account.
            </Text>

            <Section style={highlightBox}>
              <Text style={highlightLabel}>Verifying account for</Text>
              <Text style={highlightEmail}>{userEmail}</Text>
            </Section>

            <Section style={buttonWrap}>
              <Button style={ctaButton} href={verificationUrl}>
                Verify Email Address
              </Button>
            </Section>

            <Text style={expiry}>⏱ This link expires in <strong>24 hours</strong></Text>

            <Hr style={divider} />

            <Text style={altLinkLabel}>Button not working? Copy and paste this URL into your browser:</Text>
            <Link href={verificationUrl} style={altLink}>{verificationUrl}</Link>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Hr style={footerDivider} />
            <Text style={footerText}>
              If you didn't create an account with IR PVC System, you can safely ignore this email — no action is needed.
            </Text>
            <Text style={footerCopy}>© {new Date().getFullYear()} IR PVC System · All rights reserved</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default VerificationEmail;

const main: React.CSSProperties = {
  backgroundColor: '#f0f4f8',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 0',
};

const wrapper: React.CSSProperties = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  maxWidth: '560px',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
};

const header: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
  padding: '32px 24px 28px',
  textAlign: 'center',
};

const logoMark: React.CSSProperties = {
  fontSize: '36px',
  lineHeight: '1',
  marginBottom: '8px',
};

const brandName: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: '700',
  color: '#ffffff',
  margin: '0 0 4px',
  letterSpacing: '-0.3px',
};

const brandSub: React.CSSProperties = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.7)',
  margin: '0',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const body: React.CSSProperties = {
  padding: '40px 48px',
  textAlign: 'center',
};

const iconCircle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: '#eff6ff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '28px',
  margin: '0 auto 24px',
  lineHeight: '64px',
};

const title: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#111827',
  margin: '0 0 12px',
  letterSpacing: '-0.5px',
};

const bodyText: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#4b5563',
  margin: '0 0 28px',
};

const highlightBox: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '14px 20px',
  margin: '0 0 32px',
};

const highlightLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: '600',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  margin: '0 0 4px',
};

const highlightEmail: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: '600',
  color: '#1e40af',
  margin: '0',
};

const buttonWrap: React.CSSProperties = {
  margin: '0 0 20px',
};

const ctaButton: React.CSSProperties = {
  backgroundColor: '#1d4ed8',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '14px 40px',
  display: 'inline-block',
  boxShadow: '0 2px 8px rgba(29,78,216,0.35)',
};

const expiry: React.CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '0 0 28px',
};

const divider: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '0 0 20px',
};

const altLinkLabel: React.CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '0 0 8px',
};

const altLink: React.CSSProperties = {
  fontSize: '12px',
  color: '#1d4ed8',
  wordBreak: 'break-all',
};

const footer: React.CSSProperties = {
  padding: '0 48px 32px',
  textAlign: 'center',
};

const footerDivider: React.CSSProperties = {
  borderColor: '#f1f5f9',
  margin: '0 0 16px',
};

const footerText: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#9ca3af',
  margin: '0 0 8px',
};

const footerCopy: React.CSSProperties = {
  fontSize: '11px',
  color: '#d1d5db',
  margin: '0',
};
