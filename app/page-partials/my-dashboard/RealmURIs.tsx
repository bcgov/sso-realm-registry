import { useContext } from 'react';
import styled from 'styled-components';
import { RealmProfile } from 'types/realm-profile';
import { DomainsContext } from 'pages/my-dashboard';
import Link from 'components/Link';

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
      <Link external href={devURL} title="Development Realm Admin Console">
        {devURL}
      </Link>
      <br />
      <br />
      <Title>Test</Title>
      <Link external href={testURL} title="Test Realm Admin Console">
        {testURL}
      </Link>
      <br />
      <br />
      <Title>Production</Title>
      <Link external href={prodURL} title="Production Realm Admin Console">
        {prodURL}
      </Link>
    </>
  );
}
