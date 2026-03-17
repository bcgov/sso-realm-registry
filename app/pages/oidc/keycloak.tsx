import { useEffect } from 'react';
import { GetStaticProps, GetStaticPaths, GetServerSidePropsContext } from 'next';
import jwt from 'jsonwebtoken';
import store2 from 'store2';
import { createOIDC } from 'utils/oidc-conn';

interface Sesssion {
  preferred_username: string;
  idir_username: string;
  given_name: string;
  family_name: string;
  email: string;
  client_roles: string;
}
interface Props {
  error?: boolean;
  appToken?: string;
  session?: Sesssion;
}
export default function OauthCallback({ error, appToken, session }: Props) {
  useEffect(() => {
    if (error) {
      store2.session.remove('app-token');
      store2.session.remove('app-session');
      window.location.href = '/';
    } else {
      store2.session.set('app-token', appToken);
      store2.session.set('app-session', session);
      window.location.href = '/my-dashboard';
    }
  }, []);

  return null;
}

export async function getServerSideProps({ req, res, query }: GetServerSidePropsContext) {
  try {
    const { code } = query;

    const oidc = createOIDC();
    const tokens = await oidc.getAccessToken({ code: String(code) });
    const { access_token = '' } = tokens;
    const {
      preferred_username = '',
      given_name = '',
      family_name = '',
      email = '',
      client_roles = [],
      identity_provider,
      idir_username,
    } = (await oidc.verifyToken(access_token)) as any;

    if (identity_provider !== 'idir') {
      return {
        props: { error: true },
      };
    }

    const session = {
      preferred_username,
      given_name,
      family_name,
      email,
      client_roles,
      idir_username,
    };
    const appToken = jwt.sign({ access_token, ...session }, process.env.JWT_SECRET ?? '', {
      expiresIn: process.env.JWT_TOKEN_EXPIRY as jwt.SignOptions['expiresIn'],
    });
    return {
      props: { appToken, session },
    };
  } catch (err) {
    console.error(err);
    return {
      props: {},
    };
  }
}
