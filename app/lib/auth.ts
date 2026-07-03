import { logger } from './logger';

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { isEmailVerificationRequired } from '@/lib/admin-settings';

/**
 * Return the configured NextAuth secret.
 * Fails closed if NEXTAUTH_SECRET is not set so tokens cannot be forged
 * using a hardcoded fallback.
 */
export function getNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET environment variable is not set');
  }
  return secret;
}

async function ensureCustomerAccount(userId: string): Promise<void> {
  await prisma.customerAccount.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      status: 'active',
      currentTier: 'standard',
      creditBalance: 0,
      monthlyBillCount: 0,
      currentMonthBills: 0,
      lastMonthBills: 0,
    },
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile"
        }
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Distributed brute-force protection: cap login attempts per email/window
          // across all instances. Fails open if the limiter DB call errors.
          const { checkDbRateLimit } = await import('./rate-limit-db');
          const loginKey = `login:${credentials.email.toLowerCase().trim()}`;
          const rl = await checkDbRateLimit(loginKey, 10, 15 * 60 * 1000); // 10 attempts / 15 min
          if (!rl.allowed) {
            console.warn(`[auth] Login rate limit exceeded for ${credentials.email}`);
            throw new Error('TooManyAttempts');
          }

          const user = await prisma.user.findUnique({
            where: { email: credentials.email }
          });


          if (!user) {
            return null;
          }

          // Check if user has a password (OAuth users might not have one)
          if (!user.password) {
            console.error('User exists but has no password (likely OAuth user)');
            return null;
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

          if (!isPasswordValid) {
            return null;
          }

          // Use the actual role from the database
          const role = user.role || 'contractor';

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: role,
            emailVerified: user.emailVerified, // Include emailVerified in the returned user object
          };
        } catch (error) {
          console.error('🚨 Auth error:', error);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    // Idle timeout: a session expires 3 days after its last refresh. Rolling refresh
    // (updateAge) re-issues the token at most once a day while the user is active, so
    // regular users stay signed in but an abandoned/leaked token is valid for <= 3 days
    // (down from the previous 15 days).
    maxAge: 3 * 24 * 60 * 60, // 3 days
    updateAge: 24 * 60 * 60, // refresh at most once per day
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Check email verification for credentials provider
      if (account?.provider === 'credentials') {
        // Check if emailVerified exists on the user object
        const userWithVerification = user as any;
        if (!userWithVerification.emailVerified && await isEmailVerificationRequired()) {
          console.error('🚨 Sign-in blocked: Email not verified for', user.email);
          // This will redirect to the error page with EmailNotVerified error
          throw new Error('EmailNotVerified');
        }
      }
      
      // For OAuth providers, ensure user has proper role and email is verified
      if (account?.provider === 'google') {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! }
          });
          
          if (existingUser) {
            const updates: any = {};
            
            // If user doesn't have a role yet, set default role
            if (!existingUser.role) {
              updates.role = 'contractor';
            }
            
            // If user hasn't verified email yet, mark it as verified (OAuth providers verify emails)
            if (!existingUser.emailVerified) {
              updates.emailVerified = new Date();
            }
            
            // Update user if there are any changes
            if (Object.keys(updates).length > 0) {
              await prisma.user.update({
                where: { id: existingUser.id },
                data: updates
              });
            }
          }
        } catch (error) {
          console.error('Sign-in callback error:', error);
        }
      }

      if (user.id) {
        try {
          await ensureCustomerAccount(user.id);
        } catch (error) {
          console.error('Customer account provisioning error:', error);
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session, account }) {
      try {
        // Initial sign in
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.name = user.name;
          
          // For OAuth sign-in, fetch role from database
          if (account?.provider === 'google') {
            const dbUser = await prisma.user.findUnique({
              where: { email: user.email! }
            });
            token.role = dbUser?.role || 'contractor';
          } else {
            token.role = (user as any).role;
          }
        }
        
        // Handle session update trigger (when role is changed)
        if (trigger === 'update' && token.email) {
          // Refresh user data from database
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email as string }
          });
          
          if (dbUser) {
            token.role = dbUser.role || 'contractor';
            token.name = dbUser.name;
          }
        }
        
        return token;
      } catch (error) {
        console.error('JWT callback error:', error);
        // Return null to invalidate the token and force re-authentication
        return null as any;
      }
    },
    async session({ session, token }) {
      try {
        if (token && session.user) {
          // Add id and role to the session user object
          (session.user as any).id = token.id as string;

          // Always pull latest role from DB so admin changes take effect immediately
          if (token.email) {
            const dbUser = await prisma.user.findUnique({
              where: { email: token.email as string },
              select: { role: true },
            });
            (session.user as any).role = dbUser?.role || token.role as string;
          } else {
            (session.user as any).role = token.role as string;
          }
        }
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        // Return the session as-is, but it will be invalid without token data
        return session;
      }
    },
    async redirect({ url, baseUrl }) {
      // Relative path — safe, keep it on our origin.
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      // Absolute URL — only allow an EXACT origin match (a prefix check like
      // startsWith(baseUrl) would accept https://irpvc.in.evil.com — SA-04).
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) {
          return url;
        }
      } catch {
        // malformed URL — fall through to the safe default
      }
      // Default to contracts page
      return `${baseUrl}/contracts`;
    }
  },
  events: {
    async createUser({ user }) {
      await ensureCustomerAccount(user.id);
    },
    async signOut({ token }) {
      // Clear any cached data on sign out
      logger.log('User signed out:', token?.email);
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin', // Redirect to sign-in page on error
  },
  debug: false,
  secret: process.env.NEXTAUTH_SECRET,
};

