'use client';

import { Box, BoxProps } from '@mantine/core';
import { forwardRef, useEffect, useState } from 'react';

export interface FadeInProps extends BoxProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
}

export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(
  ({ delay = 0, duration = 300, children, style, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delay);

      return () => clearTimeout(timer);
    }, [delay]);

    return (
      <Box
        ref={ref}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
          transition: `opacity ${duration}ms ease-in-out, transform ${duration}ms ease-in-out`,
          ...style,
        }}
        {...props}
      >
        {children}
      </Box>
    );
  }
);

FadeIn.displayName = 'FadeIn'; 