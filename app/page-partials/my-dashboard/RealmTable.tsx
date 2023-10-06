import React from 'react';
import Button from '@button-inc/bcgov-theme/Button';
import { RealmProfile } from 'types/realm-profile';
import Table from 'components/Table';
import Link from '@button-inc/bcgov-theme/Link';

interface Props {
  realms: RealmProfile[];
  onEditClick: (id: string) => void;
}

function RealmTable({ realms, onEditClick }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table
        data={realms.map((r) => {
          return {
            realm: r.realm,
            productName: r.product_name,
            idps: r.idps.join(', '),
            protocol: r.protocol.join(', '),
            productOwnerEmail: r.product_owner_email,
            productOwnerIdirUserId: r.product_owner_idir_userid,
            technicalContactEmail: r.technical_contact_email,
            technicalContactIdirUserId: r.technical_contact_idir_userid,
            secondTechnicalContactEmail: r.second_technical_contact_email,
            secondTechnicalContactIdirUserId: r.second_technical_contact_idir_userid,
            rcChannel: r.rc_channel,
            rcChannelOwnedBy: r.rc_channel_owned_by,
            actions: (
              <Button
                size="small"
                variant="secondary"
                style={{ position: 'relative' }}
                onClick={() => onEditClick(r.id)}
              >
                Edit{' '}
              </Button>
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
