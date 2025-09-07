'use client';

import React from 'react';
import { Image } from '@/components/ui';

export default function TroubleshootingPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Reference</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Troubleshooting</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Solutions for common problems and FAQs.</p>

      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/status_command.png" alt="Troubleshooting overview with examples" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <h2 id="networking-issues" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Networking issues</h2>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">If suggestions never appear or commands feel slow:</p>
      <ol className="mb-8 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Check your internet connection and try again.</li>
        <li>Open Slack in a browser and try a command there.</li>
        <li>Ask your admin to confirm apps are allowed in your workspace.</li>
      </ol>

      <h2 id="resource-issues" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Resource issues</h2>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">If Slack feels slow after installing many apps:</p>
      <ol className="mb-8 list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Close unused Slack windows or heavy apps.</li>
        <li>Restart Slack to clear cached memory.</li>
        <li>Disable apps you no longer use.</li>
      </ol>

      <div className="mb-6 space-y-3">
        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Not seeing suggestions?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">Invite the app to your channel. In Slack, type <code className="rounded bg-neutral-100 px-1 py-0.5">/invite</code> and select the app.</div>
        </details>

        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Commands don&apos;t work?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">Type commands in the message box (starting with <code className="rounded bg-neutral-100 px-1 py-0.5">/</code>), not the thread title. Look for Slack&apos;s command autocomplete.</div>
        </details>

        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Didn&apos;t get a welcome message?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">Open the app in Slack and click &ldquo;Open in Slack&rdquo; again to complete setup. Then try <code className="rounded bg-neutral-100 px-1 py-0.5">/personalfeedback</code>.</div>
        </details>

        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Replace Message button missing?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">Try again within a few minutes of sending your message. Some workspaces limit message editing.</div>
        </details>
      </div>

      <h2 id="faqs" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">FAQs</h2>
      <div className="space-y-3">
        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Can others see my suggestions?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">No. They are private to you.</div>
        </details>
        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Do I need admin access?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">You only need permission to install apps and invite the bot to channels.</div>
        </details>
        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Can I turn off auto coaching?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">Yes. Use <code className="rounded bg-neutral-100 px-1 py-0.5">/settings</code> to disable it.</div>
        </details>
      </div>

      <div className="mt-8">
        <details className="rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Still stuck?</summary>
          <div className="mt-2 text-sm leading-loose text-[#3e3e3f]">Reinstall the app from Slack, then try <code className="rounded bg-neutral-100 px-1 py-0.5">/rephrase</code> in any channel where the app is invited.</div>
        </details>
      </div>
    </main>
  );
}


