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
  const devURL = generateRealmLinksByEnv('dev', realm.realm);
  const testURL = generateRealmLinksByEnv('test', realm.realm);
  const prodURL = generateRealmLinksByEnv('prod', realm.realm);
  return (
    <>
      <Title>Development</Title>
      <Link href={`${devURL}`} external>{`${devURL}`}</Link>
      <br />
      <br />
      <Title>Test</Title>
      <Link href={`${testURL}`} external>{`${testURL}`}</Link>
      <br />
      <br />
      <Title>Production</Title>
      <Link href={`${prodURL}`} external>{`${prodURL}`}</Link>
    </>
  );
}

export default RealmURIs;
