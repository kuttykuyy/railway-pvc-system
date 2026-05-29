
/**
 * Session Error Handler
 * Handles JWT session errors gracefully by clearing cookies and redirecting to sign-in
 */

export function handleSessionError() {
  if (typeof window !== 'undefined') {
    // Clear all NextAuth cookies
    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const name = cookie.split('=')[0].trim();
      
      // Clear NextAuth session cookies
      if (name.includes('next-auth') || name.includes('__Secure-next-auth')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`;
      }
    }
    
    // Redirect to sign-in page
    window.location.href = '/auth/signin?error=SessionExpired';
  }
}

export function clearAllCookies() {
  if (typeof window !== 'undefined') {
    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const name = cookie.split('=')[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`;
    }
  }
}
