import { Container as MantineContainer, ContainerProps as MantineContainerProps } from '@mantine/core';
import { forwardRef } from 'react';

export type ContainerProps = MantineContainerProps;

export const Container = forwardRef<HTMLDivElement, ContainerProps>((props, ref) => {
  return <MantineContainer ref={ref} {...props} />;
});

Container.displayName = 'Container'; 