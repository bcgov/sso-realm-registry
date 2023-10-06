import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styled from 'styled-components';
import Grid from '@button-inc/bcgov-theme/Grid';
import Button from '@button-inc/bcgov-theme/Button';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import IntroRealms from 'svg/IntroRealms';
import { signIn, useSession } from 'next-auth/react';

const JumbotronH1 = styled.h1`
  font-size: 2.5rem;
`;

const JumbotronP = styled.p`
  font-size: 1.5rem;
`;

const mediaRules: MediaRule[] = [
  {
    maxWidth: 900,
    marginTop: 10,
    marginLeft: 10,
    marginRight: 10,
    marginUnit: 'px',
    horizontalAlign: 'none',
  },
  {
    marginTop: 40,
    marginLeft: 2.5,
    marginRight: 2.5,
    marginUnit: 'rem',
    horizontalAlign: 'none',
  },
];

const Home = () => {
  const router = useRouter();
  const session = useSession();

  const handleLogin = async () => {
    signIn('keycloak', {
      callbackUrl: '/my-dashboard',
      redirect: true,
    });
  };

  const handleDashboard = async () => {
    if (session?.status === 'authenticated') {
      router.push(`/my-dashboard`);
    } else {
      handleLogin();
    }
  };

  return (
    <>
      <Head>
        <title>Home</title>
      </Head>
      <ResponsiveContainer rules={mediaRules}>
        <Grid cols={10} gutter={[5, 2]} style={{ overflowX: 'hidden' }}>
          <Grid.Row collapse="800">
            <Grid.Col span={3}>
              <JumbotronH1>Keycloak Realm Registry</JumbotronH1>
              <JumbotronP>
                Use this self-service tool to
                <br />
                view, and edit some,
                <br />
                information about your
                <br />
                Custom realm.
              </JumbotronP>
              {session ? (
                <Button size="medium" onClick={handleDashboard}>
                  My Dashboard
                </Button>
              ) : (
                <Button size="medium" onClick={handleLogin}>
                  Login
                </Button>
              )}
            </Grid.Col>
            <Grid.Col span={7}>{IntroRealms}</Grid.Col>
          </Grid.Row>
        </Grid>
      </ResponsiveContainer>
    </>
  );
};

export default Home;
