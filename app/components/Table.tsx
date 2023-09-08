import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  getPaginationRowModel,
  FilterFn,
  getFilteredRowModel,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import Pagination from 'react-bootstrap/Pagination';
import styled from 'styled-components';
import Select from 'react-select';
import Grid from '@button-inc/bcgov-theme/Grid';
import StyledTable from 'html-components/Table';
import { useState } from 'react';
import { rankItem } from '@tanstack/match-sorter-utils';
import SearchBar from './SearchBar';

const StyledPagination = styled(Pagination)`
  margin: 0 !important;
  & li {
    margin: 0 !important;
  }
`;

const PageInfo = styled.li`
  padding-left: 5px;
  line-height: 40px;
`;

const StyledSelect = styled(Select)`
  width: 150px;
  display: inline-block;
`;

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);

  // Store the itemRank info
  addMeta({
    itemRank,
  });

  // Return if the item should be filtered in/out
  return itemRank.passed;
};

interface ReactTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T>[];
  noDataFoundMessage: string;
}
const Table = <T extends object>({ data, columns, noDataFoundMessage = 'no data found.' }: ReactTableProps<T>) => {
  const numOfItemsPerPage = () => {
    const options = [5, 10, 15, 20, 25, 30].map((val) => {
      return { value: val, label: `${val} per page` };
    });

    return options;
  };

  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <>
      <SearchBar
        type="text"
        size="small"
        maxLength="1000"
        value={globalFilter ?? ''}
        onChange={(v: any) => setGlobalFilter(String(v.target.value))}
        placeholder="Search all columns..."
        style={{ marginTop: '10px', maxWidth: '25%' }}
      />
      <StyledTable>
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
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr key={noDataFoundMessage}>
              <td colSpan={10}>{noDataFoundMessage}</td>{' '}
            </tr>
          )}
        </tbody>
      </StyledTable>
      <Grid cols={12}>
        <Grid.Row collapse="992" gutter={[]} align="center">
          <Grid.Col span={8}>
            <StyledPagination>
              <Pagination.Item
                key="prev"
                disabled={!table.getCanPreviousPage()}
                onClick={() => {
                  table.previousPage();
                }}
              >
                Previous
              </Pagination.Item>
              <Pagination.Item
                key="next"
                disabled={!table.getCanNextPage()}
                onClick={() => {
                  table.nextPage();
                }}
              >
                Next
              </Pagination.Item>
              <PageInfo>{`${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}`}</PageInfo>
            </StyledPagination>
          </Grid.Col>
          <Grid.Col span={4}>
            <div style={{ textAlign: 'right' }} data-testid="page-select">
              <StyledSelect
                menuPosition="fixed"
                value={table.getState().pagination.pageSize}
                options={numOfItemsPerPage()}
                onChange={(e: any) => {
                  table.setPageSize(Number(e.value));
                }}
              ></StyledSelect>
            </div>
          </Grid.Col>
        </Grid.Row>
      </Grid>
    </>
  );
};

export default Table;
