import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { ModalContext } from 'context/modal';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { getRealmProfiles, deleteRealmRequest, updateRealmProfile } from 'services/realm';
import CustomRealmTabs from 'page-partials/custom-realm-dashboard/CustomRealmTabs';
import { StatusEnum } from 'validators/create-realm';
import { Table } from '@bcgov-sso/common-react-components';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Grid as SpinnerGrid } from 'react-loader-spinner';

const Container = styled.div`
  padding: 0 1.5em;
`;

interface Props {
  defaultRealmRequests: CustomRealmFormData[];
  alert: BottomAlert;
}
const realmCreatingStatuses = ['pending', 'prSuccess', 'planned'];

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
      header: 'Custom Realm ID',
      accessorKey: 'id',
      enableColumnFilter: false,
    },
    {
      header: 'Custom Realm Name',
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
        const disabled = props.row.original.status !== 'applied' || props.row.original.archived === true;
        return (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <FontAwesomeIcon
              onClick={async () => {
                if (!disabled) handleDeleteRequest(props.row.getValue('id'));
              }}
              icon={faTrash}
              className={`delete-icon ${disabled ? 'disabled' : ''}`}
              role="button"
              data-testid="delete-btn"
              title={disabled ? 'Only applied realms can be disabled' : 'Disable this realm'}
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

  return (
    <Container>
      <h1>Custom Realm Dashboard</h1>
      {loading ? (
        <AlignCenter>
          <SpinnerGrid color="#000" height={45} width={45} wrapperClass="d-block" visible={loading} />
        </AlignCenter>
      ) : (
        <Table columns={columns} data={realmRequests} variant="mini" enablePagination onRowSelect={handleRowSelect} />
      )}

      {selectedRow && (
        <CustomRealmTabs
          lastUpdateTime={lastUpdateTime}
          selectedRow={selectedRow}
          handleRequestStatusChange={handleRequestStatusChange}
        />
      )}
    </Container>
  );
}

const AlignCenter = styled.div`
  text-align: center;
`;

export default withBottomAlert(CustomRealmDashboard);
