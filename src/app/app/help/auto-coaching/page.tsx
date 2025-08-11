'use client';

import React from 'react';
import { Image } from '@/components/ui';

export default function RealtimePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Core</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Auto coaching</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Private suggestions appear after you send a message.</p>

      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/landing/temp.png" alt="Ephemeral suggestion preview in Slack" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <h2 id="how-it-works" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">How it works</h2>
      <ol className="mb-8 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Send your message as usual.</li>
        <li>Look for a private suggestion (only you can see it).</li>
        <li>Click Replace or Keep original. Done.</li>
      </ol>

      <h2 id="what-it-analyzes" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">What it analyzes</h2>
      <ol className="grid list-decimal grid-cols-1 gap-3 pl-5 text-sm leading-loose text-[#3e3e3f] sm:grid-cols-2">
        <li><strong>Pushiness:</strong> Overly aggressive or demanding language</li>
        <li><strong>Vagueness:</strong> Unclear or imprecise communication</li>
        <li><strong>Non-objective:</strong> Subjective opinions presented as facts</li>
        <li><strong>Circular:</strong> Repetitive or redundant messaging</li>
        <li><strong>Rudeness:</strong> Impolite or discourteous tone</li>
        <li><strong>Passive-aggressive:</strong> Indirect expression of negative feelings</li>
        <li><strong>Fake/Inauthentic:</strong> Insincere or overly positive tone</li>
        <li><strong>One-liner:</strong> Overly brief responses lacking context</li>
      </ol>
      
      <h2 id="settings" className="mb-4 mt-8 text-xl font-semibold leading-tight text-neutral-900">Auto coaching settings</h2>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">You can turn auto coaching on or off anytime using <code className="rounded bg-neutral-100 px-1 py-0.5">/settings</code> in Slack. When disabled, you can still use <code className="rounded bg-neutral-100 px-1 py-0.5">/rephrase</code> manually for specific messages.</p>
    </main>
  );
}


