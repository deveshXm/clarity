import { TextInput as MantineTextInput, TextInputProps as MantineTextInputProps } from '@mantine/core';
import { forwardRef } from 'react';

export type TextInputProps = MantineTextInputProps;

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>((props, ref) => {
  return <MantineTextInput ref={ref} {...props} />;
});

TextInput.displayName = 'TextInput'; 