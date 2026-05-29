
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * API endpoint to clear all session cookies
 * Used when JWT decryption errors occur
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    
    // Get all cookies
    const allCookies = cookieStore.getAll();
    
    // Clear all NextAuth session cookies
    for (const cookie of allCookies) {
      if (cookie.name.includes('next-auth') || cookie.name.includes('__Secure-next-auth')) {
        cookieStore.delete(cookie.name);
      }
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Session cleared successfully. Please sign in again.' 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error clearing session:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to clear session' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    
    // Get all cookies
    const allCookies = cookieStore.getAll();
    
    // Clear all NextAuth session cookies
    for (const cookie of allCookies) {
      if (cookie.name.includes('next-auth') || cookie.name.includes('__Secure-next-auth')) {
        cookieStore.delete(cookie.name);
      }
    }

    // Redirect to sign-in page
    return NextResponse.redirect(new URL('/auth/signin?error=SessionCleared', request.url));
  } catch (error) {
    console.error('Error clearing session:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=ClearFailed', request.url));
  }
}
