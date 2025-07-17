import { Card, CardProps } from './Card';
import { forwardRef } from 'react';
import { Box } from '@mantine/core';

export interface AnimatedCardProps extends CardProps {
  hoverEffect?: boolean;
  clickEffect?: boolean;
}

export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ hoverEffect = true, clickEffect = true, children, style, ...props }, ref) => {
    return (
      <Box
        style={{
          transition: 'all 0.2s ease-in-out',
          ...(hoverEffect && {
            ':hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 25px rgba(0, 0, 0, 0.12)',
            },
          }),
          ...(clickEffect && {
            ':active': {
              transform: 'translateY(0px)',
            },
          }),
          ...style,
        }}
      >
        <Card ref={ref} {...props}>
          {children}
        </Card>
      </Box>
    );
  }
);

AnimatedCard.displayName = 'AnimatedCard'; 