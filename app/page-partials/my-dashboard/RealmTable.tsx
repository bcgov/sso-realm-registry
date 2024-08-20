import React from 'react';
import Button from '@button-inc/bcgov-theme/Button';
import { RealmProfile } from 'types/realm-profile';
import Table from 'components/Table';
import Link from '@button-inc/bcgov-theme/Link';
import { StatusEnum } from 'validators/create-realm';

interface Props {
  realms: RealmProfile[];
  onEditClick: (id: string) => void;
  onViewClick: (id: string) => void;
}

function RealmTable({ realms, onEditClick, onViewClick }: Props) {
  /** Get a readable realm status. Currently treating only an applied state as active.
   * In the future if edits ever trigger the terraform process this will need to change,
   * since there will still be an active integration while updating. Archived requests
   * are not shown in this view so don't need to check the archived flag.
   */
  const getStatus = (status?: string) => {
    switch (status) {
      case StatusEnum.APPLIED:
        return 'Ready';
      default:
        return 'In Progress';
    }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <Table
        data={realms.map((r) => {
          return {
            realm: r.realm,
            productName: r.productName,
            idps: r.idps.join(', '),
            protocol: r.protocol.join(', '),
            productOwnerEmail: r.productOwnerEmail,
            productOwnerIdirUserId: r.productOwnerIdirUserId,
            technicalContactEmail: r.technicalContactEmail,
            technicalContactIdirUserId: r.technicalContactIdirUserId,
            secondTechnicalContactEmail: r.secondTechnicalContactEmail,
            secondTechnicalContactIdirUserId: r.secondTechnicalContactIdirUserId,
            status: getStatus(r.status),
            rcChannel: r.rcChannel,
            rcChannelOwnedBy: r.rcChannelOwnedBy,
            actions: (
              <div style={{ display: 'flex', columnGap: '0.5rem' }}>
                <Button
                  size="small"
                  variant="secondary"
                  style={{ position: 'relative' }}
                  onClick={() => onEditClick(String(r.id))}
                >
                  Edit{' '}
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  style={{ position: 'relative' }}
                  onClick={() => onViewClick(String(r.id))}
                >
                  View{' '}
                </Button>
              </div>
            ),
          };
        })}
        columns={[
          {
            header: 'Keycloak Realm Name',
            cell: (row) => row.renderValue(),
            accessorKey: 'realm',
          },
          {
            header: 'Product Name',
            cell: (row) => row.renderValue(),
            accessorKey: 'productName',
          },
          {
            header: 'Identity Provider',
            cell: (row) => row.renderValue(),
            accessorKey: 'idps',
          },
          {
            header: 'Protocol',
            cell: (row) => row.renderValue(),
            accessorKey: 'protocol',
          },
          {
            header: 'Product Owner Email',
            cell: (row) => row.renderValue(),
            accessorKey: 'productOwnerEmail',
          },
          {
            header: 'Product Owner IDIR',
            cell: (row) => row.renderValue(),
            accessorKey: 'productOwnerIdirUserId',
          },
          {
            header: 'Technical Owner Email',
            cell: (row) => row.renderValue(),
            accessorKey: 'technicalContactEmail',
          },
          {
            header: 'Technical Owner IDIR',
            cell: (row) => row.renderValue(),
            accessorKey: 'technicalContactIdirUserId',
          },
          {
            header: 'Second Technical Owner Email',
            cell: (row) => row.renderValue(),
            accessorKey: 'secondTechnicalContactEmail',
          },
          {
            header: 'Second Technical Owner IDIR',
            cell: (row) => row.renderValue(),
            accessorKey: 'secondTechnicalContactIdirUserId',
          },
          {
            header: 'Rocket Chat Channel',
            cell: (row) => (
              <Link href={row.renderValue() as string} external>
                Rocketchat
              </Link>
            ),
            accessorKey: 'rcChannel',
          },
          {
            header: 'Rocket Chat Channel Owner',
            cell: (row) => row.renderValue(),
            accessorKey: 'rcChannelOwnedBy',
          },
          {
            header: 'Status',
            cell: (row) => row.renderValue(),
            accessorKey: 'status',
          },
          {
            header: 'Actions',
            cell: (row) => row.renderValue(),
            accessorKey: 'actions',
          },
        ]}
        noDataFoundMessage={'No realms found.'}
      />
    </div>
  );
}

export default RealmTable;
