import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { getCoreRowModel, useReactTable, flexRender, createColumnHelper } from '@tanstack/react-table';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ModalContext } from 'context/modal';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { getRealmProfiles, deleteRealmRequest, updateRealmProfile } from 'services/realm';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';
import { GetServerSidePropsContext } from 'next';
import { checkAdminRole } from 'utils/helpers';
import { getAllRealms } from 'pages/api/realms';
import CustomRealmTabs from 'page-partials/custom-realm-dashboard/CustomRealmTabs';

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

const columnHelper = createColumnHelper<CustomRealmFormData>();
interface Props {
  defaultRealmRequests: CustomRealmFormData[];
  alert: BottomAlert;
}

const realmCreatingStatuses = ['pending', 'prSuccess', 'planned'];

function CustomRealmDashboard({ defaultRealmRequests, alert }: Props) {
  const [realmRequests, setRealmRequests] = useState<CustomRealmFormData[]>(defaultRealmRequests || []);
  const [selectedRow, setSelectedRow] = useState<CustomRealmFormData | undefined>(defaultRealmRequests[0]);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const { setModalConfig } = useContext(ModalContext);

  // To Add once api in place
  // const handleDeleteRequest = (id: number) => {
  //   const handleConfirm = async () => {
  //     const [, err] = await deleteRealmRequest(id);
  //     if (err) {
  //       return alert.show({
  //         variant: 'danger',
  //         fadeOut: 3500,
  //         closable: true,
  //         content: `Network error when deleting request id ${id}. Please try again.`,
  //       });
  //     }
  //     alert.show({
  //       fadeOut: 3500,
  //       closable: true,
  //       content: `Deleted request id ${id} successfully.`,
  //     });
  //     const remainingRealms = realmRequests.filter((realm) => realm.id !== id);
  //     setRealmRequests(remainingRealms);
  //     setSelectedRow(remainingRealms[0]);
  //   };
  //   setModalConfig({
  //     show: true,
  //     title: 'Delete Realm Request',
  //     body: `Are you sure you want to delete request ${id}?`,
  //     showCancelButton: true,
  //     showConfirmButton: true,
  //     onConfirm: handleConfirm,
  //   });
  // };

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
    columnHelper.accessor('id', {
      header: () => 'Custom Realm ID',
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('realm', {
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
    columnHelper.accessor('approved', {
      header: 'Approval Status',
      cell: (info) => {
        const approved = info.renderValue();
        if (approved === null) return 'Undecided';
        return approved ? 'Approved' : 'Declined';
      },
    }),
    columnHelper.display({
      header: 'Actions',
      cell: (props) => (
        <FontAwesomeIcon
          // Include when deletion implemented
          // onClick={() => handleDeleteRequest(props.row.getValue('id'))}
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

  const fetchRealms = async () => {
    // Intentionally not flashing error since this is a background fetch.
    const [profiles, err] = await getRealmProfiles();
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
    console.log(err);
    return {
      props: {
        defaltRealmRequests: [],
      },
    };
  }
};
