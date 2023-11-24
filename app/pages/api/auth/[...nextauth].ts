import NextAuth, { User, Account, NextAuthOptions } from 'next-auth';
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
      accessTokenExpired: Date.now() + (refreshedTokens.expires_in - 15) * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      refreshTokenExpired: Date.now() + (refreshedTokens.refresh_expires_in - 15) * 1000,
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
  secret: process.env.JWT_SECRET,
  callbacks: {
    async jwt({ token, account, user }: { token: any; account: any; user: any }) {
      if (account) {
        token.accessToken = account?.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpired = Date.now() + (account?.expires_at - 15) * 1000;
        token.refreshTokenExpired = Date.now() + (account?.refresh_expires_in - 15) * 1000;
        token.user = user;
      }

      const decodedToken = jwt.decode(token.accessToken || '') as any;

      token.client_roles = decodedToken?.client_roles;
      token.given_name = decodedToken?.given_name;
      token.family_name = decodedToken?.family_name;
      token.preferred_username = decodedToken?.preferred_username;
      token.email = decodedToken?.email;
      token.idir_username = decodedToken?.idir_username;

      if (Date.now() < token.accessTokenExpired) {
        return refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      // Send properties to the client, like an access_token from a provider.
      if (token) {
        session.accessToken = token.accessToken;
        session.user = token.user;
        session.refreshTokenExpired = token.refreshTokenExpired;
        session.accessTokenExpired = token.accessTokenExpired;
      }

      return session;
    },
  },
};

export default NextAuth(authOptions);
