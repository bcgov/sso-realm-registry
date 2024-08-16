import React, { useState, useContext } from 'react';
import { useRouter } from 'next/router';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { updateRealmProfile } from 'services/realm';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import styled from 'styled-components';
import RealmForm from 'components/RealmForm';
import { getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { useSession } from 'next-auth/react';
import { getServerSession, User } from 'next-auth';
import { RoleEnum } from 'utils/helpers';
import { ModalContext } from 'context/modal';
import { GetServerSidePropsContext } from 'next';
import { authOptions } from 'pages/api/auth/[...nextauth]';
import prisma from 'utils/prisma';

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
  alert: BottomAlert;
}

function EditPage({ realm, alert }: Props) {
  if (!realm) {
    return (
      <Container rules={mediaRules}>
        <h1>Not Found</h1>
      </Container>
    );
  }
  return <EditRealm realm={realm!} alert={alert} />;
}

function EditRealm({ realm: initialRealm, alert }: { realm: CustomRealmFormData; alert: BottomAlert }) {
  const router = useRouter();
  const { rid } = router.query;
  const [realm, setRealm] = useState<CustomRealmFormData>(initialRealm);
  const { data } = useSession();
  const { setModalConfig } = useContext(ModalContext);
  const currentUser: Partial<User> = data?.user!;

  const onSubmit = async (formData: any) => {
    setModalConfig({
      show: true,
      title: `Update Realm Request`,
      body: `Are you sure you want to update request ${realm?.id}?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: async () => {
        await new Promise((res, rej) => {
          setTimeout(() => {
            res(true);
          }, 5000);
        });
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

  const isAdmin = currentUser?.client_roles?.includes('sso-admin');
  const isPO = currentUser?.idir_username?.toLowerCase() === realm?.productOwnerIdirUserId.toLowerCase();
  let role = RoleEnum.TECHNICAL_LEAD;
  if (isAdmin) role = RoleEnum.ADMIN;
  else if (isPO) role = RoleEnum.PRODUCT_OWNER;

  return (
    <Container rules={mediaRules}>
      <h1>Edit Realm Information</h1>
      <RealmForm
        formData={realm}
        setFormData={setRealm}
        onSubmit={onSubmit}
        onCancel={() => router.push('/my-dashboard')}
        validationSchema={getUpdateRealmSchemaByRole(role)}
        collapse={false}
      />
    </Container>
  );
}

export default withBottomAlert(EditPage);

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return;

  const username = session?.user?.idir_username || '';

  try {
    const realm = await prisma.roster.findFirst({
      where: {
        id: Number(context.params?.rid),
        OR: [
          {
            technicalContactIdirUserId: {
              equals: username,
              mode: 'insensitive',
            },
          },
          {
            secondTechnicalContactIdirUserId: {
              equals: username,
              mode: 'insensitive',
            },
          },
          {
            productOwnerIdirUserId: {
              equals: username,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (!realm) {
      return {
        props: {
          realm,
        },
      };
    }

    const realmSerialized = {
      ...realm,
      createdAt: realm?.createdAt?.toISOString(),
      updatedAt: realm?.updatedAt?.toISOString(),
    };
    return {
      props: {
        realm: realmSerialized,
      },
    };
  } catch (err) {
    console.error(err);
    return {
      props: {},
    };
  }
};
