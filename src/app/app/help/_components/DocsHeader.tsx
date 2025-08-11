'use client';

import React from 'react';
import { Link } from '@/components/ui';

export default function DocsHeader(): React.ReactElement {
  const siteUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || '/';
  return (
    <header className="sticky top-0 z-20 w-full border-b border-neutral-200/50 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link href={siteUrl} className="text-base font-semibold tracking-tight text-neutral-900 sm:text-lg">
          Clarity
        </Link>
        <div className="h-6 w-6" aria-hidden />
      </div>
    </header>
  );
}


