import { Center as MantineCenter, CenterProps as MantineCenterProps } from '@mantine/core';
import { forwardRef } from 'react';

export type CenterProps = MantineCenterProps;

export const Center = forwardRef<HTMLDivElement, CenterProps>((props, ref) => {
  return <MantineCenter ref={ref} {...props} />;
});

Center.displayName = 'Center'; 