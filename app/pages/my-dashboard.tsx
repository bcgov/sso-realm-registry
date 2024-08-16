import React, { useState, useEffect, createContext } from 'react';
import Head from 'next/head';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import styled from 'styled-components';
import Grid from '@button-inc/bcgov-theme/Grid';
import Alert from '@button-inc/bcgov-theme/Alert';
import StyledLink from '@button-inc/bcgov-theme/Link';
import { RealmProfile } from 'types/realm-profile';
import RealmLeftPanel from 'page-partials/my-dashboard/RealmLeftPanel';
import PopupModal from 'page-partials/my-dashboard/PopupModal';
import TopAlertWrapper from 'components/TopAlertWrapper';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import { getRealmProfiles } from 'services/realm';
import { getSurvey } from 'services/survey';
import { useSession } from 'next-auth/react';
import { User } from 'next-auth';
import getConfig from 'next/config';
import { InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

const AlignCenter = styled.div`
  text-align: center;
`;

const mediaRules: MediaRule[] = [
  {
    maxWidth: 900,
    marginTop: 0,
    marginLeft: 10,
    marginRight: 10,
    marginUnit: 'px',
    horizontalAlign: 'none',
  },
  {
    marginTop: 15,
    marginLeft: 2.5,
    marginRight: 2.5,
    marginUnit: 'rem',
    horizontalAlign: 'none',
  },
];

export const DomainsContext = createContext({ dev: '', test: '', prod: '' });

function MyDashboard(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { data } = useSession();
  const currentUser: Partial<User> = data?.user!;
  const [loading, setLoading] = useState<boolean>(false);
  const [answered, setAnswered] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [realms, setRealms] = useState<RealmProfile[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function fetchSurvey() {
      const [data, err] = await getSurvey();
      if (err) {
        setHasError(true);
      } else {
        setAnswered(!!data);
      }
    }

    async function fetchData() {
      setLoading(true);
      const [data, err] = await getRealmProfiles(true);
      if (err) {
        setHasError(true);
      } else {
        setRealms(data as RealmProfile[]);
      }
      setLoading(false);
    }

    // disable survey for now
    // fetchSurvey();
    fetchData();
  }, []);

  const handleEditClick = (id: string) => {
    router.push(`/realm/${id}`);
  };

  const handleUpdate = (realm: RealmProfile) => {
    const newList = realms.map((currRealm) => {
      // let's keep the derived fields from the list
      if (currRealm.id === realm.id) return { ...currRealm, ...realm };
      else return currRealm;
    });

    setRealms(newList);
  };

  const handleAnswer = (value: boolean) => {
    setAnswered(value);
  };

  const handleCancel = () => {
    setSelectedId(null);
  };

  if (hasError)
    return (
      <TopAlertWrapper>
        <Alert variant="warning" closable={true}>
          There was en error while loading your realm information. Please try refreshing the page.
        </Alert>
      </TopAlertWrapper>
    );

  return (
    <>
      <Head>
        <title>My Dashboard</title>
      </Head>
      {!answered && (
        <TopAlertWrapper>
          <Alert variant="warning" closable={true}>
            Would you like to migrate to a standard realm? Find out more{' '}
            <StyledLink href="/my-dashboard#realm-migration" content="here" />
          </Alert>
        </TopAlertWrapper>
      )}
      <ResponsiveContainer rules={mediaRules}>
        {loading ? (
          <AlignCenter>
            <SpinnerGrid color="#000" height={45} width={45} wrapperClass="d-block" visible={loading} />
          </AlignCenter>
        ) : (
          <Grid cols={10} style={{ overflowX: 'hidden' }}>
            <Grid.Row collapse="800" gutter={[15, 2]}>
              <Grid.Col span={10} style={{ overflowX: 'auto' }}>
                <RealmLeftPanel realms={realms} onEditClick={handleEditClick} onCancel={handleCancel}></RealmLeftPanel>
              </Grid.Col>
            </Grid.Row>
          </Grid>
        )}
        <PopupModal open={!answered} onAnswer={handleAnswer} />
      </ResponsiveContainer>
    </>
  );
}

export default MyDashboard;

export const getServerSideProps = async () => {
  const { serverRuntimeConfig } = getConfig();

  const domains = {
    dev: serverRuntimeConfig.dev_kc_url,
    test: serverRuntimeConfig.test_kc_url,
    prod: serverRuntimeConfig.prod_kc_url,
  };

  return {
    props: {
      domains,
    },
  };
};
