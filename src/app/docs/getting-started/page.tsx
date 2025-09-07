'use client';

import React from 'react';
import { CodeBlock } from '../_components/CodeBlock';
import { Image } from '@/components/ui';

export default function GettingStartedPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Get started</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Quick start</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Add Clarity to Slack, then try a command.</p>

      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/complete_onboarding_prompt.png" alt="Slack app welcome and quickstart view" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <h2 id="overview" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Overview</h2>
      <ol className="mb-8 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Install the app once; everyone can use it.</li>
        <li>Suggestions are private to you.</li>
        <li>Replace your message with one click.</li>
      </ol>
      <div className="mb-8">
        <CodeBlock label="Try in Slack" code={'/personalfeedback'} />
      </div>

      <h2 id="quick-setup" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Quick setup</h2>
      <ol className="mb-10 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Add to Slack → Authorize</li>
        <li>Type <code className="rounded bg-neutral-100 px-1 py-0.5">/personalfeedback</code> in any channel</li>
        <li>Try <code className="rounded bg-neutral-100 px-1 py-0.5">/rephrase</code> on your next message</li>
      </ol>

      <CodeBlock label="Commands" code={'/personalfeedback\n/rephrase Can you get this done ASAP?\n/settings'} />
    </main>
  );
}


