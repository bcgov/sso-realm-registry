import React from 'react';
import styled from 'styled-components';
import Link from '@button-inc/bcgov-theme/Link';
import { RealmProfile } from 'types/realm-profile';
import { generateRealmLinksByEnv } from 'utils/helpers';

const Title = styled.div`
  font-weight: 700;
  font-size: 1.1rem;
  margin-top: 5px;
  margin-bottom: 5px;
`;
interface Props {
  realm: RealmProfile;
}

function RealmURIs({ realm }: Props) {
  return (
    <>
      <Title>Development</Title>
      <Link href={`${generateRealmLinksByEnv('dev', realm.realm)}`} external>{`${generateRealmLinksByEnv(
        'dev',
        realm.realm,
      )}`}</Link>
      <br />
      <br />
      <Title>Test</Title>
      <Link href={`${generateRealmLinksByEnv('test', realm.realm)}`} external>{`${generateRealmLinksByEnv(
        'test',
        realm.realm,
      )}`}</Link>
      <br />
      <br />
      <Title>Production</Title>
      <Link href={`${generateRealmLinksByEnv('prod', realm.realm)}`} external>{`${generateRealmLinksByEnv(
        'prod',
        realm.realm,
      )}`}</Link>
    </>
  );
}

export default RealmURIs;
