import { createContext } from 'react';

export interface ModalConfig {
  show: boolean;
  title: string;
  body: string;
  showConfirmButton?: boolean;
  showCancelButton?: boolean;
  onConfirm?: () => Promise<void>;
}

export const ModalContext = createContext({
  modalConfig: {
    show: false,
    title: '',
    body: '',
  },
  setModalConfig: (config: ModalConfig) => {},
});
