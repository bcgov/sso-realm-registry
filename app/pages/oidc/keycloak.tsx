import { useEffect } from 'react';
import { GetStaticProps, GetStaticPaths, GetServerSidePropsContext } from 'next';
import getConfig from 'next/config';
import jwt from 'jsonwebtoken';
import store2 from 'store2';
import { createOIDC } from 'utils/oidc-conn';
const { serverRuntimeConfig = {} } = getConfig() || {};
const { jwt_secret, jwt_token_expiry } = serverRuntimeConfig;

interface Sesssion {
  preferred_username: string;
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
      store2.remove('app-token');
      store2.remove('app-session');
      window.location.href = '/';
    } else {
      store2('app-token', appToken);
      store2('app-session', session);
      window.location.href = '/my-dashboard';
    }
  }, []);

  return <></>;
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
      idir_userid: preferred_username?.split('@idir')[0],
    };
    const appToken = jwt.sign({ access_token, ...session }, jwt_secret, { expiresIn: jwt_token_expiry });

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
