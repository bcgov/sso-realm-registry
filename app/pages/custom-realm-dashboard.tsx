import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { getCoreRowModel, useReactTable, flexRender, createColumnHelper } from '@tanstack/react-table';
import { CustomRealmFormData } from 'types/realm-profile';
import { faTrash, faCircleCheck, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from '@button-inc/bcgov-theme/Button';
import { ModalContext } from 'context/modal';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { updateRealmRequestStatus, deleteRealmRequest } from 'services/realm';

const Container = styled.div`
  padding: 2em;
`;

const bgGrey = '#ededed';
const selectedRowBg = '#4950fa';
const hoverRowBg = '#fdb913';

const Table = styled.table`
  background-color: ${bgGrey};
  border-collapse: separate;
  padding: 1em;
  border-spacing: 0 0.5em;

  thead {
    tr {
      td,
      th {
        border-bottom: none;
      }
    }
  }

  tbody {
    tr {
      background-color: white;
      td,
      th {
        padding: 0.5em 1em;
      }

      &:hover {
        background-color: ${hoverRowBg};
        color: white;
        cursor: pointer;
      }

      td:last-child {
        border-bottom-right-radius: 0.2em;
        border-top-right-radius: 0.2em;
      }

      td:first-child {
        border-bottom-left-radius: 0.2em;
        border-top-left-radius: 0.2em;
      }

      &.selected {
        background-color: ${selectedRowBg};
        color: white;
        font-weight: bold;
      }

      .delete-icon:hover {
        color: red;
      }
    }
  }
`;

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

const ApprovalList = styled.ul`
  list-style-type: none;
  margin: 0;
  width: 100%;

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

/**
 * Return an object with formatted key values to display the details
 */
const formatRealmData = (realm?: CustomRealmFormData) => {
  if (!realm) return null;
  let primaryUsers = Object.keys(realm.primaryUsers)
    .filter((key) => !['other', 'otherDetails'].includes(key))
    .join(', ');
  if (Object.keys(realm.primaryUsers).includes('otherDetails')) {
    primaryUsers += `, Other: ${realm.primaryUsers.otherDetails}`;
  }
  const environments = Object.keys(realm.environments)
    .filter((env) => realm.environments[env as 'dev' | 'test' | 'prod'])
    .join(', ');

  return {
    Name: realm.realmName,
    Purpose: realm.realmPurpose,
    'Primary end users': primaryUsers,
    Environments: environments,
    'Realm Admin(s) login method': realm.loginIdp,
    "Product owner's email": realm.productOwnerEmail,
    "Product owner's IDIR": realm.productOwnerIdir,
    "Technical contact's email": realm.technicalContactEmail,
    "Technical contact's IDIR": realm.technicalContactIdir,
    "Secondary technical contact's email": realm.secondaryTechnicalContactEmail,
    "Secondary technical contact's IDIR": realm.secondaryTechnicalContactIdir,
  };
};

const columnHelper = createColumnHelper<CustomRealmFormData>();
interface Props {
  defaultRealmRequests: CustomRealmFormData[];
  alert: BottomAlert;
}

function CustomRealmDashboard({ defaultRealmRequests, alert }: Props) {
  const [realmRequests, setRealmRequests] = useState<CustomRealmFormData[]>(defaultRealmRequests);
  const [selectedTab, setSelectedTab] = useState('Details');
  const [selectedRow, setSelectedRow] = useState<CustomRealmFormData | undefined>(defaultRealmRequests[0]);
  const { setModalConfig, modalConfig } = useContext(ModalContext);

  const tabs = ['Details', 'Access Request'];

  const handleDeleteRequest = (id: number) => {
    const handleConfirm = async () => {
      const [, err] = await deleteRealmRequest(id);
      if (err) {
        return alert.show({
          variant: 'danger',
          fadeOut: 3500,
          closable: true,
          content: `Network error when deleting request id ${id}. Please try again.`,
        });
      }
      alert.show({
        fadeOut: 3500,
        closable: true,
        content: `Deleted request id ${id} successfully.`,
      });
      const remainingRealms = realmRequests.filter((realm) => realm.id !== id);
      setRealmRequests(remainingRealms);
      setSelectedRow(remainingRealms[0]);
    };
    setModalConfig({
      show: true,
      title: 'Delete Realm Request',
      body: `Are you sure you want to delete request ${id}?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: handleConfirm,
    });
  };

  const handleRequestStatusChange = (newStatus: 'approved' | 'declined', id?: number) => {
    if (!id) return;
    const handleConfirm = async () => {
      const [, err] = await updateRealmRequestStatus(id, newStatus);
      if (err) {
        return alert.show({
          variant: 'danger',
          fadeOut: 3500,
          closable: true,
          content: `Network error when updating request id ${id}. Please try again.`,
        });
      }
      alert.show({
        fadeOut: 3500,
        closable: true,
        content: `Request id ${id} ${newStatus}.`,
      });
      const updatedRealms = realmRequests.map((realm) => {
        if (realm.id === id) return { ...realm, status: newStatus } as CustomRealmFormData;
        return realm;
      });
      setRealmRequests(updatedRealms);
      setSelectedRow({ ...selectedRow, status: newStatus } as CustomRealmFormData);
    };
    const statusVerb = newStatus === 'approved' ? 'Approve' : 'Decline';
    setModalConfig({
      show: true,
      title: `${statusVerb} Realm Request`,
      body: `Are you sure you want to ${statusVerb.toLocaleLowerCase()} request ${id}?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: handleConfirm,
    });
  };

  const columns = [
    columnHelper.accessor('id', {
      header: () => 'Custom Realm ID',
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('realmName', {
      header: () => 'Custom Realm Name',
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('productOwnerEmail', {
      header: () => 'Product Owner',
      cell: (info) => info.renderValue(),
    }),
    columnHelper.accessor('technicalContactEmail', {
      header: () => 'Technical Contact',
      cell: (info) => info.renderValue(),
    }),
    columnHelper.accessor('status', {
      header: 'Request Status',
      cell: (info) => info.renderValue(),
    }),
    columnHelper.display({
      header: 'Actions',
      cell: (props) => (
        <FontAwesomeIcon
          onClick={() => handleDeleteRequest(props.row.getValue('id'))}
          icon={faTrash}
          className="delete-icon"
          role="button"
          data-testid="delete-btn"
        />
      ),
    }),
  ];

  const table = useReactTable({
    data: realmRequests,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const formattedRealmData = formatRealmData(selectedRow);

  return (
    <Container>
      <h1>Custom Realm Dashboard</h1>
      <Table data-testid="custom-realm-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => setSelectedRow(row.original)}
              className={row.getValue('id') === selectedRow?.id ? 'selected' : ''}
              data-testid={`custom-realm-row-${row.getValue('id')}`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
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
          {selectedRow?.status === 'pending' && (
            <>
              <p>To begin the approval process for this Custom Realm, click below.</p>
              <div className="button-container">
                <Button onClick={() => handleRequestStatusChange('approved', selectedRow?.id)}>
                  Approve Custom Realm
                </Button>
                <Button variant="secondary" onClick={() => handleRequestStatusChange('declined', selectedRow?.id)}>
                  Decline Custom Realm
                </Button>
              </div>
            </>
          )}
          {['approved', 'created'].includes(selectedRow?.status || '') && (
            <ApprovalList>
              <li>
                <span>SSO Approval</span>
                <FontAwesomeIcon icon={faCircleCheck} color="green" />
              </li>
              <li>
                <span>Access Custom Realm</span>
                <FontAwesomeIcon icon={selectedRow?.status === 'approved' ? faSpinner : faCircleCheck} />
              </li>
            </ApprovalList>
          )}
          {selectedRow?.status === 'declined' && <p>This request has been declined.</p>}
        </TabPanel>
      )}
    </Container>
  );
}

export default withBottomAlert(CustomRealmDashboard);

export const getServerSideProps = () => {
  // TODO: fetch requests from db. Just putting some example data.
  return {
    props: {
      defaultRealmRequests: [
        {
          id: 1,
          realmName: 'realm 1',
          realmPurpose: 'something',
          primaryUsers: {
            livingInBC: true,
            businessInBC: true,
            govEmployees: true,
            other: true,
            otherDetails: 'Some stuff',
          },
          environments: {
            dev: true,
            test: true,
            prod: true,
          },
          loginIdp: 'idir',
          productOwnerEmail: 'a@b.com',
          productOwnerIdir: 'me',
          technicalContactEmail: 'b@c.com',
          technicalContactIdir: 'd@e.com',
          secondaryTechnicalContactIdir: 'dmsd',
          secondaryTechnicalContactEmail: 'dksadlks@fkjlsdj.com',
          status: 'pending',
        },
        {
          id: 2,
          realmName: 'realm 2',
          realmPurpose: 'something',
          primaryUsers: {
            livingInBC: true,
            businessInBC: true,
            govEmployees: true,
            other: true,
            otherDetails: 'Something',
          },
          environments: {
            dev: true,
            test: true,
            prod: true,
          },
          loginIdp: 'idir',
          productOwnerEmail: 'a@b.com',
          productOwnerIdir: 'me',
          technicalContactEmail: 'b@c.com',
          technicalContactIdir: 'd@e.com',
          secondaryTechnicalContactIdir: 'dmsd',
          secondaryTechnicalContactEmail: 'dksadlks@fkjlsdj.com',
          status: 'approved',
        },
      ],
    },
  };
};
