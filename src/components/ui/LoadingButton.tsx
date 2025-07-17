import { Button, ButtonProps } from './Button';
import { Loader } from 'lucide-react';
import { forwardRef } from 'react';

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, loadingText, children, disabled, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        leftSection={loading ? <Loader size={16} className="animate-spin" /> : undefined}
        {...props}
      >
        {loading && loadingText ? loadingText : children}
      </Button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton'; 