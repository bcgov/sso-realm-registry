import React, { useState } from 'react';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { updateRealmProfile } from 'services/realm';
import { UserSession } from 'types/user-session';
import styled from 'styled-components';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { RoleEnum } from 'utils/helpers';
import RealmForm from 'components/RealmForm';
import { getUpdateRealmSchemaByRole } from 'validators/create-realm';

const AlignCenter = styled.div`
  text-align: center;
`;

interface Props {
  alert: BottomAlert;
  realm: RealmProfile;
  currentUser: UserSession;
  onUpdate: (realm: RealmProfile) => void;
  onCancel: () => void;
}

let time = 0;
setInterval(() => {
  time++;
}, 1000);

function RealmTable({ alert, realm, currentUser, onUpdate }: Props) {
  const [formData, setFormData] = useState(realm as CustomRealmFormData);

  const onSubmit = async (formData: any) => {
    const [data, err] = await updateRealmProfile(String(realm.id), formData as RealmProfile);
    if (!err) {
      onUpdate(data as RealmProfile);

      alert.show({
        variant: 'success',
        fadeOut: 2500,
        closable: true,
        content: 'Realm profile has been updated successfully',
      });
    }
  };

  const isAdmin = currentUser?.client_roles?.includes('sso-admin');
  const isPO = currentUser?.idir_username.toLowerCase() === realm?.productOwnerIdirUserId.toLowerCase();
  let role = RoleEnum.TECHNICAL_LEAD;
  if (isAdmin) role = RoleEnum.ADMIN;
  else if (isPO) role = RoleEnum.PRODUCT_OWNER;

  if (!realm) return null;

  return (
    <>
      <h2>Realm Name: {realm.realm}</h2>
      <RealmForm
        collapse={true}
        formData={formData}
        setFormData={setFormData}
        onSubmit={onSubmit}
        validationSchema={getUpdateRealmSchemaByRole(role)}
      />
    </>
  );
}

export default withBottomAlert(RealmTable);
