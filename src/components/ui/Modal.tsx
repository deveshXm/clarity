import { Modal as MantineModal, ModalProps as MantineModalProps } from '@mantine/core';
import { forwardRef } from 'react';

export type ModalProps = MantineModalProps;

export const Modal = forwardRef<HTMLDivElement, ModalProps>((props, ref) => {
  return <MantineModal ref={ref} {...props} />;
});

Modal.displayName = 'Modal'; 