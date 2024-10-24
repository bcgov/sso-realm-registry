import React, { createContext } from 'react';

export interface ModalConfig {
  show: boolean;
  title: string;
  body: string | React.ReactNode;
  showConfirmButton?: boolean;
  showCancelButton?: boolean;
  onClose?: () => void;
  onConfirm?: () => Promise<void>;
}

export const ModalContext = createContext({
  modalConfig: {
    show: false,
    title: '',
    body: '',
  } as ModalConfig,
  setModalConfig: (config: ModalConfig) => {},
});
