import React from 'react';
import { RealmMemberProfile, RealmProfile } from 'types/realm-profile';
import { StatusEnum } from 'validators/create-realm';
import { ActionButton } from 'components/ActionButton';
import { faEdit, faEye } from '@fortawesome/free-solid-svg-icons';
import { Table } from '@bcgov-sso/common-react-components';
import { useSession } from 'next-auth/react';
import { MemberRoleEnum } from 'utils/constants';

interface Props {
  realms: RealmProfile[];
  onEditClick: (id: string) => void;
  onViewClick: (id: string) => void;
}

const describeMember = (member?: RealmMemberProfile) =>
  member ? `${member.email ?? ''} (${member.idirUsername})` : '';

const findMember = (members: RealmMemberProfile[], role: MemberRoleEnum) =>
  members.find((member) => member.role === role);

function RealmTable({ realms, onEditClick, onViewClick }: Props) {
  /** Get a readable realm status. Currently treating only an applied state as active.
   * In the future if edits ever trigger the terraform process this will need to change,
   * since there will still be an active integration while updating. Archived requests
   * are not shown in this view so don't need to check the archived flag.
   */
  const { data } = useSession();
  const username = data?.user?.idir_username?.toLowerCase();
  const isAdmin = Boolean(data?.user?.client_roles?.includes('sso-admin'));

  /**
   * Additional users hold the same realm access but are view only here, so that any one
   * of ten people cannot remove the product owner or each other.
   */
  const canEdit = (realm: RealmProfile) => {
    if (realm.approved === false) return false;
    if (isAdmin) return true;
    const role = (realm.members ?? []).find((member) => member.idirUsername.toLowerCase() === username)?.role;
    return role === MemberRoleEnum.PRODUCT_OWNER || role === MemberRoleEnum.TECHNICAL_LEAD;
  };

  const canView = (realm: RealmProfile) => realm.approved && realm.status === StatusEnum.APPLIED;

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
      header: 'Product Owner',
      accessorKey: 'productOwner',
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      header: 'Technical Lead',
      accessorKey: 'technicalLead',
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      header: 'Additional Users',
      accessorKey: 'additionalUsers',
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      header: 'Actions',
      accessorKey: 'actions',
      enableColumnFilter: false,
      enableSorting: false,
      cell: (props: any) => (
        <div style={{ display: 'flex', justifyContent: 'center', columnGap: '0.5rem' }}>
          <ActionButton
            aria-label="View URIs"
            icon={faEye}
            onClick={() => {
              if (props.row.original.viewable) onViewClick(String(props.row.getValue('id')));
            }}
            disabled={!props.row.original.viewable}
          />
          <ActionButton
            aria-label="Edit"
            icon={faEdit}
            onClick={() => {
              if (!props.row.original.editable) return;
              onEditClick(String(props.row.getValue('id')));
            }}
            disabled={!props.row.original.editable}
          />
        </div>
      ),
    },
  ];
  const getStatus = (status?: string, approved?: boolean | null) => {
    if (status === StatusEnum.APPLIED) return 'Ready';
    else if (approved === false) return 'Rejected';
    else return 'In Progress';
  };

  return (
    <div style={{ height: '100%' }}>
      <Table
        data={realms.map((r) => {
          const members = r.members ?? [];
          return {
            id: r.id,
            realm: r.realm,
            productName: r.productName,
            productOwner: describeMember(findMember(members, MemberRoleEnum.PRODUCT_OWNER)),
            technicalLead: describeMember(findMember(members, MemberRoleEnum.TECHNICAL_LEAD)),
            additionalUsers: members
              .filter((member) => member.role === MemberRoleEnum.ADDITIONAL)
              .map((member) => member.email ?? member.idirUsername)
              .join(', '),
            status: getStatus(r.status, r.approved),
            approved: r.approved,
            editable: canEdit(r),
            viewable: canView(r),
          };
        })}
        columns={columns}
        enablePagination
        enableGlobalSearch={true}
        variant="mini"
      />
    </div>
  );
}

export default RealmTable;
