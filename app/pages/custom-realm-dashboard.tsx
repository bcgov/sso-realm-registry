import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { ModalContext } from 'context/modal';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { getRealmProfiles, deleteRealmRequest, updateRealmProfile } from 'services/realm';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';
import { GetServerSidePropsContext } from 'next';
import { checkAdminRole } from 'utils/helpers';
import { getAllRealms } from 'pages/api/realms';
import CustomRealmTabs from 'page-partials/custom-realm-dashboard/CustomRealmTabs';
import { StatusEnum } from 'validators/create-realm';
import { Table } from '@bcgov-sso/common-react-components';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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

function CustomRealmDashboard({ defaultRealmRequests, alert }: Props) {
  const [realmRequests, setRealmRequests] = useState<CustomRealmFormData[]>(defaultRealmRequests || []);
  const [selectedRow, setSelectedRow] = useState<CustomRealmFormData | undefined>();
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const { setModalConfig } = useContext(ModalContext);

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
        content: `Request id ${realmId} ${approval}.`,
      });
      const updatedRealms = realmRequests.map((realm) => {
        if (realm.id === realmId) return { ...realm, approved: approving } as CustomRealmFormData;
        return realm;
      });
      setRealmRequests(updatedRealms);
      setSelectedRow({ ...selectedRow, approved: approving } as CustomRealmFormData);
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
    },
    {
      header: 'Technical Contact',
      accessorKey: 'technicalContactEmail',
      enableColumnFilter: false,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      filterFn: listFilter,
      meta: {
        filterLabel: 'Request Status',
        filterOptions: statusOptions,
        multiSelect: true,
      },
    },
    {
      header: 'Approval Status',
      accessorKey: 'approved',
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
              onClick={() => {
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

  const fetchRealms = async () => {
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
  };

  let interval: any;
  useEffect(() => {
    if (interval) clearInterval(interval);

    if (selectedRow?.approved && realmCreatingStatuses.includes(selectedRow?.status || '')) {
      interval = setInterval(() => {
        fetchRealms();
      }, 15000);
    }

    return () => clearInterval(interval);
  }, [selectedRow]);

  return (
    <Container>
      <h1>Custom Realm Dashboard</h1>
      <Table
        columns={columns}
        data={realmRequests}
        variant="mini"
        enablePagination={false}
        onRowSelect={handleRowSelect}
      />
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

export default withBottomAlert(CustomRealmDashboard);

interface ExtendedForm extends CustomRealmFormData {
  createdAt: object;
  updatedAt: object;
}

/**Fetch realm data with first page load */
export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session)
    return {
      props: { defaultRealmRequests: [] },
    };

  const username = session?.user?.idir_username || '';
  const isAdmin = checkAdminRole(session?.user);

  try {
    const realms = await getAllRealms(username, isAdmin);
    // Strip non-serializable dates
    const formattedRealms = realms.map((realm: ExtendedForm) => {
      const { createdAt, updatedAt, ...rest } = realm;
      return rest;
    });

    return {
      props: {
        defaultRealmRequests: formattedRealms,
      },
    };
  } catch (err) {
    console.error(err);
    return {
      props: {
        defaltRealmRequests: [],
      },
    };
  }
};
