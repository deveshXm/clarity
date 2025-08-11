'use client';

import React from 'react';
import { Link } from '@/components/ui';
import { usePathname } from 'next/navigation';
import { nav } from '../_data/nav';

export default function DocsSidebar({ scrollEnabled = false }: { scrollEnabled?: boolean }): React.ReactElement {
  const pathname = usePathname();

  return (
    <aside className={
      'hidden lg:block h-full w-56 pr-2 pt-12 ' +
      (scrollEnabled ? 'overflow-y-auto' : 'overflow-hidden')
    }>
      {nav.map((group) => (
        <div key={group.title} className="mb-4">
          <div className="px-2 pb-1 text-xs font-semibold tracking-wide text-neutral-500">
            {group.title}
          </div>
          <nav className="space-y-1">
            {group.items.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    'group block rounded-md px-2 py-1.5 text-sm transition-colors ' +
                    (isActive
                      ? 'bg-neutral-100 font-medium text-neutral-900'
                      : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900')
                  }
                >
                  <span className="relative inline-flex items-center">
                    <span
                      className={
                        'mr-2 h-3 w-0.5 rounded bg-neutral-200 transition-all group-hover:bg-neutral-400 ' +
                        (isActive ? 'h-4 bg-neutral-900' : '')
                      }
                    />
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}


