import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faClose } from '@fortawesome/free-solid-svg-icons';
import { ModalConfig } from 'context/modal';
import Button from '@button-inc/bcgov-theme/Button';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import { useState } from 'react';

const Modal = styled.div`
  position: fixed;
  z-index: 10;
  top: 0;
  left: 0;

  .background {
    background-color: #dadada;
    opacity: 0.6;
    height: 100vh;
    width: 100vw;
  }

  .content {
    position: absolute;
    display: block;
    left: 50%;
    top: 50%;
    width: 35em;
    transform: translate(-50%, -50%);
    background: white;

    border-radius: 0.5rem 0.5rem 0 0;
    box-shadow: rgba(0, 0, 0, 0.15) -2px 2px 2.5px;

    .header-text {
      margin-left: 1em;
    }

    .header {
      background-color: #38598a;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      height: 3em;
      padding: 1rem;

      align-items: center;
      color: white;
      font-weight: bold;
      font-size: 1.2rem;

      p {
        padding: 0;
        margin: 0;
      }
      .exit {
        cursor: pointer;
      }
    }
    .body {
      padding: 1rem;
    }

    .button-container {
      width: 100%;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      margin-top: 2em;

      button {
        width: 10em;
      }
    }
  }
`;

interface Props {
  modalConfig: ModalConfig;
  setModalConfig: (config: ModalConfig) => void;
}

export default function GlobalModal({ setModalConfig, modalConfig }: Props) {
  const clearModal = () => setModalConfig({ ...modalConfig, show: false });
  const [waiting, setWaiting] = useState(false);
  const { showCancelButton, showConfirmButton, onConfirm } = modalConfig;
  const hasButtons = showCancelButton || showConfirmButton;

  const onConfirmClick = async () => {
    if (!onConfirm) return;
    setWaiting(true);
    try {
      await onConfirm();
    } catch (e) {
    } finally {
      setWaiting(false);
      clearModal();
    }
  };

  return (
    <Modal>
      <div className="background" onClick={clearModal} />
      <div className="content">
        <div className="header">
          <div>
            <FontAwesomeIcon icon={faCheckCircle} size="lg" />
            <span className="header-text">{modalConfig.title}</span>
          </div>
          <FontAwesomeIcon icon={faClose} className="exit" size="lg" onClick={clearModal} />
        </div>
        <div className="body">
          {modalConfig.body}
          {hasButtons && (
            <div className="button-container">
              {/* Include empty span if missing for layout purposes */}
              {showCancelButton ? (
                <Button variant="secondary" onClick={clearModal}>
                  Cancel
                </Button>
              ) : (
                <span />
              )}
              {showConfirmButton && (
                <Button onClick={onConfirmClick}>
                  {waiting ? <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" /> : 'Confirm'}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
