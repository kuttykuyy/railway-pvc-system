import { logger } from './logger';

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { isEmailVerificationRequired } from '@/lib/admin-settings';
import { notifyNewUserSignup } from '@/lib/slack-webhook';

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

/**
 * The signed-in user's role, remembered briefly.
 *
 * The role is re-read from the database rather than trusted from the token, so that
 * changing someone's role takes effect without waiting for them to sign in again.
 * But the session callback runs on EVERY session read — every page load, every
 * useSession() — and in production each serverless function is allowed a single
 * database connection. Those reads therefore queue behind one another and can sit
 * there until the 20-second pool timeout: that wait is what "login is stuck" looks
 * like, and it lands on sign-in and sign-out alike because both read the session.
 *
 * Remembering the answer for a minute keeps the point of the lookup — a role change
 * still lands within a minute, no sign-out needed — while removing nearly all of the
 * queries. A failed lookup falls back to the token's role rather than none at all.
 */
const ROLE_CACHE_TTL_MS = 60_000;
const ROLE_CACHE_MAX = 500;
const roleCache = new Map<string, { role: string; readAt: number }>();

async function roleForEmail(email: string, fallbackRole: string): Promise<string> {
  const cached = roleCache.get(email);
  if (cached && Date.now() - cached.readAt < ROLE_CACHE_TTL_MS) {
    return cached.role;
  }
  try {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });
    const role = dbUser?.role || fallbackRole;
    // Plain bound: this lives per function instance and is only ever a small map.
    if (roleCache.size >= ROLE_CACHE_MAX) roleCache.clear();
    roleCache.set(email, { role, readAt: Date.now() });
    return role;
  } catch (error) {
    console.error('Session role lookup failed; keeping the role from the token:', error);
    return fallbackRole;
  }
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
      
      // Whether the user's database row exists yet. For a FIRST-time Google sign-in it
      // does not — the adapter creates it after this callback — so any write keyed on
      // the user here fails: customer-account provisioning hit a foreign key and the
      // login-time stamp hit "record not found", on every new Google account since
      // June. Both were caught and logged, so sign-in worked, but the noise buried
      // real errors. The writes below now wait for a row to write to; the next
      // sign-in, or the jwt callback's own reads, cover a brand-new account.
      let dbRowExists = account?.provider !== 'google';

      // For OAuth providers, ensure user has proper role and email is verified
      if (account?.provider === 'google') {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! }
          });
          dbRowExists = !!existingUser;

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

      if (user.id && dbRowExists) {
        try {
          await ensureCustomerAccount(user.id);
        } catch (error) {
          console.error('Customer account provisioning error:', error);
        }
      }

      // Record the login time — the column existed but nothing ever wrote it, so
      // retention ("who came back?") was unmeasurable. Best-effort: a stats write
      // must never block a sign-in.
      if (user.email && dbRowExists) {
        prisma.user.update({
          where: { email: user.email },
          data: { lastLoginAt: new Date() },
        }).catch((err) => console.error('lastLoginAt update failed:', err));
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

          // Fetch phone (and role for OAuth) so the token records whether the user
          // has a mobile number — used by middleware to gate phone-less accounts
          // (e.g. Google sign-in, which never provides a phone number).
          const dbUser = user.email
            ? await prisma.user.findUnique({
                where: { email: user.email },
                select: { role: true, phone: true },
              })
            : null;
          token.role = account?.provider === 'google' ? (dbUser?.role || 'contractor') : (user as any).role;
          token.hasPhone = !!(dbUser?.phone && String(dbUser.phone).trim());
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
            token.hasPhone = !!(dbUser.phone && String(dbUser.phone).trim());
            // A deliberate refresh should not then be overruled by a remembered
            // role: drop the cached answer so this one is used immediately.
            roleCache.set(token.email as string, { role: token.role as string, readAt: Date.now() });
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
          (session.user as any).role = token.email
            ? await roleForEmail(token.email as string, token.role as string)
            : (token.role as string);
        }
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        // Keep the user signed in with the role their token already carries, rather
        // than handing back a session with no role at all — which reads to every
        // screen as "not an admin" and hides half the app over a database hiccup.
        if (token && session.user) {
          (session.user as any).id = token.id as string;
          (session.user as any).role = token.role as string;
        }
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

      // An SSO account is created BY a sign-in, but the signIn callback above ran before
      // the row existed and so skipped the login stamp. Without this, every new Google
      // user read as "signed up, never signed in" on the signup funnel.
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        .catch((err) => console.error('lastLoginAt stamp on SSO signup failed:', err));

      // A user created through NextAuth's adapter comes from an OAuth/SSO provider
      // (e.g. "Continue with Google"). Email/password signups are created in
      // /api/signup and notify there, so this is the SSO counterpart and does not
      // double-fire. Non-blocking so a Slack hiccup never breaks sign-in.
      notifyNewUserSignup({
        email: user.email || 'N/A',
        fullName: user.name || 'N/A',
        userId: user.id,
        signupDate: (user as any).createdAt || new Date(),
        signupMethod: 'Google (SSO)',
      }).catch(error => {
        console.error('⚠️ Failed to send Slack notification for SSO signup:', error);
      });
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

