import NextLink, { LinkProps as NextLinkProps } from 'next/link';
import { forwardRef, ReactNode, AnchorHTMLAttributes } from 'react';

type AnchorExtras = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children' | 'className' | 'ref'>;

export interface LinkProps extends Omit<NextLinkProps, 'prefetch'>, AnchorExtras {
  children: ReactNode;
  className?: string;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => {
  return <NextLink ref={ref} prefetch={false} {...props} />;
});

Link.displayName = 'Link'; 