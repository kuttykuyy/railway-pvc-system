import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Force dynamic rendering and disable static optimization
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Directly export GET and POST handlers without intermediate variable
export const GET = NextAuth(authOptions);
export const POST = NextAuth(authOptions);