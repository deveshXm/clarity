'use client';

import React, { useEffect, useRef, useState } from 'react';
import DocsHeader from './_components/DocsHeader';
import DocsSidebar from './_components/DocsSidebar';
import { Link } from '@/components/ui';

export default function HelpLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [allowSidebarScroll, setAllowSidebarScroll] = useState<boolean>(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 4;
      setAllowSidebarScroll(isAtBottom);
    };

    // Initialize
    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll as EventListener);
  }, []);
  return (
    <div className="min-h-[100svh] bg-white text-neutral-900 flex flex-col">
      <DocsHeader />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 lg:grid-cols-[220px_minmax(0,1fr)] flex-1 min-h-0 lg:h-[calc(100vh-4.25rem)] lg:overflow-hidden">
        {/* Left nav */}
        <DocsSidebar scrollEnabled={allowSidebarScroll} />

        {/* Main content */}
        <div ref={contentRef} className="no-scrollbar min-w-0 lg:h-full lg:overflow-y-auto">
          {children}
        </div>

      </div>

      <footer className="mt-auto mb-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-2 py-4 text-xs text-slate-500 sm:flex-row">
          <div>© {new Date().getFullYear()} Clarity. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/app/help">Help</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}


