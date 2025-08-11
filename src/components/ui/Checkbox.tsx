import { Checkbox as MantineCheckbox, CheckboxProps as MantineCheckboxProps } from '@mantine/core';
import { forwardRef } from 'react';

export type CheckboxProps = MantineCheckboxProps;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>((props, ref) => {
  return <MantineCheckbox ref={ref} {...props} />;
});

Checkbox.displayName = 'Checkbox';


