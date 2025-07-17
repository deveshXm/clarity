import { PropsWithChildren } from 'react';

export const metadata = {
  title: 'MarketingHub – AI Creatives for Marketers',
  description: 'Generate high-performing ad creatives in seconds with generative AI.',
};

export default function LandingLayout({ children }: PropsWithChildren) {
  return (
    <>
      <main>{children}</main>
    </>
  );
} 