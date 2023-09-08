import React, { useState, useEffect } from 'react';
import Tabs from 'components/Tabs';
import RealmTable from './RealmTable';
import DuplicateIDIR from './DuplicateIDIR';
import { RealmProfile } from 'types/realm-profile';

interface Props {
  realms: RealmProfile[];
  onEditClick: (id: string) => void;
  onCancel: () => void;
}

function RealmLeftPanel({ realms, onEditClick, onCancel }: Props) {
  const [tab, setTab] = useState('dashboard');

  return (
    <>
      <Tabs>
        <a className={`nav-link ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          My Dashboard
        </a>
        <a
          className={`nav-link ${tab === 'duplicate' ? 'active' : ''}`}
          onClick={() => {
            setTab('duplicate');
            onCancel();
          }}
        >
          Duplicate Users
        </a>
      </Tabs>
      {tab === 'dashboard' ? <RealmTable realms={realms} onEditClick={onEditClick} /> : <DuplicateIDIR />}
    </>
  );
}

export default RealmLeftPanel;
