import React, { ChangeEvent, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  createColumnHelper,
  SortingState,
  useReactTable,
  ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  FilterFn,
  flexRender,
  Column,
} from '@tanstack/react-table';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { faSort, faSortUp, faSortDown, faTrash, faFilter, faClose } from '@fortawesome/free-solid-svg-icons';
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
import Select, { MultiValue } from 'react-select';
import { StatusEnum } from 'validators/create-realm';

const Container = styled.div`
  padding: 2em;
`;

const bgGrey = '#ededed';
const selectedRowBg = '#4950fa';
const hoverRowBg = '#fdb913';

const Table = styled.table`
  background-color: ${bgGrey};
  border-collapse: separate;
  padding: 0 1em;
  border-spacing: 0 0.5em;

  thead {
    tr {
      td,
      th {
        border-bottom: none;
        vertical-align: top;
      }
      th > div.sortable {
        svg {
          padding-left: 0.2em;
        }
        cursor: pointer;
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

      .delete-icon {
        padding: 0.2em;
      }

      .delete-icon.disabled {
        cursor: not-allowed;
        color: grey;
        &:hover {
          color: grey;
        }
      }

      .delete-icon:hover {
        color: red;
      }
    }
  }
`;

// Filter Functions
const listFilter: FilterFn<any> = (row, columnId, value) => {
  if (value.length === 0) return true;
  return value.includes(row.getValue(columnId));
};
const searchFilter: FilterFn<any> = (row, columnId, value) => {
  return (row.getValue(columnId) as string).includes(value);
};

const columnHelper = createColumnHelper<CustomRealmFormData>();
interface Props {
  defaultRealmRequests: CustomRealmFormData[];
  alert: BottomAlert;
}
const realmCreatingStatuses = ['pending', 'prSuccess', 'planned'];

const FiltersContainer = styled.div`
  display: flex;
  column-gap: 1em;
  margin-bottom: 0.5em;

  .input-container {
    display: flex;
    width: 17em;
    flex-direction: column;
    label {
      font-weight: bold;
    }

    .react-select-input {
      height: 41px;
      border: 1px solid rgb(204, 204, 204);
      border-radius: 4px;
      outline: #2684ff;
      &:focus-visible {
        outline: #2684ff auto 2px;
      }
      &:hover {
        border: 1px solid rgb(180, 180, 180);
      }
    }

    .flex-row {
      display: flex;
      align-items: center;
      input {
        flex-grow: 1;
      }
    }

    .clear-input-icon {
      margin-left: 0.1em;
      color: rgb(204, 204, 204);
      &:hover {
        color: rgb(180, 180, 180);
      }
    }
  }
`;

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

interface SelectOption {
  value: string;
  label: string;
}

function CustomRealmDashboard({ defaultRealmRequests, alert }: Props) {
  const [realmRequests, setRealmRequests] = useState<CustomRealmFormData[]>(defaultRealmRequests || []);
  const [selectedRow, setSelectedRow] = useState<CustomRealmFormData | undefined>(defaultRealmRequests[0]);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState<null | MultiValue<SelectOption>>(null);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<null | MultiValue<{
    value: null | boolean;
    label: string;
  }>>(null);
  const [realmNameFilter, setRealmNameFilter] = useState<string>('');
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
    columnHelper.accessor('id', {
      header: () => 'Custom Realm ID',
      cell: (info) => info.getValue(),
      enableColumnFilter: false,
    }),
    columnHelper.accessor('realm', {
      header: () => 'Custom Realm Name',
      cell: (info) => info.getValue(),
      filterFn: searchFilter,
      enableColumnFilter: true,
      enableSorting: false,
    }),
    columnHelper.accessor('productOwnerEmail', {
      header: () => 'Product Owner',
      enableColumnFilter: false,
      cell: (info) => info.renderValue(),
    }),
    columnHelper.accessor('technicalContactEmail', {
      header: () => 'Technical Contact',
      enableColumnFilter: false,
      cell: (info) => info.renderValue(),
    }),
    columnHelper.accessor('status', {
      header: 'Request Status',
      enableSorting: false,
      cell: (info) => {
        const val = info.renderValue();
        if (val && statusLabelMap[val]) {
          return statusLabelMap[val];
        } else {
          return val;
        }
      },
      enableColumnFilter: true,
      filterFn: listFilter,
    }),
    columnHelper.accessor('approved', {
      header: 'Approval Status',
      enableSorting: false,
      enableColumnFilter: true,
      filterFn: listFilter,
      cell: (info) => {
        const approved = info.renderValue();
        if (approved === null) return 'Undecided';
        return approved ? 'Approved' : 'Declined';
      },
    }),
    columnHelper.display({
      header: 'Actions',
      enableSorting: false,
      cell: (props) => {
        const disabled = props.row.original.status !== 'applied' || props.row.original.archived === true;
        return (
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
        );
      },
    }),
  ];

  const table = useReactTable({
    data: realmRequests,
    columns,
    onSortingChange: setSorting,
    enableColumnFilters: true,
    state: {
      sorting,
      columnFilters,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    enableFilters: true,
    getFilteredRowModel: getFilteredRowModel(),
  });

  const fetchRealms = async () => {
    // Intentionally not flashing error since this is a background fetch.
    const [profiles, err] = await getRealmProfiles(true);
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
      <FiltersContainer>
        <div className="input-container">
          <label htmlFor="realm-name-filter-input">Request Name Filter:</label>
          <div className="flex-row">
            <input
              className="react-select-input"
              value={realmNameFilter}
              onChange={(e) => {
                const newValue = e.target.value;
                setRealmNameFilter(newValue);
                table.getColumn('realm')?.setFilterValue(newValue);
              }}
              id="realm-name-filter-input"
            />
            <FontAwesomeIcon
              icon={faClose}
              title="Clear filter"
              size="lg"
              className="clear-input-icon"
              onClick={() => {
                setRealmNameFilter('');
                table.getColumn('realm')?.setFilterValue('');
              }}
            />
          </div>
        </div>
        <div className="input-container">
          <label htmlFor="status-filter-select">Request Status Filters:</label>
          <Select
            value={requestStatusFilter}
            onChange={(selected) => {
              setRequestStatusFilter(selected);
              const newFilter = Array.from(selected.values()).map((selection) => selection.value);
              table.getColumn('status')?.setFilterValue(newFilter);
            }}
            options={statusOptions}
            inputId="status-filter-select"
            isMulti={true}
          />
        </div>
        <div className="input-container">
          <label htmlFor="approval-filter-select">Request Approval Filters:</label>
          <Select
            value={approvalStatusFilter}
            onChange={(selected) => {
              setApprovalStatusFilter(selected);
              const newFilter = Array.from(selected.values()).map((selection) => selection.value);
              table.getColumn('approved')?.setFilterValue(newFilter);
            }}
            options={approvalOptions}
            inputId="approval-filter-select"
            isMulti={true}
          />
        </div>
      </FiltersContainer>
      <Table data-testid="custom-realm-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  <div
                    {...{
                      className: header.column.getCanSort() ? 'sortable' : '',
                      onClick: () => header.column.toggleSorting(),
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() &&
                      ({
                        asc: <FontAwesomeIcon icon={faSortDown} />,
                        desc: <FontAwesomeIcon icon={faSortUp} />,
                      }[header.column.getIsSorted() as string] ?? <FontAwesomeIcon icon={faSort} />)}
                  </div>
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
    const realms = await getAllRealms(username, isAdmin, true);
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
