import React, { useState, useContext } from 'react';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { updateRealmProfile } from 'services/realm';
import { UserSession } from 'types/user-session';
import styled from 'styled-components';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';
import { RoleEnum } from 'utils/helpers';
import RealmForm from 'components/RealmForm';
import { getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { ModalContext } from 'context/modal';

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

function RealmTable({ alert, realm, currentUser, onUpdate, onCancel }: Props) {
  const [formData, setFormData] = useState(realm as CustomRealmFormData);
  const { setModalConfig } = useContext(ModalContext);

  const saveProfile = async (formData: any) => {
    const [data, err] = await updateRealmProfile(String(realm.id), formData as RealmProfile);
    if (!err) {
      onUpdate(data as RealmProfile);
      alert.show({
        variant: 'success',
        fadeOut: 2500,
        closable: true,
        content: 'Realm profile has been updated successfully',
      });
    } else {
      alert.show({
        variant: 'danger',
        fadeOut: 2500,
        closable: true,
        content: 'Network error while updating. Please try again.',
      });
    }
  };

  const onSubmit = async (formData: any) => {
    setModalConfig({
      show: true,
      title: `Update Realm Request`,
      body: `Are you sure you want to update request ${realm.id}?`,
      showCancelButton: true,
      showConfirmButton: true,
      onConfirm: () => saveProfile(formData),
    });
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
        updatedMessage={`Last Updated: ${new Date(realm?.updatedAt).toLocaleString()}`}
        onCancel={onCancel}
      />
    </>
  );
}

export default withBottomAlert(RealmTable);
