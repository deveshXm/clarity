'use client';

import React from 'react';
import { Link } from '@/components/ui';
import { Menu } from 'lucide-react';

type DocsHeaderProps = {
  onOpenMobileNav?: () => void;
};

export default function DocsHeader({ onOpenMobileNav }: DocsHeaderProps): React.ReactElement {
  const siteUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || '/';
  return (
    <header className="sticky top-0 z-20 w-full border-b border-neutral-200/50 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link href={siteUrl} className="text-base font-semibold tracking-tight text-neutral-900 sm:text-lg">
          Clarity
        </Link>
        {/* Mobile menu button */}
        <button
          type="button"
          aria-label="Open navigation menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200/70 text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 lg:hidden"
          onClick={() => onOpenMobileNav?.()}
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}


