import { useState, useEffect, createContext, useContext } from 'react';
import Head from 'next/head';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import styled from 'styled-components';
import { RealmProfile } from 'types/realm-profile';
import RealmLeftPanel from 'page-partials/my-dashboard/RealmLeftPanel';
import PopupModal from 'page-partials/my-dashboard/PopupModal';
import TopAlertWrapper from 'components/TopAlertWrapper';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import { getRealmProfiles } from 'services/realm';
import { getSurvey } from 'services/survey';
import { useSession } from 'next-auth/react';
import { User } from 'next-auth';
import { InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';
import { ModalContext } from 'context/modal';
import RealmURIs from 'page-partials/my-dashboard/RealmURIs';
import { Alert, Col, Row } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import Link from 'next/link';

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
  const { setModalConfig } = useContext(ModalContext);

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

  const handleViewClick = (id: string) => {
    const realm = realms.find((realm) => String(realm.id) === id);
    if (!realm) return;

    setModalConfig({
      show: true,
      title: 'Environment Links',
      body: (
        <DomainsContext.Provider value={props.domains}>
          <RealmURIs realm={realm}></RealmURIs>
        </DomainsContext.Provider>
      ),
    });
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
        <Alert variant="warning" dismissible className="d-flex align-items-center">
          <FontAwesomeIcon className="icon-bullet" icon={faExclamationTriangle} size="lg" />
          <div>There was en error while loading your realm information. Please try refreshing the page.</div>
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
          <Alert variant="warning" dismissible className="d-flex align-items-center">
            <FontAwesomeIcon className="icon-bullet" icon={faExclamationTriangle} />
            <div>
              Would you like to migrate to a standard realm? Find out more{' '}
              <Link href="/my-dashboard#realm-migration">here</Link>
            </div>
          </Alert>
        </TopAlertWrapper>
      )}
      <ResponsiveContainer rules={mediaRules}>
        {loading ? (
          <AlignCenter>
            <SpinnerGrid color="#000" height={45} width={45} wrapperClass="d-block" visible={loading} />
          </AlignCenter>
        ) : (
          <Row>
            <Col>
              <RealmLeftPanel
                realms={realms}
                onEditClick={handleEditClick}
                onCancel={handleCancel}
                onViewClick={handleViewClick}
              />
            </Col>
          </Row>
        )}
        <PopupModal open={!answered} onAnswer={handleAnswer} />
      </ResponsiveContainer>
    </>
  );
}

export default MyDashboard;

export const getServerSideProps = async () => {
  const domains = {
    dev: process.env.DEV_KC_URL ?? '',
    test: process.env.TEST_KC_URL ?? '',
    prod: process.env.PROD_KC_URL ?? '',
  };

  return {
    props: {
      domains,
    },
  };
};
