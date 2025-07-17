import { Button as MantineButton, ButtonProps as MantineButtonProps } from '@mantine/core';
import { forwardRef } from 'react';

export interface ButtonProps extends MantineButtonProps {
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return <MantineButton ref={ref} {...props} />;
});

Button.displayName = 'Button'; 