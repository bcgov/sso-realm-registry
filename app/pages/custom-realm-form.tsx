import React, { useState, useContext } from 'react';
import Head from 'next/head';
import { submitRealmRequest } from 'services/realm';
import { CustomRealmFormData } from 'types/realm-profile';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import { ModalContext } from 'context/modal';
import RealmForm from 'components/RealmForm';
import styled from 'styled-components';
import { createRealmSchema } from 'validators/create-realm';

export const realmTakenError = 'name taken';

const Container = styled.div`
  padding: 0 2em;
`;

const defaultData: CustomRealmFormData = {
  realm: '',
  purpose: '',
  productName: '',
  primaryEndUsers: [],
  productOwnerEmail: '',
  productOwnerIdirUserId: '',
  technicalContactEmail: '',
  technicalContactIdirUserId: '',
  secondTechnicalContactIdirUserId: '',
  secondTechnicalContactEmail: '',
};

interface Props {
  alert: BottomAlert;
}

function NewRealmForm({ alert }: Props) {
  const [formData, setFormData] = useState<CustomRealmFormData>(defaultData);
  const { setModalConfig } = useContext(ModalContext);
  const router = useRouter();

  // Redirect if not authenticated/loading
  const { status } = useSession();
  if (!['loading', 'authenticated'].includes(status)) {
    signIn('keycloak', {
      callbackUrl: '/custom-realm-form',
    });
    return null;
  }

  const handleSubmit = async (data: CustomRealmFormData) => {
    const [response, err] = await submitRealmRequest(data);
    if (err) {
      if (err.response.status === 409) {
        throw new Error(realmTakenError);
      } else {
        alert.show({
          variant: 'danger',
          fadeOut: 10000,
          closable: true,
          content: 'Network request failure. Please try again.',
        });
      }
    } else {
      router.push('/').then(() => {
        setModalConfig({
          title: 'Custom Realm request submitted',
          body: `We have received your request for a Custom Realm (ID ${response.id}). Please be assured that someone from our team will look into your request and will reach out soon.`,
          show: true,
        });
      });
    }
  };

  return (
    <Container>
      <Head>
        <title>Custom Realm</title>
      </Head>
      <h1 style={{ fontSize: '28px' }}>Request a custom realm</h1>
      <RealmForm
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/')}
        isAdmin={true}
        isPO={true}
        validationSchema={createRealmSchema}
        collapse={false}
      />
    </Container>
  );
}

export default withBottomAlert(NewRealmForm);
