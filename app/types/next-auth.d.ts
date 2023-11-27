import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    accessTokenExpiry: long | null;
    error: string | null;
    user: User & DefaultSession['user'];
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    client_roles: string[];
    given_name: string | null;
    family_name: string | null;
    preferred_username: string | null;
    email: string | null;
    idir_username: string | null;
  }
}
