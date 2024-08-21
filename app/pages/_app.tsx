import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/globals.css';
import React, { useState, createContext } from 'react';
import { useRouter } from 'next/router';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import Layout from 'layout/Layout';
import { SessionProvider, signOut, signIn } from 'next-auth/react';
import Modal from 'components/Modal';
import { ModalContext, ModalConfig } from 'context/modal';
import '@fortawesome/fontawesome-svg-core/styles.css';

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    show: false,
    title: '',
    body: '',
  });

  const handleLogin = async () => {
    signIn('keycloak', {
      callbackUrl: '/my-dashboard',
      redirect: true,
    });
  };

  const handleLogout = async () => {
    signOut({
      redirect: true,
      callbackUrl: '/api/oidc/keycloak/logout',
    });
  };

  return (
    <ModalContext.Provider value={{ modalConfig, setModalConfig }}>
      <SessionProvider session={session}>
        {modalConfig.show && <Modal modalConfig={modalConfig} setModalConfig={setModalConfig} />}
        <Layout onLoginClick={handleLogin} onLogoutClick={handleLogout}>
          <Head>
            <html lang="en" />
            <title>Keycloak Realm Registry</title>
            <meta name="description" content="Keycloak Realm Registry" />
            <link rel="icon" href="/bcid-favicon-32x32.png" />
          </Head>
          <Component {...pageProps} onLoginClick={handleLogin} onLogoutClick={handleLogout} />
        </Layout>
      </SessionProvider>
    </ModalContext.Provider>
  );
}
export default MyApp;
