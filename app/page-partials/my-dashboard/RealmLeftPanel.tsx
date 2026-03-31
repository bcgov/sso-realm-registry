import { useState } from 'react';
import Tabs from 'components/Tabs';
import RealmTable from './RealmTable';
import { RealmProfile } from 'types/realm-profile';

interface Props {
  realms: RealmProfile[];
  onEditClick: (id: string) => void;
  onCancel: () => void;
  onViewClick: (id: string) => void;
}

function RealmLeftPanel({ realms, onEditClick, onViewClick }: Props) {
  const [tab, setTab] = useState('dashboard');

  return (
    <>
      <Tabs>
        <a className={`nav-link ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          My Dashboard
        </a>
      </Tabs>
      {tab === 'dashboard' && <RealmTable realms={realms} onEditClick={onEditClick} onViewClick={onViewClick} />}
    </>
  );
}

export default RealmLeftPanel;
