import React, { useState, useContext } from 'react';
import { useRouter } from 'next/router';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { updateRealmProfile } from 'services/realm';
import { CustomRealmFormData, RealmMember, RealmMemberProfile, RealmProfile } from 'types/realm-profile';
import styled from 'styled-components';
import RealmForm from 'components/RealmForm';
import { getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { getServerSession } from 'next-auth';
import { RoleEnum } from 'utils/helpers';
import { ModalContext } from 'context/modal';
import { GetServerSidePropsContext } from 'next';
import { authOptions } from 'pages/api/auth/[...nextauth]';
import prisma from 'utils/prisma';
// Only ever referenced inside getServerSideProps, so Next strips this from the client
// bundle. Keep it that way: the module reaches Graph and the Keycloak admin client.
import { canEditRealm, getRealmMembers, getUserRoleOnRealm, serializeRoster } from 'controllers/user-access';
import { MemberRoleEnum } from 'utils/constants';

const Container = styled(ResponsiveContainer)`
  font-size: 1rem;
  padding: 0.5rem;

  label {
    display: block;
    margin-bottom: 0.2777em;
    .required {
      color: red;
    }
    font-weight: 700;
    font-size: 0.8rem;
  }
  input {
    display: block;
    border: 2px solid #606060;
    border-radius: 0;
    padding: 0.5em 0.6em;
    border-radius: 0.25em;
    margin-bottom: 1rem;
    width: 100%;

    &:focus {
      outline: 4px solid #3b99fc;
      outline-offset: 1px;
    }

    &:disabled {
      background: #dddddd;
    }
  }
`;

const mediaRules: MediaRule[] = [
  {
    maxWidth: 767,
    marginTop: 10,
  },
  {
    maxWidth: 800,
    width: 680,
    marginTop: 10,
  },
  {
    width: 1150,
    marginTop: 10,
  },
];

interface Props {
  realm: CustomRealmFormData | null;
  role?: string;
  alert: BottomAlert;
}

/** A stored member becomes a form row identified by `userId`, not by name or email. */
const toFormMember = (member?: RealmMemberProfile): RealmMember | null =>
  member ? { userId: member.userId, email: member.email ?? '', idirUsername: member.idirUsername } : null;

export const buildFormData = (realm: CustomRealmFormData): CustomRealmFormData => {
  const members = realm.members ?? [];
  return {
    ...realm,
    productOwner: toFormMember(members.find((member) => member.role === MemberRoleEnum.PRODUCT_OWNER)),
    technicalLead: toFormMember(members.find((member) => member.role === MemberRoleEnum.TECHNICAL_LEAD)),
    additionalUsers: members
      .filter((member) => member.role === MemberRoleEnum.ADDITIONAL)
      .map((member) => toFormMember(member)),
  };
};

function EditPage({ realm, role, alert }: Props) {
  if (!realm) {
    return (
      <Container rules={mediaRules}>
        <h1>Not Found</h1>
      </Container>
    );
  }
  return <EditRealm realm={realm} role={role} alert={alert} />;
}

function EditRealm({
  realm: initialRealm,
  role,
  alert,
}: {
  realm: CustomRealmFormData;
  role?: string;
  alert: BottomAlert;
}) {
  const router = useRouter();
  const { rid } = router.query;
  const [realm, setRealm] = useState<CustomRealmFormData>(buildFormData(initialRealm));
  const { setModalConfig } = useContext(ModalContext);

  const onSubmit = async (formData: any) => {
    setModalConfig({
      show: true,
      title: `Update Realm Request`,
      body: `Are you sure you want to update request ${realm?.id}?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: async () => {
        const [, err] = await updateRealmProfile(rid as string, formData as RealmProfile);
        if (!err) {
          router.push('/my-dashboard').then(() => {
            alert.show({
              variant: 'success',
              fadeOut: 2500,
              closable: true,
              content: 'Realm profile has been updated successfully',
            });
          });
        }
      },
    });
  };

  return (
    <Container rules={mediaRules}>
      <h2>Edit Realm Information</h2>
      <RealmForm
        formData={realm}
        setFormData={setRealm}
        onSubmit={onSubmit}
        onCancel={() => router.push('/my-dashboard')}
        validationSchema={getUpdateRealmSchemaByRole(role ?? RoleEnum.TECHNICAL_LEAD)}
        collapse={false}
      />
    </Container>
  );
}

export default withBottomAlert(EditPage);

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return;

  try {
    const username = session?.user?.idir_username || '';
    const userIsAdmin = Boolean(session?.user?.client_roles?.includes('sso-admin'));
    const id = Number(context.params?.rid);

    const roster = await prisma.roster.findFirst({ where: { id } });

    if (!roster) {
      return {
        props: {
          realm: null,
        },
      };
    }

    // Additional users are view only. The realm still appears on their dashboard so they
    // can see what they hold; this page is not theirs to open.
    const memberRole = userIsAdmin ? null : await getUserRoleOnRealm(id, username);
    if (!canEditRealm(memberRole, userIsAdmin)) {
      return {
        props: {
          realm: null,
        },
      };
    }

    const members = await getRealmMembers(id);
    const realm = serializeRoster(roster, members);

    const realmSerialized = {
      ...realm,
      createdAt: roster.createdAt?.toISOString() ?? null,
      updatedAt: roster.updatedAt?.toISOString() ?? null,
    };

    const role = userIsAdmin
      ? RoleEnum.ADMIN
      : memberRole === MemberRoleEnum.PRODUCT_OWNER
      ? RoleEnum.PRODUCT_OWNER
      : RoleEnum.TECHNICAL_LEAD;

    return {
      props: {
        realm: realmSerialized,
        role,
      },
    };
  } catch (err) {
    console.error(err);
    return {
      props: {},
    };
  }
};
