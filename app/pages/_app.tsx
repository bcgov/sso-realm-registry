import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/globals.css';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import store2 from 'store2';
import Layout from 'layout/Layout';

// store2('app-session', { name, preferred_username, email });

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => setCurrentUser(store2.session.get('app-session')), []);

  useEffect(() => {
    const redirect = async () => {
      if (currentUser) await router.push('/my-dashboard');
    };

    redirect();
  }, [currentUser]);

  const handleLogin = async () => {
    window.location.href = '/api/oidc/keycloak/login';
  };

  const handleLogout = async () => {
    store2.session.remove('app-token');
    store2.session.remove('app-session');
    window.location.href = '/api/oidc/keycloak/logout';
  };

  return (
    <Layout currentUser={currentUser} onLoginClick={handleLogin} onLogoutClick={handleLogout}>
      <Head>
        <html lang="en" />
        <title>Keycloak Realm Registry</title>
        <meta name="description" content="Keycloak Realm Registry" />
        <link rel="icon" href="/bcid-favicon-32x32.png" />
      </Head>
      <Component {...pageProps} currentUser={currentUser} onLoginClick={handleLogin} onLogoutClick={handleLogout} />
    </Layout>
  );
}
export default MyApp;
