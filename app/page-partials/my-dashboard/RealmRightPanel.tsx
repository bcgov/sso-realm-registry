import React, { useState } from 'react';
import Tabs from 'components/Tabs';
import styled from 'styled-components';
import { RealmProfile } from 'types/realm-profile';
import RealmEdit from './RealmEdit';
import RealmURIs from './RealmURIs';
import { User } from 'next-auth';

const Container = styled.div`
  font-size: 1rem;
  padding: 0 0.5rem 0 0.5rem;

  label {
    display: block;
    margin-bottom: 0.2777em;
    .required {
      color: red;
    }
    font-weight: 700;
    font-size: 0.8rem;
  }
  input,
  select,
  textarea {
    display: block;
    border: 2px solid #606060;
    padding: 0.5em 0.6em;
    border-radius: 0.25em;
    margin-bottom: 1rem;
    width: 100%;

    &:focus {
      outline: 4px solid #3b99fc;
      outline-offset: 1px;
    }

    &:disabled {
      background: #dddddd;
    }
  }
`;

interface Props {
  realm: RealmProfile;
  currentUser: Partial<User>;
  onUpdate: (realm: RealmProfile) => void;
  onCancel: () => void;
}

let time = 0;
setInterval(() => {
  time++;
}, 1000);

function RealmNavigator({ realm, currentUser, onUpdate, onCancel }: Props) {
  const [tab, setTab] = useState('details');

  if (!realm) return null;

  return (
    <Container>
      <Tabs>
        <a className={`nav-link ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>
          Details
        </a>
        <a className={`nav-link ${tab === 'uris' ? 'active' : ''}`} onClick={() => setTab('uris')}>
          URIs
        </a>
      </Tabs>
      <br />
      {tab === 'details' ? (
        <RealmEdit realm={realm} currentUser={currentUser} onUpdate={onUpdate} onCancel={onCancel} />
      ) : tab === 'uris' ? (
        <RealmURIs realm={realm} />
      ) : null}
    </Container>
  );
}

export default RealmNavigator;
