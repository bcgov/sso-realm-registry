import styled from 'styled-components';
import React, { useState } from 'react';
import { CustomRealmFormData } from 'types/realm-profile';
import { faCircleCheck, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from '@button-inc/bcgov-theme/Button';

const Tabs = styled.ul`
  display: flex;
  flex-direction: row;
  list-style-type: none;
  border-bottom: 1px solid grey;
  margin: 0;

  li {
    margin: 0 1em;
    &:hover {
      cursor: pointer;
    }
    &.selected {
      font-weight: bold;
    }
    &:first-child {
      margin-left: 0;
    }
  }
`;

const TabPanel = styled.div`
  margin-top: 1em;
  .button-container {
    button {
      margin-right: 1em;
    }
  }
`;

const SApprovalList = styled.ul`
  list-style-type: none;
  margin: 0;
  width: 100%;

  .help-text {
    color: grey;
    font-size: 0.8em;
    margin: 0;
    margin-bottom: 1em;
  }

  .title {
    margin: 0;
  }

  li {
    border-bottom: 1px solid black;
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    margin-bottom: 0;
    align-items: center;
    margin-top: 0.3em;
  }
`;

const realmCreationFailedStatuses = ['PrFailed', 'planFailed', 'applyFailed'];

const realmCreatingStatuses = ['pending', 'prSuccess', 'planned'];

/**
 * Return an object with formatted key values to display the details
 */
const formatRealmData = (realm?: CustomRealmFormData) => {
  if (!realm) return null;

  return {
    Name: realm.realm,
    Purpose: realm.purpose,
    'Primary end users': realm.primaryEndUsers.join(', '),
    Environments: realm.environments.join(', '),
    "Product owner's email": realm.productOwnerEmail,
    "Product owner's IDIR": realm.productOwnerIdirUserId,
    "Technical contact's email": realm.technicalContactEmail,
    "Technical contact's IDIR": realm.technicalContactIdirUserId,
    "Secondary technical contact's email": realm.secondTechnicalContactEmail,
    "Secondary technical contact's IDIR": realm.secondTechnicalContactIdirUserId,
  };
};

interface Props {
  selectedRow: CustomRealmFormData;
  lastUpdateTime: Date;
}

function ApprovalList({ selectedRow, lastUpdateTime }: Props) {
  if (selectedRow.approved === false) return <p>This request has been declined.</p>;

  return (
    <>
      {[...realmCreatingStatuses, 'applied'].includes(selectedRow.status!) && (
        <SApprovalList>
          <p className="title">Approval process initiated.</p>
          <p className="help-text">
            Last updated at {lastUpdateTime.toLocaleDateString()}, {lastUpdateTime.toLocaleTimeString()}
          </p>
          <li>
            <span>SSO Approval</span>
            <FontAwesomeIcon icon={faCircleCheck} color="green" />
          </li>
          <li>
            <span>Access Custom Realm</span>
            {selectedRow.status === 'applied' ? (
              <FontAwesomeIcon icon={faCircleCheck} color="green" />
            ) : (
              <FontAwesomeIcon icon={faSpinner} className="fa-pulse" />
            )}
          </li>
        </SApprovalList>
      )}
      {realmCreationFailedStatuses.includes(selectedRow.status!) && (
        <p>This request is in a failed state: {selectedRow.status}</p>
      )}
    </>
  );
}

const tabs = ['Details', 'Access Request'];

interface CRTProps extends Props {
  handleRequestStatusChange: (status: 'approved' | 'declined', row: CustomRealmFormData) => void;
}

export default function CutsomRealmTabs({ selectedRow, handleRequestStatusChange, lastUpdateTime }: CRTProps) {
  const [selectedTab, setSelectedTab] = useState('Details');
  const formattedRealmData = formatRealmData(selectedRow);
  return (
    <>
      <h2>Custom Realm Details</h2>
      <Tabs>
        {tabs.map((tab) => (
          <li onClick={() => setSelectedTab(tab)} key={tab} className={tab === selectedTab ? 'selected' : ''}>
            {tab}
          </li>
        ))}
      </Tabs>
      {/* Only display details if formattedRealmData is not null */}
      {formattedRealmData && selectedTab === 'Details' && (
        <TabPanel>
          {Object.entries(formattedRealmData).map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>: <strong>{value}</strong>
              <br />
            </div>
          ))}
        </TabPanel>
      )}
      {selectedTab === 'Access Request' && (
        <TabPanel>
          {selectedRow.approved === null ? (
            <>
              <p>To begin the approval process for this Custom Realm, click below.</p>
              <div className="button-container">
                <Button onClick={() => handleRequestStatusChange('approved', selectedRow)}>Approve Custom Realm</Button>
                <Button variant="secondary" onClick={() => handleRequestStatusChange('declined', selectedRow)}>
                  Decline Custom Realm
                </Button>
              </div>
            </>
          ) : (
            <ApprovalList lastUpdateTime={lastUpdateTime} selectedRow={selectedRow} />
          )}
        </TabPanel>
      )}
    </>
  );
}
