import { Skeleton as MantineSkeleton, SkeletonProps as MantineSkeletonProps } from '@mantine/core';
import { forwardRef } from 'react';

export type SkeletonProps = MantineSkeletonProps;

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>((props, ref) => {
  return <MantineSkeleton ref={ref} {...props} />;
});

Skeleton.displayName = 'Skeleton'; 