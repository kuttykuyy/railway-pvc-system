import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components';

interface ResetPasswordEmailProps {
  resetUrl: string;
  userEmail: string;
}

export const ResetPasswordEmail = ({
  resetUrl,
  userEmail,
}: ResetPasswordEmailProps) => {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>Railway PVC System</Text>
          </Section>
          
          <Section style={content}>
            <Text style={paragraph}>Hello,</Text>
            
            <Text style={paragraph}>
              We received a request to reset the password for your Railway PVC System account.
            </Text>
            
            <Text style={paragraph}>
              Email: <strong>{userEmail}</strong>
            </Text>
            
            <Section style={buttonContainer}>
              <Button style={button} href={resetUrl}>
                Reset Password
              </Button>
            </Section>
            
            <Text style={paragraph}>
              Or copy and paste this URL into your browser:
            </Text>
            
            <Text style={link}>{resetUrl}</Text>
            
            <Hr style={divider} />
            
            <Text style={footer}>
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </Text>
            
            <Text style={footer}>
              This password reset link will expire in 1 hour for security reasons.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ResetPasswordEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
};

const header = {
  backgroundColor: '#1e40af',
  padding: '24px',
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
};

const heading = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#ffffff',
  margin: '0',
  textAlign: 'center' as const,
};

const content = {
  padding: '24px 32px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#525252',
  margin: '16px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#1e40af',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};

const link = {
  fontSize: '14px',
  color: '#1e40af',
  textDecoration: 'none',
  wordBreak: 'break-all' as const,
  margin: '16px 0',
};

const divider = {
  borderColor: '#e5e5e5',
  margin: '32px 0',
};

const footer = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#737373',
  margin: '8px 0',
};
