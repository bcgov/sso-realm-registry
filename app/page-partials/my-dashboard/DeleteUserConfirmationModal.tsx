import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import CenteredModal from 'components/CenteredModal';
import Button from '@button-inc/bcgov-theme/Button';
import Modal from '@button-inc/bcgov-theme/Modal';
import RadioGroup from 'components/RadioGroup';
import { answerSurvey } from 'services/survey';
import { ModalData } from 'types/realm-profile';

const JustifyContent = styled.div`
  display: flex;
  justify-content: space-between;
`;

interface Props {
  open: boolean;
  onChange: (val: boolean) => void;
}

function DeleteUserConfirmationModal({ open, onChange }: Props) {
  useEffect(() => {
    window.location.hash = open ? 'delete-user-confirmation' : '#';
  }, [open]);

  const handleCancel = async () => {
    onChange(false);
    window.location.hash = '#';
  };
  const handleDelete = async () => {
    onChange(true);
    window.location.hash = '#';
  };

  return (
    <CenteredModal id="delete-user-confirmation">
      <Modal.Header>Deleting IDIR User</Modal.Header>
      <Modal.Content>
        <p>You are deleting this user from a keycloak custom realm.</p>
        <JustifyContent>
          <Button type="submit" variant="primary-inverse" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" onClick={handleDelete}>
            Delete
          </Button>
        </JustifyContent>
      </Modal.Content>
    </CenteredModal>
  );
}

export default DeleteUserConfirmationModal;
