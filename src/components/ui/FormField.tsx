import { Stack, Text } from '@mantine/core';
import { ReactNode, forwardRef } from 'react';

export interface FormFieldProps {
  children: ReactNode;
  error?: string;
  label?: string;
  required?: boolean;
  description?: string;
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ children, error, label, required, description }, ref) => {
    return (
      <Stack ref={ref} gap="xs">
        {label && (
          <Text component="label" size="sm" fw={500}>
            {label}
            {required && (
              <Text component="span" c="red" ml={4}>
                *
              </Text>
            )}
          </Text>
        )}
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        {children}
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    );
  }
);

FormField.displayName = 'FormField'; 