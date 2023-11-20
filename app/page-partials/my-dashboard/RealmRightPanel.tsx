import React, { useState } from 'react';
import Tabs from 'components/Tabs';
import { RealmProfile } from 'types/realm-profile';
import RealmEdit from './RealmEdit';
import RealmURIs from './RealmURIs';
import { User } from 'next-auth';

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
    <div>
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
    </div>
  );
}

export default RealmNavigator;
