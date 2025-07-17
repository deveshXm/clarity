import { Alert, AlertProps } from '@mantine/core';
import { CheckCircle } from 'lucide-react';
import { forwardRef } from 'react';

export interface SuccessMessageProps extends Omit<AlertProps, 'color' | 'icon'> {
  message: string;
  showIcon?: boolean;
}

export const SuccessMessage = forwardRef<HTMLDivElement, SuccessMessageProps>(
  ({ message, showIcon = true, ...props }, ref) => {
    return (
      <Alert
        ref={ref}
        color="green"
        icon={showIcon ? <CheckCircle size={16} /> : undefined}
        {...props}
      >
        {message}
      </Alert>
    );
  }
);

SuccessMessage.displayName = 'SuccessMessage'; 