'use client';

import React, { Suspense } from 'react';
import { Link, Image } from '@/components/ui';
import { PostInstallBanner } from './_components/PostInstallBanner';
import {
  Rocket,
  MessageSquare,
  Zap,
  Shield,
  Wrench,
  ArrowUpRight,
} from 'lucide-react';

export default function HelpPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-12">
      <Suspense fallback={null}>
        <PostInstallBanner />
      </Suspense>
      <div className="mb-2 text-sm font-medium text-neutral-500">Get started</div>
      <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-neutral-900">Welcome</h1>
      <p className="mb-4 text-sm leading-loose text-[#3e3e3f]">Learn about Clarity and how to get started.</p>
      <p className="mb-8 text-sm leading-loose text-[#3e3e3f]">
        Clarity is a Slack assistant that helps you write clearer, kinder messages. Describe what you want to say, and
        it suggests a polished version you can send with confidence.
      </p>
      <div className="mb-10 rounded-xl border border-neutral-200/60 bg-white p-3 shadow-sm">
        <Image src="/app_image.png" alt="Clarity overview - Slack assistant for clearer communication" width={1200} height={720} className="h-auto w-full rounded-lg border border-neutral-200/60" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Link href="/docs/getting-started" className="group relative rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm transition-all hover:shadow hover:border-neutral-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200/60 bg-neutral-50">
              <Rocket size={18} className="text-neutral-800" />
            </div>
            <div className="ml-auto hidden text-neutral-400 group-hover:text-neutral-800 md:block">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="mb-1 text-sm font-semibold text-neutral-900">Get started</div>
          <p className="text-sm leading-loose text-neutral-600">Download, install, and start quickly.</p>
        </Link>

        <Link href="/docs/commands" className="group relative rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm transition-all hover:shadow hover:border-neutral-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200/60 bg-neutral-50">
              <MessageSquare size={18} className="text-neutral-800" />
            </div>
            <div className="ml-auto hidden text-neutral-400 group-hover:text-neutral-800 md:block">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="mb-1 text-sm font-semibold text-neutral-900">Commands</div>
          <p className="text-sm leading-loose text-neutral-600">Use quick actions in Slack.</p>
        </Link>

        <Link href="/docs/auto-coaching" className="group relative rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm transition-all hover:shadow hover:border-neutral-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200/60 bg-neutral-50">
              <Zap size={18} className="text-neutral-800" />
            </div>
            <div className="ml-auto hidden text-neutral-400 group-hover:text-neutral-800 md:block">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="mb-1 text-sm font-semibold text-neutral-900">Auto coaching</div>
          <p className="text-sm leading-loose text-neutral-600">How suggestions appear and work.</p>
        </Link>

        <Link href="/docs/privacy" className="group relative rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm transition-all hover:shadow hover:border-neutral-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200/60 bg-neutral-50">
              <Shield size={18} className="text-neutral-800" />
            </div>
            <div className="ml-auto hidden text-neutral-400 group-hover:text-neutral-800 md:block">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="mb-1 text-sm font-semibold text-neutral-900">Privacy</div>
          <p className="text-sm leading-loose text-neutral-600">How we handle your data.</p>
        </Link>

        <Link href="/docs/troubleshooting" className="group relative rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm transition-all hover:shadow hover:border-neutral-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200/60 bg-neutral-50">
              <Wrench size={18} className="text-neutral-800" />
            </div>
            <div className="ml-auto hidden text-neutral-400 group-hover:text-neutral-800 md:block">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="mb-1 text-sm font-semibold text-neutral-900">Troubleshooting</div>
          <p className="text-sm leading-loose text-neutral-600">Fix common issues quickly.</p>
        </Link>


      </div>
    </main>
  );
} 