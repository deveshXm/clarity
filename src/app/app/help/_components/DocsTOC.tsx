'use client';

import React, { useEffect, useState } from 'react';

type TocItem = { id: string; text: string; level: 2 | 3 };

export default function DocsTOC(): React.ReactElement {
  const [toc, setToc] = useState<TocItem[]>([]);

  useEffect(() => {
    const headings = Array.from(document.querySelectorAll('main h2, main h3')) as HTMLHeadingElement[];
    const items: TocItem[] = headings
      .filter((el) => !!el.id)
      .map((el) => ({ id: el.id, text: el.textContent || '', level: (el.tagName === 'H2' ? 2 : 3) as 2 | 3 }));
    setToc(items);
  }, []);

  if (toc.length === 0) return <aside className="hidden xl:block w-56" />;

  return (
    <aside className="hidden xl:block sticky top-[4.25rem] h-[calc(100vh-4.25rem)] w-56 overflow-auto pl-2">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">On this page</div>
      <nav className="space-y-1">
        {toc.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={
              'block rounded-md px-2 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-neutral-900 ' +
              (item.level === 3 ? 'ml-3' : '')
            }
          >
            {item.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}


