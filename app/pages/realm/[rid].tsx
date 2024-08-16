import React, { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { getRealmProfile, updateRealmProfile } from 'services/realm';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import styled from 'styled-components';
import RealmForm from 'components/RealmForm';
import { getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import { useSession } from 'next-auth/react';
import { User } from 'next-auth';
import { RoleEnum } from 'utils/helpers';
import { ModalContext } from 'context/modal';

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
  alert: BottomAlert;
}

function EditRealm({ alert }: Props) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { rid } = router.query;
  const [realm, setRealm] = useState<CustomRealmFormData | null>(null);
  const { data } = useSession();
  const { setModalConfig } = useContext(ModalContext);
  const currentUser: Partial<User> = data?.user!;

  const updateRealm = (realm: RealmProfile) => {
    setRealm(realm);
  };

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

  useEffect(() => {
    async function fetchRealm() {
      if (!rid) return;
      setLoading(true);
      const [data, err] = await getRealmProfile(rid as string);
      setLoading(false);
      if (!err) {
        updateRealm(data as RealmProfile);
      }
    }

    fetchRealm();
  }, [rid]);

  const showForm = !loading && realm;
  const notFound = !loading && !realm;

  const isAdmin = currentUser?.client_roles?.includes('sso-admin');
  const isPO = currentUser?.idir_username?.toLowerCase() === realm?.productOwnerIdirUserId.toLowerCase();
  let role = RoleEnum.TECHNICAL_LEAD;
  if (isAdmin) role = RoleEnum.ADMIN;
  else if (isPO) role = RoleEnum.PRODUCT_OWNER;

  return (
    <Container rules={mediaRules}>
      {loading && (
        <div
          style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', rowGap: '1em', marginTop: '2em' }}
        >
          <SpinnerGrid color="#000" height={50} width={50} />
          <p>loading content...</p>
        </div>
      )}
      {showForm && (
        <>
          <h1>Edit Realm Information</h1>
          <RealmForm
            formData={realm}
            setFormData={setRealm}
            onSubmit={onSubmit}
            onCancel={() => router.push('/my-dashboard')}
            validationSchema={getUpdateRealmSchemaByRole(role)}
            collapse={false}
          />
        </>
      )}
      {notFound && <h1>Realm Not Found.</h1>}
    </Container>
  );
}

export default withBottomAlert(EditRealm);
