import styled from 'styled-components';
import Modal from 'react-bootstrap/Modal';

const CenteredModal = styled(Modal)`
  display: flex;
  align-items: center;

  & .modal-content {
    margin: auto;
  }

  z-index: 100;
`;

export default CenteredModal;
