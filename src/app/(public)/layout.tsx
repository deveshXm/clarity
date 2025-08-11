import { PropsWithChildren } from 'react';
import { Manrope } from 'next/font/google';

export const metadata = {
  title: 'Clarity — Write better in Slack',
  description: 'Clarity gives private, real-time coaching to help you write clearer Slack messages.',
};

const manrope = Manrope({ subsets: ['latin'], display: 'swap' });

export default function LandingLayout({ children }: PropsWithChildren) {
  return (
    <div className={manrope.className}>
      <main style={{ backgroundColor: '#FAFAF9', minHeight: '100svh' }}>{children}</main>
    </div>
  );
} 