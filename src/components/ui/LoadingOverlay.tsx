import { LoadingOverlay as MantineLoadingOverlay, LoadingOverlayProps as MantineLoadingOverlayProps } from '@mantine/core';
import { forwardRef } from 'react';

export type LoadingOverlayProps = MantineLoadingOverlayProps;

export const LoadingOverlay = forwardRef<HTMLDivElement, LoadingOverlayProps>((props, ref) => {
  return <MantineLoadingOverlay ref={ref} {...props} />;
});

LoadingOverlay.displayName = 'LoadingOverlay'; 