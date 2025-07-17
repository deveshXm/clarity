import { Stack as MantineStack, StackProps as MantineStackProps } from '@mantine/core';
import { forwardRef } from 'react';

export type StackProps = MantineStackProps;

export const Stack = forwardRef<HTMLDivElement, StackProps>((props, ref) => {
  return <MantineStack ref={ref} {...props} />;
});

Stack.displayName = 'Stack'; 