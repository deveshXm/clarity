'use client';

import Link from 'next/link';

export function Header() {
  return (
    // Centered, glassy pill navigation fixed near the top
    <header className="fixed left-1/2 top-6 z-50 -translate-x-1/2 pointer-events-none">
      {/*
        The inner wrapper receives pointer events so that the rest of the page still scrolls.
        It also has the rounded-full / glass / shadow aesthetic seen in the reference design.
      */}
      <div className="pointer-events-auto flex items-center gap-8 rounded-full border border-gray-200/70 bg-white/80 px-6 py-3 shadow-lg shadow-gray-300/50 backdrop-blur-md">
        {/* Brand */}
        <Link href="#" className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          {/* Square blue icon */}
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
            S
          </span>
          <span>SaaSwiftie</span>
        </Link>

        {/* Primary navigation – hidden on small screens */}
        <nav className="hidden items-center gap-8 md:flex">
          {[
            { href: '#', label: 'About' },
            { href: '#', label: 'Solution' },
            { href: '#', label: 'Pricing' },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Call-to-action */}
        <Link
          href="#"
          className="rounded-full bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(59,130,246,0.35)] transition-transform hover:scale-105 active:scale-100"
        >
          Buy Template
        </Link>
      </div>
    </header>
  );
} 