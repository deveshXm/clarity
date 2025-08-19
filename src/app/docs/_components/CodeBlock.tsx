'use client';

import React, { useState } from 'react';

export function CodeBlock({ code, label }: { code: string; label?: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  return (
    <div className="not-prose my-6">
      {label ? <div className="mb-2 text-sm font-semibold text-[#3e3e3f]">{label}</div> : null}
      <div className="relative overflow-hidden rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy'}
          onClick={handleCopy}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200/60 bg-white text-xs text-neutral-600 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
          title={copied ? 'Copied' : 'Copy'}
        >
          {copied ? '✓' : '⧉'}
        </button>
        <pre className="overflow-x-auto text-sm leading-loose text-[#3e3e3f]"><code>{code}</code></pre>
      </div>
    </div>
  );
}


