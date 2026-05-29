
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  /**
   * Extends the built-in session.user type
   */
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role?: string;
    };
  }

  /**
   * Extends the built-in user type returned from authorize()
   */
  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role?: string;
    emailVerified?: Date | null;
  }
}

declare module 'next-auth/jwt' {
  /**
   * Extends the default JWT token type
   */
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
  }
}
