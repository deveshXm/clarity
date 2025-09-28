'use client';

import React from 'react';
import { Image, Link, Text, Title } from '@/components/ui';

export default function NonAdminInstallGuide(): React.ReactElement {
  const base = '/non-admin-workspace-installation%20guidelines';
  const steps = [
    { file: 'step-01.jpeg', title: 'Open Slack App Directory', note: 'Search for “Clarity AI” and open the app page.' },
    { file: 'step-04.jpeg', title: 'Encountered “Not authorized” or admin required?', note: 'This means your workspace limits who can install apps.' },
    { file: 'step-04.jpeg', title: 'Request approval from an admin', note: 'Use the in‑Slack request button or share the app link with your admin.' },
    { file: 'step-05.jpeg', title: 'Explain why you need the app', note: 'Mention private coaching, no message storage, and productivity benefits.' },
    { file: 'step-06.jpeg', title: 'Check workspace settings', note: 'Admins can allow installing apps or enable specific approved apps.' },
    { file: 'step-07.jpeg', title: 'Allow apps from outside your org (admin)', note: 'If restricted, admins can permit vetted external apps.' },
    { file: 'step-08.jpeg', title: 'Approve the app in Admin Console (admin)', note: 'Add the app to the allowed list for your workspace.' },
    { file: 'step-09.jpeg', title: 'Re‑try “Add to Slack”', note: 'Once approved, the install button will proceed normally.' },
    { file: 'step-10.jpeg', title: 'Authorize permissions', note: 'Review scopes and click “Allow” to finish installation.' },
    { file: 'step-11.jpeg', title: 'You are all set', note: 'Run /personalfeedback or /rephrase in Slack to get started.' },
  ];

  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Troubleshooting</div>
      <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Install without admin access</h1>
      <p className="mb-6 text-sm leading-loose text-[#3e3e3f]">
        If you can&apos;t install apps in your Slack workspace, follow these steps. Share this page with your admin if needed.
      </p>

      <ol className="space-y-8">
        {steps.map((s, i) => (
          <li key={s.file} className="rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <Title order={3} size="h3" fw={800} style={{ fontSize: '20px', color: '#0F172A' }}>
                Step {i + 1}: {s.title}
              </Title>
              <Text size="sm" style={{ color: '#64748B' }}>#{String(i + 1).padStart(2, '0')}</Text>
            </div>
            <Image
              src={`${base}/${s.file}`}
              alt={`${s.title} — screenshot`}
              width={1600}
              height={900}
              className="h-auto w-full rounded-lg border border-neutral-200/60"
            />
            <p className="mt-3 text-sm leading-relaxed text-[#3e3e3f]">{s.note}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 rounded-lg border border-neutral-200/60 bg-white p-4">
        <Title order={4} size="h4" fw={800} style={{ fontSize: '18px', color: '#0F172A' }}>Next steps</Title>
        <ul className="mt-2 list-disc pl-5 text-sm leading-loose text-[#3e3e3f]">
          <li>Still blocked? Ask an admin to approve the app and allow installing external apps.</li>
          <li>No admin access at all? Try installing in a dev/sandbox workspace to evaluate first.</li>
          <li>Once installed, open Slack and run <code className="rounded bg-neutral-100 px-1 py-0.5">/personalfeedback</code> to begin.</li>
        </ul>
        <div className="mt-2 text-sm text-[#3e3e3f]">
          Return to the <Link href="/docs/getting-started">Quick start</Link> when installation is complete.
        </div>
      </div>
    </main>
  );
}


