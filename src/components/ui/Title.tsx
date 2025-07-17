import { Title as MantineTitle, TitleProps as MantineTitleProps } from '@mantine/core';
import { forwardRef } from 'react';

export type TitleProps = MantineTitleProps;

export const Title = forwardRef<HTMLHeadingElement, TitleProps>((props, ref) => {
  return <MantineTitle ref={ref} {...props} />;
});

Title.displayName = 'Title'; 