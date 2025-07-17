import { Textarea as MantineTextarea, TextareaProps as MantineTextareaProps } from '@mantine/core';
import { forwardRef } from 'react';

export type TextareaProps = MantineTextareaProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => {
  return <MantineTextarea ref={ref} {...props} />;
});

Textarea.displayName = 'Textarea'; 