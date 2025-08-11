import {
  SegmentedControl as MantineSegmentedControl,
  SegmentedControlProps as MantineSegmentedControlProps,
} from '@mantine/core';
import { forwardRef } from 'react';

export type SegmentedControlProps = MantineSegmentedControlProps;

// Pill-shaped segmented control with light blue background inspired by landing gradient
export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ radius, styles, classNames, ...props }, ref) => {
    const computedStyles =
      styles ??
      ((theme: any, _params: any, _ctx: any) => ({
        root: {
          borderRadius: 9999,
          padding: 4,
          boxShadow: 'inset 0 1px 2px rgba(2,6,23,0.05)',
        },
        control: {
          borderRadius: 9999,
          transition: 'all 180ms ease',
        },
        label: {
          fontWeight: 600,
          color: '#0F172A',
        },
        indicator: {
          borderRadius: 9999,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 8px 20px rgba(96,165,250,0.25)',
        },
      }));

    return (
      <MantineSegmentedControl
        ref={ref}
        radius={radius ?? 'xl'}
        classNames={classNames}
        styles={computedStyles}
        {...props}
      />
    );
  }
);

SegmentedControl.displayName = 'SegmentedControl';
