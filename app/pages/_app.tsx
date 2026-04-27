import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/globals.css';
import { useState } from 'react';
import type { AppProps } from 'next/app';
import Layout from 'layout/Layout';
import { SessionProvider, signOut, signIn } from 'next-auth/react';
import Modal from 'components/Modal';
import { ModalContext, ModalConfig } from 'context/modal';
import '@fortawesome/fontawesome-svg-core/styles.css';

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    show: false,
    title: '',
    body: '',
  });

  const handleLogin = async () => {
    signIn(
      'keycloak',
      {
        callbackUrl: '/my-dashboard',
        redirect: true,
      },
      { kc_idp_hint: 'azureidir' },
    );
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
          <Component {...pageProps} onLoginClick={handleLogin} onLogoutClick={handleLogout} />
        </Layout>
      </SessionProvider>
    </ModalContext.Provider>
  );
}
export default MyApp;
