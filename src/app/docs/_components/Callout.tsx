'use client';

import React from 'react';

type CalloutType = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<CalloutType, { bg: string; border: string }> = {
  info: { bg: 'bg-blue-50/30', border: 'border-blue-200/50' },
  success: { bg: 'bg-emerald-50/30', border: 'border-emerald-200/50' },
  warning: { bg: 'bg-amber-50/30', border: 'border-amber-200/50' },
  danger: { bg: 'bg-red-50/30', border: 'border-red-200/50' },
};

export function Callout({ type = 'info', title, children }: { type?: CalloutType; title?: string; children: React.ReactNode }): React.ReactElement {
  const s = styles[type];
  return (
    <div className={`not-prose ${s.bg} ${s.border} rounded-xl border p-4 md:p-5`}>
      {title ? <div className="mb-1 text-sm font-semibold text-neutral-900">{title}</div> : null}
      <div className="text-sm leading-loose text-[#3e3e3f]">{children}</div>
    </div>
  );
}


