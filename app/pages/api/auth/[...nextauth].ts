import NextAuth, { User, Account, NextAuthOptions, Session } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { JWT } from 'next-auth/jwt';
import jwt from 'jsonwebtoken';
import axios from 'axios';

async function refreshAccessToken(token: any) {
  try {
    const url = `${process.env.SSO_URL}/protocol/openid-connect/token?`;
    const response = await axios.post(
      url,
      new URLSearchParams({
        client_id: process.env.SSO_CLIENT_ID || '',
        client_secret: process.env.SSO_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const refreshedTokens = await response.data;

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token,
    };
  } catch (error) {
    console.error('refresh token error', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.SSO_CLIENT_ID || '',
      clientSecret: process.env.SSO_CLIENT_SECRET || '',
      issuer: process.env.SSO_URL,
      profile(profile) {
        return {
          ...profile,
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: null,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 10 * 60 * 60, //10 hours, same as sso/client session max
  },
  secret: process.env.JWT_SECRET,
  callbacks: {
    async jwt({ token, account, user }: { token: any; account: any; user: any }) {
      if (account) {
        token.user = user;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      const decodedAccessToken = jwt.decode(token.accessToken || '') as any;
      if (Date.now() > decodedAccessToken.exp) {
        token = await refreshAccessToken(token);
      }
      token.accessTokenExpiry = decodedAccessToken?.exp;
      return token;
    },
    async session({ session, token }: { session: Session; token: any }) {
      // Send properties to the client, like an access_token from a provider.
      if (token) {
        session.user = token.user;
        session.error = token.error || '';
        session.accessTokenExpiry = token.accessTokenExpiry;
      }

      return session;
    },
  },
};

export default NextAuth(authOptions);
