import { Stack } from '@mantine/core';
import { Skeleton } from './Skeleton';
import { forwardRef } from 'react';

export interface FormSkeletonProps {
  fields?: number;
  showButton?: boolean;
  gap?: string | number;
}

export const FormSkeleton = forwardRef<HTMLDivElement, FormSkeletonProps>(
  ({ fields = 3, showButton = true, gap = 'md' }, ref) => {
    return (
      <Stack ref={ref} gap={gap}>
        {Array.from({ length: fields }).map((_, index) => (
          <Stack key={index} gap="xs">
            <Skeleton height={20} width="30%" />
            <Skeleton height={40} />
          </Stack>
        ))}
        {showButton && <Skeleton height={40} width="40%" mt="md" />}
      </Stack>
    );
  }
);

FormSkeleton.displayName = 'FormSkeleton'; 