'use client';

import React from 'react';
import { Image } from '@/components/ui';

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Reference</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Privacy &amp; security</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Clarity is completely private. Only you can see your coaching and feedback - your teammates never see anything.</p>
      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/app_image.png" alt="Privacy and permissions overview" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <h2 id="data-policy" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">How it works</h2>
      <ol className="mb-8 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>We analyze your messages to suggest improvements - just for you.</li>
        <li>We don&apos;t save your actual messages anywhere.</li>
        <li>We only remember patterns to give you better tips over time.</li>
        <li>You control everything and can turn off coaching anytime.</li>
      </ol>
      <h3 id="permissions" className="mb-4 text-base font-semibold text-neutral-900">What Clarity can do</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Read messages in channels where you invite the app.</li>
        <li>Send private suggestions that only you can see.</li>
        <li>Send you personal reports via direct message.</li>
        <li>Use your name to make messages feel personal.</li>
      </ol>
    </main>
  );
}


