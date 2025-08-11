import { Button as MantineButton, ButtonProps as MantineButtonProps } from '@mantine/core';
import { forwardRef, MouseEventHandler } from 'react';

export interface ButtonProps extends MantineButtonProps {
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, onClick, ...rest }, ref) => {
  const shouldGradient = !variant || variant === 'filled' || variant === 'default';
  const mergedClassName = [className, 'btn-lift', shouldGradient ? 'btn-gradient' : '']
    .filter(Boolean)
    .join(' ');
  return <MantineButton ref={ref} className={mergedClassName} variant={variant} onClick={onClick} {...rest} />;
});

Button.displayName = 'Button'; 