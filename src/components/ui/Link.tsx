import NextLink, { LinkProps as NextLinkProps } from 'next/link';
import { forwardRef, ReactNode } from 'react';

export interface LinkProps extends Omit<NextLinkProps, 'prefetch'> {
  children: ReactNode;
  className?: string;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => {
  return <NextLink ref={ref} prefetch={false} {...props} />;
});

Link.displayName = 'Link'; 