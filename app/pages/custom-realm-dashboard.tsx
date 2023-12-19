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
  padding: 1em;
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

const columnHelper = createColumnHelper<CustomRealmFormData>();
interface Props {
  defaultRealmRequests: CustomRealmFormData[];
  alert: BottomAlert;
}

const listFilter: FilterFn<any> = (row, columnId, value) => {
  return value.includes(row.getValue(columnId));
};

const FilterBox = styled.div`
  font-weight: normal;
  box-sizing: border-box;
  position: relative;
  transition: max-height 0.3s;
  box-shadow: rgba(0, 0, 0, 0.24) 0px 3px 8px;
  max-height: 0;
  overflow: hidden;
  background: white;
  padding: 0 0.3em;
  border-radius: 0.2em;
  border-color: ${bgGrey};

  &.show {
    max-height: 300px;
  }

  .flex-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .flex-col {
    display: flex;
    flex-direction: column;
  }

  .search-box {
    margin: 0.2em 0.1em;
  }

  .exit-icon {
    padding: 0.2em;
    cursor: pointer;
  }
`;

function ApprovalFilter(props: { in: boolean; column: Column<any, any> }) {
  const [showApproved, setShowApproved] = useState(true);
  const [showDeclined, setShowDeclined] = useState(true);
  const [showUndecided, setShowUndecided] = useState(true);

  const updateFilters = (approve: boolean, decline: boolean, undecided: boolean) => {
    const filters: (null | boolean)[] = [];
    if (approve) filters.push(true);
    if (decline) filters.push(false);
    if (undecided) filters.push(null);
    props.column.setFilterValue(filters);
  };

  return (
    <FilterBox className={props.in ? 'show' : ''}>
      <label className="flex-row" htmlFor="declined-checkbox">
        <span>Declined</span>
        <input
          id="declined-checkbox"
          type="checkbox"
          name="declined"
          checked={showDeclined}
          onChange={() => {
            updateFilters(showApproved, !showDeclined, showUndecided);
            setShowDeclined(!showDeclined);
          }}
        />
      </label>
      <label className="flex-row" htmlFor="approved-checkbox">
        <span>Approved</span>
        <input
          id="approved-checkbox"
          type="checkbox"
          name="approved"
          checked={showApproved}
          onChange={() => {
            updateFilters(!showApproved, showDeclined, showUndecided);
            setShowApproved(!showApproved);
          }}
        />
      </label>
      <label className="flex-row" htmlFor="undecided-checkbox">
        <span>Undecided</span>
        <input
          id="undecided-checkbox"
          type="checkbox"
          name="undecided"
          checked={showUndecided}
          onChange={() => {
            updateFilters(showApproved, showDeclined, !showUndecided);
            setShowUndecided(!showUndecided);
          }}
        />
      </label>
    </FilterBox>
  );
}

function StatusFilter(props: { in: boolean; column: Column<any, any> }) {
  const allValues = Object.values(StatusEnum) as string[];
  const [statusFilters, setStatusFilters] = useState(allValues);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFilter = (event.target as HTMLInputElement).value;
    if (statusFilters.includes(newFilter)) {
      setStatusFilters(statusFilters.filter((value) => value !== newFilter));
      props.column.setFilterValue(statusFilters.filter((value) => value !== newFilter));
    } else {
      setStatusFilters([...statusFilters, newFilter]);
      props.column.setFilterValue([...statusFilters, newFilter]);
    }
  };

  return (
    <FilterBox className={props.in ? 'show' : ''}>
      {allValues.map((val) => (
        <label className="flex-row" key={val}>
          <span>{val}</span>
          <input type="checkbox" onChange={handleChange} checked={statusFilters.includes(val)} value={val} />
        </label>
      ))}
    </FilterBox>
  );
}

function RealmNameFilter(props: { in: boolean; column: Column<any, any> }) {
  const [searchTerm, setSearchTerm] = useState('');

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newVal = event.target.value;
    props.column.setFilterValue(newVal);
    setSearchTerm(newVal);
  };

  const clearSearch = () => {
    setSearchTerm('');
    props.column.setFilterValue('');
  };

  useEffect(() => {
    if (props.in) document.getElementById('realm-name-search-box')?.focus();
  }, [props.in]);

  return (
    <FilterBox className={props.in ? 'show' : ''}>
      <label className="flex-col search-box">
        <span>Search Realms:</span>
        <div className="flex-row">
          <input id="realm-name-search-box" onChange={handleChange} value={searchTerm} />
          <FontAwesomeIcon icon={faClose} size="lg" className="exit-icon" onClick={clearSearch} title="Clear Search" />
        </div>
      </label>
    </FilterBox>
  );
}

function Filter(props: { column: Column<any, any> }) {
  const [showFilters, setShowFilters] = useState(false);
  let FilterComponent;
  switch (props.column.id) {
    case 'status':
      FilterComponent = StatusFilter;
      break;
    case 'approved':
      FilterComponent = ApprovalFilter;
      break;
    default:
      FilterComponent = RealmNameFilter;
  }
  return (
    <span>
      <FontAwesomeIcon
        icon={faFilter}
        onClick={() => setShowFilters(!showFilters)}
        title="Toggle Filter Display"
        style={{ cursor: 'pointer' }}
      />
      <FilterComponent in={showFilters} column={props.column} />
    </span>
  );
}

const searchFilter: FilterFn<any> = (row, columnId, value) => {
  return (row.getValue(columnId) as string).includes(value);
};

const realmCreatingStatuses = ['pending', 'prSuccess', 'planned'];

function CustomRealmDashboard({ defaultRealmRequests, alert }: Props) {
  const [realmRequests, setRealmRequests] = useState<CustomRealmFormData[]>(defaultRealmRequests || []);
  const [selectedRow, setSelectedRow] = useState<CustomRealmFormData | undefined>(defaultRealmRequests[0]);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
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
      cell: (info) => info.renderValue(),
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
                    {header.column.getCanFilter() ? <Filter column={header.column} /> : null}
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
