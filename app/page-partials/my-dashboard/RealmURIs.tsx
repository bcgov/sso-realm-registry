import React from 'react';
import styled from 'styled-components';
import Link from '@button-inc/bcgov-theme/Link';
import { RealmProfile } from 'types/realm-profile';
import getConfig from 'next/config';

const { publicRuntimeConfig = {} } = getConfig() || {};
const { dev_kc_url, test_kc_url, prod_kc_url } = publicRuntimeConfig;

const Title = styled.div`
  font-weight: 700;
  font-size: 1.1rem;
  margin-top: 5px;
  margin-bottom: 5px;
`;
interface Props {
  realm: RealmProfile;
}

const getDomainByEnv = (env: string) => {
  return env === 'dev' ? dev_kc_url : env === 'test' ? test_kc_url : prod_kc_url;
};

function RealmURIs({ realm }: Props) {
  const devURL = `${getDomainByEnv('dev')}/auth/admin/${realm.realm}/console/`;
  const testURL = `${getDomainByEnv('test')}/auth/admin/${realm.realm}/console/`;
  const prodURL = `${getDomainByEnv('prod')}/auth/admin/${realm.realm}/console/`;

  return (
    <>
      <Title>Development</Title>
      <Link href={devURL} external>
        {devURL}
      </Link>
      <br />
      <br />
      <Title>Test</Title>
      <Link href={testURL} external>
        {testURL}
      </Link>
      <br />
      <br />
      <Title>Production</Title>
      <Link href={prodURL} external>
        {prodURL}
      </Link>
    </>
  );
}

export default RealmURIs;
