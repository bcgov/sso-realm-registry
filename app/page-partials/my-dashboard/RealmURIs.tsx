import React, { useContext } from 'react';
import styled from 'styled-components';
import Link from '@button-inc/bcgov-theme/Link';
import { RealmProfile } from 'types/realm-profile';
import getConfig from 'next/config';
import { DomainsContext } from 'pages/my-dashboard';

const Title = styled.div`
  font-weight: 700;
  font-size: 1.1rem;
  margin-top: 5px;
  margin-bottom: 5px;
`;
interface Props {
  realm: RealmProfile;
}

export default function RealmURIs({ realm }: Props) {
  let { dev, test, prod } = useContext(DomainsContext);

  const devURL = `${dev}/auth/admin/${realm.realm}/console/`;
  const testURL = `${test}/auth/admin/${realm.realm}/console/`;
  const prodURL = `${prod}/auth/admin/${realm.realm}/console/`;

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
