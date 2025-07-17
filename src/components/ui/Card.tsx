import { Card as MantineCard, CardProps as MantineCardProps } from '@mantine/core';
import { forwardRef } from 'react';

export type CardProps = MantineCardProps;

export const Card = forwardRef<HTMLDivElement, CardProps>((props, ref) => {
  return <MantineCard ref={ref} {...props} />;
});

Card.displayName = 'Card'; 