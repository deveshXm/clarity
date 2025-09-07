'use client';

import React from 'react';
import { Image } from '@/components/ui';

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Reference</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Privacy &amp; security</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Your messages stay private. Feedback is visible only to you.</p>
      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/app_image.png" alt="Privacy and permissions overview" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <h2 id="data-policy" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Data policy</h2>
      <ol className="mb-8 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>We analyze text to suggest improvements.</li>
        <li>We don&apos;t keep your message content.</li>
        <li>We save only patterns to personalize tips.</li>
        <li>You can turn off coaching anytime.</li>
      </ol>
      <h3 id="permissions" className="mb-4 text-base font-semibold text-neutral-900">Permissions</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>See messages where the app is invited.</li>
        <li>Send private tips only you can see.</li>
        <li>Send you a direct message for reports.</li>
        <li>Use your profile to personalize messages.</li>
      </ol>
    </main>
  );
}


