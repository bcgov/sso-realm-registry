import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { ModalContext } from 'context/modal';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import {
  getRealmProfiles,
  deleteRealmRequest,
  updateRealmProfile,
  restoreRealmProfile,
  syncRealmAccess,
} from 'services/realm';
import CustomRealmTabs from 'page-partials/custom-realm-dashboard/CustomRealmTabs';
import { StatusEnum } from 'validators/create-realm';
import { Table } from '@bcgov-sso/common-react-components';
import { faRotateRight, faTrash, faTrashRestoreAlt, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import Head from 'next/head';

const Container = styled.div`
  padding: 0 1.5em;
`;

const AccessSyncBanner = styled.div`
  background: rgb(249, 241, 199);
  border-left: 6px solid rgb(252, 186, 25);
  padding: 0.75em 1em;
  margin-bottom: 1em;

  .icon {
    padding-right: 0.5em;
    color: rgb(252, 186, 25);
  }
`;

const AccessSyncFailedBadge = styled.span`
  background: rgb(213, 68, 61);
  color: white;
  border-radius: 0.3em;
  font-size: 0.85em;
  padding: 0.2em 0.5em;
  white-space: nowrap;
`;

interface Props {
  defaultRealmRequests: CustomRealmFormData[];
  alert: BottomAlert;
}

const listFilter = (row: any, columnId: string, value: any) => {
  if (value.length === 0) return true;
  return value.includes(row.getValue(columnId));
};

const statusLabelMap: { [key: string]: string } = {
  [StatusEnum.PENDING]: 'Pending',
  [StatusEnum.APPLIED]: 'Applied',
  [StatusEnum.APPLYFAILED]: 'Apply Failed',
  [StatusEnum.PLANFAILED]: 'Plan Failed',
  [StatusEnum.PLANNED]: 'Planned',
  [StatusEnum.PRFAILED]: 'PR Failed',
  [StatusEnum.PRSUCCESS]: 'PR Succeeded',
};
const statusOptions = Object.entries(statusLabelMap).map(([value, label]) => ({ value, label }));
const syncOptions = [
  { value: false, label: 'In Sync' },
  { value: true, label: 'Out of Sync' },
];

const approvalOptions: { value: null | boolean; label: string }[] = [
  { value: null, label: 'Undecided' },
  { value: true, label: 'Approved' },
  { value: false, label: 'Declined' },
];

const archivedOptions: { value: null | boolean; label: string }[] = [
  { value: true, label: 'True' },
  { value: false, label: 'False' },
];

interface SelectOption {
  value: any;
  label: string;
}

function CustomRealmDashboard({ alert }: Props) {
  const [realmRequests, setRealmRequests] = useState<CustomRealmFormData[]>([]);
  const [selectedRow, setSelectedRow] = useState<CustomRealmFormData | undefined>();
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const { setModalConfig } = useContext(ModalContext);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRealms(true);
  }, []);

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
        variant: 'success',
        fadeOut: 3500,
        closable: true,
        content: `Deleted request id ${id} successfully.`,
      });
      const remainingRealms = realmRequests.filter((realm) => realm.id !== id);
      setRealmRequests(remainingRealms);
      setSelectedRow(remainingRealms[0]);
      await fetchRealms();
    };

    setModalConfig({
      show: true,
      title: 'Delete Custom Realm',
      body: `Are you sure you want to delete this custom realm? Once you delete it, this realm name cannot be used again.`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: handleConfirm,
    });
  };

  const handleRestoreRequest = (id: number) => {
    const handleConfirm = async () => {
      const [, err] = await restoreRealmProfile(String(id));
      if (err) {
        return alert.show({
          variant: 'danger',
          fadeOut: 3500,
          closable: true,
          content: `Network error when deleting request id ${id}. Please try again.`,
        });
      }
      alert.show({
        variant: 'success',
        fadeOut: 3500,
        closable: true,
        content: `Restored request id ${id} successfully.`,
      });
      await fetchRealms();
    };
    setModalConfig({
      show: true,
      title: 'Restore Custom Realm',
      body: `Are you sure you want to restore this custom realm?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: handleConfirm,
    });
  };

  const handleSyncAccessRequest = (id: number) => {
    const handleConfirm = async () => {
      const [result, err] = await syncRealmAccess(String(id));
      if (err || !result?.success) {
        return alert.show({
          variant: 'danger',
          fadeOut: 3500,
          closable: true,
          content: `Realm admin access for request id ${id} could not be synchronized. Please try again.`,
        });
      }
      alert.show({
        variant: 'success',
        fadeOut: 3500,
        closable: true,
        content: `Synchronized realm admin access for request id ${id}.`,
      });
      await fetchRealms();
    };

    setModalConfig({
      show: true,
      title: 'Retry Realm Admin Access Sync',
      body: `This grants master realm access to the current Product Owner and Technical Contact, and removes it from the contacts they replaced. Continue?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: handleConfirm,
    });
  };

  const handleRequestStatusChange = (approval: 'approved' | 'declined', realm: CustomRealmFormData) => {
    const realmId = realm.id;
    const approving = approval === 'approved';
    const handleConfirm = async () => {
      const [, err] = await updateRealmProfile(String(realmId), {
        ...realm,
        approved: approving,
      } as unknown as RealmProfile);
      if (err) {
        return alert.show({
          variant: 'danger',
          fadeOut: 3500,
          closable: true,
          content: `Network error when updating request id ${realmId}. Please try again.`,
        });
      }
      alert.show({
        variant: 'success',
        fadeOut: 3500,
        closable: true,
        content: `Realm request for ${realm?.realm} ${approval}.`,
      });
      const updatedRealms = realmRequests.map((realm) => {
        if (realm.id === realmId) return { ...realm, approved: approving } as RealmProfile;
        return realm;
      });
      setRealmRequests(updatedRealms);
      setSelectedRow({ ...selectedRow, approved: approving } as RealmProfile);
      await fetchRealms();
    };
    const statusVerb = approval === 'approved' ? 'Approve' : 'Decline';
    setModalConfig({
      show: true,
      title: `${statusVerb} Realm Request`,
      body: `Are you sure you want to ${statusVerb.toLocaleLowerCase()} request ${realmId}?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: handleConfirm,
    });
  };

  const columns = [
    {
      header: 'ID',
      accessorKey: 'id',
      enableColumnFilter: false,
    },
    {
      header: 'Name',
      accessorKey: 'realm',
      enableColumnFilter: false,
    },
    {
      header: 'Product Owner',
      accessorKey: 'productOwnerEmail',
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      header: 'Technical Contact',
      accessorKey: 'technicalContactEmail',
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      filterFn: listFilter,
      enableSorting: false,
      meta: {
        filterLabel: 'Request Status',
        filterOptions: statusOptions,
        multiSelect: true,
      },
    },
    {
      header: 'Approval Status',
      accessorKey: 'approved',
      enableSorting: false,
      meta: {
        filterLabel: 'Approved',
        filterOptions: approvalOptions,
      },
      filterFn: listFilter,
      cell: (info: any) => {
        const approved = info.renderValue();
        if (approved === null) return 'Undecided';
        return approved ? 'Approved' : 'Declined';
      },
    },
    {
      header: 'Sync Status',
      accessorKey: 'outOfSync',
      enableSorting: false,
      filterFn: listFilter,
      meta: {
        filterLabel: 'Sync Status',
        filterOptions: syncOptions,
      },
      cell: (info: any) => {
        const outOfSync = info.renderValue();
        return outOfSync ? 'Out of Sync' : 'In Sync';
      },
    },
    {
      header: 'Access Sync',
      accessorKey: 'accessSyncFailedAt',
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info: any) => {
        const failedAt = info.renderValue();
        if (!failedAt) return 'In Sync';
        return (
          <AccessSyncFailedBadge title={`Last failed at ${new Date(failedAt).toLocaleString()}`}>
            Failed
          </AccessSyncFailedBadge>
        );
      },
    },
    {
      header: 'Archived',
      accessorKey: 'archived',
      filterFn: listFilter,
      enableSorting: false,
      meta: {
        filterLabel: 'Archived',
        filterOptions: archivedOptions,
      },
      cell: (info: any) => (info.renderValue() ? 'True' : 'False'),
    },
    {
      header: 'Actions',
      accessorKey: 'actions',
      enableColumnFilter: false,
      enableSorting: false,
      cell: (props: any) => {
        const deleteDisabled = props.row.original.status !== 'applied' || props.row.original.archived === true;
        const restoreDisabled =
          ![StatusEnum.APPLIED].includes(props.row.original.status) || props.row.original.archived === false;
        const syncAccessDisabled = !props.row.original.accessSyncFailedAt;
        return (
          <div style={{ display: 'flex', justifyContent: 'center', columnGap: '0.5rem' }}>
            <FontAwesomeIcon
              onClick={() => {
                if (!syncAccessDisabled) handleSyncAccessRequest(props.row.getValue('id'));
              }}
              icon={faRotateRight}
              className={`delete-icon ${syncAccessDisabled ? 'disabled' : ''}`}
              role="button"
              data-testid="sync-access-btn"
              title={
                syncAccessDisabled
                  ? 'Realm admin access is in sync'
                  : 'Retry the realm admin access sync for this realm'
              }
            />
            <FontAwesomeIcon
              onClick={() => {
                if (!deleteDisabled) handleDeleteRequest(props.row.getValue('id'));
              }}
              icon={faTrash}
              className={`delete-icon ${deleteDisabled ? 'disabled' : ''}`}
              role="button"
              data-testid="delete-btn"
              title={deleteDisabled ? 'Only applied realms can be disabled' : 'Disable this realm'}
            />
            <FontAwesomeIcon
              onClick={() => {
                if (!restoreDisabled) handleRestoreRequest(props.row.getValue('id'));
              }}
              icon={faTrashRestoreAlt}
              className={`delete-icon ${restoreDisabled ? 'disabled' : ''}`}
              role="button"
              data-testid="delete-btn"
              title={restoreDisabled ? 'Only disabled realms can be restored' : 'Restore this realm'}
            />
          </div>
        );
      },
    },
  ];

  const handleRowSelect = (row: any) => {
    setSelectedRow(row);
  };

  const fetchRealms = async (useLoading: boolean = false) => {
    if (useLoading) setLoading(true);
    // Intentionally not flashing error since this is a background fetch.
    const [profiles, err] = await getRealmProfiles(false);
    if (profiles) {
      setLastUpdateTime(new Date());
      setRealmRequests(profiles);
      if (selectedRow) {
        const selectedRowId = selectedRow?.id;
        const updatedRow = profiles.find((profile) => profile.id === selectedRowId);
        if (!updatedRow) return;
        setSelectedRow(updatedRow);
      }
    }
    if (useLoading) setLoading(false);
  };

  const accessSyncFailedRealms = realmRequests.filter((realm) => realm.accessSyncFailedAt);

  return (
    <>
      <Head>
        <title>Custom Realm Dashboard</title>
      </Head>
      <Container>
        {loading ? (
          <AlignCenter>
            <SpinnerGrid color="#000" height={45} width={45} wrapperClass="d-block" visible={loading} />
          </AlignCenter>
        ) : (
          <>
            {accessSyncFailedRealms.length > 0 && (
              <AccessSyncBanner data-testid="access-sync-banner">
                <FontAwesomeIcon icon={faTriangleExclamation} className="icon" />
                Realm admin access could not be synchronized for{' '}
                <strong>{accessSyncFailedRealms.map((realm) => realm.realm).join(', ')}</strong>. The registered
                contacts may not have the access they expect. Retry the sync from the actions column.
              </AccessSyncBanner>
            )}
            <Table
              columns={columns}
              data={realmRequests}
              variant="mini"
              enablePagination
              onRowSelect={handleRowSelect}
            />
          </>
        )}

        {selectedRow && (
          <CustomRealmTabs
            lastUpdateTime={lastUpdateTime}
            selectedRow={selectedRow}
            handleRequestStatusChange={handleRequestStatusChange}
          />
        )}
      </Container>
    </>
  );
}

const AlignCenter = styled.div`
  text-align: center;
`;

export default withBottomAlert(CustomRealmDashboard);
