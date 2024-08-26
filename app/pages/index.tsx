import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styled from 'styled-components';
import Grid from '@button-inc/bcgov-theme/Grid';
import Button from '@button-inc/bcgov-theme/Button';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import squid from 'svg/squid.svg';
import fishes from 'svg/fishes.svg';
import { signIn, useSession } from 'next-auth/react';
import NextLink from 'next/link';
import { formatWikiURL } from 'utils/helpers';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faClose } from '@fortawesome/free-solid-svg-icons';

const JumbotronH1 = styled.h1`
  font-size: 48px;
`;

const JumbotronP = styled.p`
  font-size: 24px;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .custom-realm-info {
    .custom-realm-link a {
      color: #003366;
      text-decoration: underline;
    }

    .large-font {
      font-size: 20px;
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

const GRID_PADDING = '1rem';
const SplashImageContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  grid-template-rows: repeat(5, auto);
  box-shadow: 0px 5px 7px 0px #aaa;
  margin: 0 7px;
  padding-top: ${GRID_PADDING};
  padding-bottom: ${GRID_PADDING};
  margin-bottom: 10px;
  justify-items: center;
  grid-auto-flow: column;

  * {
    padding-left: 15px;
    padding-right: 15px;
  }

  ul {
    list-style: none;
    margin: 0;
    justify-self: start;
    li {
      display: flex;
      align-items: flex-start;
      padding: 0;
    }
  }

  .align-start {
    justify-self: start;
  }

  .icon-bullet {
    margin-top: 6px;
    margin-right: 6px;
    padding: 0;
  }

  .divider {
    background: #bbb;
    width: 1px;
    grid-row: 1 / 6;
    padding: 0;
    height: calc(100% + 2 * ${GRID_PADDING});
    position: relative;
    bottom: ${GRID_PADDING};
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(11, auto);
    .divider {
      width: calc(100%);
      margin: 1rem 0;
      bottom: 0;
      padding: 0;
      grid-row: unset;
      height: 1px;
    }
  }
`;

const SplashImage = () => {
  return (
    <SplashImageContainer>
      <h2>Standard Realm</h2>
      <p>SSO team configures it for you</p>
      <div>
        <Image height={'200px'} width={'200px'} src={fishes} alt="A group of fish swimming" />
      </div>
      <p className="align-start">Service we provide:</p>
      <ul>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Self-registration
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Immediate access to a development, test, and production environment
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Default settings
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Architecture best practices
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          24/7 site reliability monitoring
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Continuous improvement & bug fixes
        </li>
      </ul>
      <div className="divider" />
      <h2>Custom Realm</h2>
      <p>Your team configures it yourself</p>
      <Image src={squid} height={'200px'} width={'200px'} alt="A single squid swimming" />
      <p className="align-start">Service we provide:</p>
      <ul>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Governance model & decision
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Infrastructure code for environment promotion
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Access considerations
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Migration of project teams that move ministries
        </li>
        <li>
          <FontAwesomeIcon className="icon-bullet" icon={faCheckCircle} size="sm" color="#fcba2a" />
          Dev-ops/technical support - have long term plan for it
        </li>
      </ul>
    </SplashImageContainer>
  );
};

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
            <Grid.Col span={4}>
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
                    <NextLink target="_blank" href={formatWikiURL()}>
                      information
                    </NextLink>{' '}
                    to ensure this is not a fit for you. To maintain our{' '}
                    <NextLink target="_blank" href={formatWikiURL('Alerts-and-Us#service-levels')}>
                      service levels
                    </NextLink>
                    , we need to evaluate every single custom realm request coming to us. Please fill out the form to
                    start the conversation with us.
                  </p>
                  <strong className="custom-realm-link">
                    <NextLink href="/custom-realm-form">Request a Custom Realm</NextLink>
                  </strong>
                </div>
              </Container>
            </Grid.Col>
            <Grid.Col span={6}>
              <SplashImage />
            </Grid.Col>
          </Grid.Row>
        </Grid>
      </ResponsiveContainer>
    </>
  );
};

export default Home;
