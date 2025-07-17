import { Text as MantineText, TextProps as MantineTextProps } from '@mantine/core';
import { forwardRef, ReactNode } from 'react';

export interface TextProps extends MantineTextProps {
  children?: ReactNode;
}

export const Text = forwardRef<HTMLParagraphElement, TextProps>((props, ref) => {
  return <MantineText ref={ref} {...props} />;
});

Text.displayName = 'Text'; 