import React from 'react';
import styled from 'styled-components';
import Link from '@button-inc/bcgov-theme/Link';
import { RealmProfile } from 'types/realm-profile';

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
  console.log(realm);
  return (
    <>
      <Title>Development</Title>
      <Link
        href={`https://dev.oidc.gov.bc.ca/auth/admin/${realm.realm}/console`}
        external
      >{`https://dev.oidc.gov.bc.ca/auth/admin/${realm.realm}/console`}</Link>
      <br />
      <br />
      <Title>Test</Title>
      <Link
        href={`https://test.oidc.gov.bc.ca/auth/admin/${realm.realm}/console`}
        external
      >{`https://test.oidc.gov.bc.ca/auth/admin/${realm.realm}/console`}</Link>
      <br />
      <br />
      <Title>Production</Title>
      <Link
        href={`https://oidc.gov.bc.ca/auth/admin/${realm.realm}/console`}
        external
      >{`https://oidc.gov.bc.ca/auth/admin/${realm.realm}/console`}</Link>
    </>
  );
}

export default RealmURIs;
