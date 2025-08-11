'use client';

import React from 'react';
import { CodeBlock } from '..//_components/CodeBlock';
import { Image } from '@/components/ui';

export default function CommandsPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Core</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Slash commands</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Type these in Slack. Suggestions are private to you.</p>
      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/landing/temp.png" alt="Slash commands in Slack message box" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>
      <div className="mb-8">
        <CodeBlock label="Try in Slack" code={'/rephrase Can you get this done ASAP?'} />
      </div>

      <h2 id="core-commands" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Core commands</h2>
      <div className="space-y-8">
        <div>
          <div className="mb-2 text-base font-semibold text-blue-700">/personalfeedback</div>
          <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Get personal feedback based on your recent messages.</p>
          <CodeBlock label="Usage" code={'/personalfeedback'} />
        </div>
        <div>
          <div className="mb-2 text-base font-semibold text-blue-700">/rephrase [message]</div>
          <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Get a kinder, clearer version of your message.</p>
          <CodeBlock label="Usage" code={'/rephrase Can you get this done ASAP?'} />
        </div>
        <div>
          <div className="mb-2 text-base font-semibold text-blue-700">/settings</div>
          <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Opens a settings modal to change report frequency and auto‑coaching preferences.</p>
          <div className="mb-4 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
            <Image src="/landing/temp.png" alt="Settings modal showing report frequency and auto coaching options" width={600} height={400} className="h-auto w-full rounded-lg border border-neutral-200/60" />
          </div>
          <CodeBlock label="Usage" code={'/settings'} />
        </div>
      </div>
    </main>
  );
}


