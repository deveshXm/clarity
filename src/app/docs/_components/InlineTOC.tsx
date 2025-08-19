'use client';

import React, { useEffect, useState } from 'react';

type TocItem = { id: string; text: string };

export default function InlineTOC(): React.ReactElement {
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    const headings = Array.from(document.querySelectorAll('main h2')) as HTMLHeadingElement[];
    setItems(headings.filter((h) => h.id).map((h) => ({ id: h.id, text: h.textContent || '' })));
  }, []);

  if (items.length === 0) return <div />;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-md border border-neutral-200/60 bg-white px-3 py-1 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            {item.text}
          </a>
        ))}
      </div>
    </div>
  );
}


