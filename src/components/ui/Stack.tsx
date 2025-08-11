import { Group, Stack as MantineStack, StackProps as MantineStackProps, GroupProps } from '@mantine/core';
import { forwardRef } from 'react';

export type StackProps = MantineStackProps;

export const Stack = forwardRef<HTMLDivElement, StackProps>((props, ref) => {
  return <MantineStack ref={ref} {...props} />;
});

Stack.displayName = 'Stack'; 

// Lightweight horizontal stack helper using Mantine Group to avoid raw divs
export type RowProps = GroupProps;
export const Row = forwardRef<HTMLDivElement, RowProps>((props, ref) => {
  return <Group ref={ref} {...props} />;
});

Row.displayName = 'Row';