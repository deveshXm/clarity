'use client';

import React from 'react';
import { Image } from '@/components/ui';

export default function ReportsPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <div className="mb-2 text-sm font-medium text-neutral-500">Core</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Reports</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Get a simple summary in Slack on a schedule you choose.</p>
      <div className="mb-8 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/weekly_report.png" alt="Report summary DM preview" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <h2 id="personal-reports" className="mb-4 text-xl font-semibold leading-tight text-neutral-900">Personal reports</h2>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">You receive a direct message with your highlights and tips.</p>
      
      <h3 className="mb-4 text-base font-semibold text-neutral-900">Report frequency</h3>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Choose between weekly or monthly reports. Change this anytime using <code className="rounded bg-neutral-100 px-1 py-0.5">/settings</code> in Slack.</p>
      
      <h3 className="mb-4 text-base font-semibold text-neutral-900">What&apos;s included</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-loose text-[#3e3e3f]">
        <li>Your recent strengths</li>
        <li>Top areas to improve</li>
        <li>Simple suggestions to try</li>
        <li>Progress over time</li>
      </ol>
    </main>
  );
}


