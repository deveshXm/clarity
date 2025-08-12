'use client';

import React, { useEffect, useRef, useState } from 'react';
import DocsHeader from './_components/DocsHeader';
import DocsSidebar from './_components/DocsSidebar';
import { Link } from '@/components/ui';
import { X } from 'lucide-react';

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
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  return (
    <div className="min-h-[100svh] bg-white text-neutral-900 flex flex-col">
      <DocsHeader onOpenMobileNav={() => setMobileOpen(true)} />

      {/* Mobile drawer */}
      <div
        className={
          'fixed inset-0 z-30 lg:hidden ' +
          (mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')
        }
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className={
            'absolute inset-0 bg-black/10 transition-opacity ' +
            (mobileOpen ? 'opacity-100' : 'opacity-0')
          }
          onClick={() => setMobileOpen(false)}
        />
        {/* Panel */}
        <div
          className={
            'absolute left-0 top-0 h-full w-72 max-w-[85vw] border-r border-neutral-200 bg-white shadow-sm transition-transform duration-200 ease-out ' +
            (mobileOpen ? 'translate-x-0' : '-translate-x-full')
          }
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b border-neutral-200/70 px-3 py-3">
            <div className="text-sm font-semibold text-neutral-900">Help</div>
            <button
              type="button"
              aria-label="Close navigation menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200/70 text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100"
              onClick={() => setMobileOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="h-[calc(100%-44px)] overflow-y-auto p-2">
            {/* Reuse sidebar content */}
            <DocsSidebar
              scrollEnabled={true}
              variant="mobile"
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      </div>

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


