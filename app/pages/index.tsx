import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styled from 'styled-components';
import Grid from '@button-inc/bcgov-theme/Grid';
import Button from '@button-inc/bcgov-theme/Button';
import Link from '@button-inc/bcgov-theme/Link';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import IntroRealms from 'svg/IntroRealms';
import { signIn, useSession } from 'next-auth/react';
import NextLink from 'next/link';

const JumbotronH1 = styled.h1`
  font-size: 2.5rem;
`;

const JumbotronP = styled.p`
  font-size: 1.5rem;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .custom-realm-info {
    a {
      color: #0d6efd;
    }

    .custom-realm-link a {
      color: #003366;
      text-decoration: underline;
    }

    .large-font {
      font-size: 1.2em;
    }
  }
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
              <Container>
                <div>
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
                </div>
                <div className="custom-realm-info">
                  <p className="large-font">Do you want to request a new Custom Realm?</p>
                  <p>
                    Over 90% of our clients benefit from our Standard Service, please visit our{' '}
                    <Link href="https://github.com/bcgov/sso-keycloak/wiki">information</Link> to ensure this is not a
                    fit for you. To maintain our{' '}
                    <Link href="https://github.com/bcgov/sso-keycloak/wiki/Alerts-and-Us#service-levels">
                      service levels
                    </Link>
                    , we need to evaluate every single custom realm request coming to us. Please fill out the form to
                    start the conversation with us.
                  </p>
                  <strong className="custom-realm-link">
                    <NextLink href="/custom-realm-form">Request a Custom Realm</NextLink>
                  </strong>
                </div>
              </Container>
            </Grid.Col>
            <Grid.Col span={7}>{IntroRealms}</Grid.Col>
          </Grid.Row>
        </Grid>
      </ResponsiveContainer>
    </>
  );
};

export default Home;
