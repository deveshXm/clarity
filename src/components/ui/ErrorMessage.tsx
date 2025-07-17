import { Alert, AlertProps } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { forwardRef } from 'react';

export interface ErrorMessageProps extends Omit<AlertProps, 'color' | 'icon'> {
  message: string;
  showIcon?: boolean;
}

export const ErrorMessage = forwardRef<HTMLDivElement, ErrorMessageProps>(
  ({ message, showIcon = true, ...props }, ref) => {
    return (
      <Alert
        ref={ref}
        color="red"
        icon={showIcon ? <AlertCircle size={16} /> : undefined}
        {...props}
      >
        {message}
      </Alert>
    );
  }
);

ErrorMessage.displayName = 'ErrorMessage'; 