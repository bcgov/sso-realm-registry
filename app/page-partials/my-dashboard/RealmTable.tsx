import React from 'react';
import { RealmProfile } from 'types/realm-profile';
import Link from '@button-inc/bcgov-theme/Link';
import { StatusEnum } from 'validators/create-realm';
import { ActionButton } from 'components/ActionButton';
import { faEdit } from '@fortawesome/free-solid-svg-icons';
import { Table } from '@bcgov-sso/common-react-components';

interface Props {
  realms: RealmProfile[];
  onEditClick: (id: string) => void;
}

function RealmTable({ realms, onEditClick }: Props) {
  /** Get a readable realm status. Currently treating only an applied state as active.
   * In the future if edits ever trigger the terraform process this will need to change,
   * since there will still be an active integration while updating. Archived requests
   * are not shown in this view so don't need to check the archived flag.
   */

  const columns = [
    {
      header: 'ID',
      accessorKey: 'id',
      enableColumnFilter: false,
    },
    {
      header: 'Realm',
      accessorKey: 'realm',
      enableColumnFilter: false,
    },
    {
      header: 'Product',
      accessorKey: 'productName',
      enableColumnFilter: false,
    },
    {
      header: 'IDP(s)',
      accessorKey: 'idps',
      enableColumnFilter: false,
    },
    {
      header: 'Product Owner',
      accessorKey: 'productOwner',
      enableColumnFilter: false,
    },
    {
      header: 'Technical Contact',
      accessorKey: 'technicalContact',
      enableColumnFilter: false,
    },
    {
      header: 'Second Technical Contact',
      accessorKey: 'secondTechnicalContact',
      enableColumnFilter: false,
    },
    {
      header: 'Rocket Chat Channel',
      cell: (row: any) => (
        <Link href={row.renderValue() as string} external>
          Link
        </Link>
      ),
      accessorKey: 'rcChannel',
      enableColumnFilter: false,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      enableColumnFilter: false,
    },
    {
      header: 'Actions',
      accessorKey: 'actions',
      enableColumnFilter: false,
      cell: (props: any) => (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ActionButton
            title="edit"
            icon={faEdit}
            onClick={() => {
              onEditClick(String(props.row.getValue('id')));
            }}
          ></ActionButton>
        </div>
      ),
    },
  ];
  const getStatus = (status?: string) => {
    switch (status) {
      case StatusEnum.APPLIED:
        return 'Ready';
      default:
        return 'In Progress';
    }
  };

  return (
    <div style={{ height: '100%' }}>
      <Table
        data={realms.map((r) => {
          return {
            id: r.id,
            realm: r.realm,
            productName: r.productName,
            idps: r.idps.join(', '),
            protocol: r.protocol.join(', '),
            productOwner: r.productOwnerEmail ? `${r.productOwnerEmail} (${r.productOwnerIdirUserId})` : '',
            technicalContact: r.technicalContactEmail
              ? `${r.technicalContactEmail} (${r.technicalContactIdirUserId})`
              : '',
            secondTechnicalContact: r.secondTechnicalContactEmail
              ? `${r.secondTechnicalContactEmail} (${r.secondTechnicalContactIdirUserId})`
              : '',
            status: getStatus(r.status),
            rcChannel: r.rcChannel,
            rcChannelOwnedBy: r.rcChannelOwnedBy,
          };
        })}
        columns={columns}
        enablePagination={false}
        enableGlobalSearch={true}
        variant="mini"
      />
    </div>
  );
}

export default RealmTable;
