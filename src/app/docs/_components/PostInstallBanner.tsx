'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, MessageSquare, Sparkles } from 'lucide-react';

export function PostInstallBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isInstalled = searchParams.get('installed') === 'true';
  const teamId = searchParams.get('openSlack');
  const botId = searchParams.get('botId');
  const processedRef = useRef(false);
  const [slackOpened, setSlackOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Build the Slack deep link - if we have botId, open the DM directly
  const getSlackDeepLink = () => {
    if (botId && teamId) {
      return `slack://user?team=${teamId}&id=${botId}`;
    }
    return teamId ? `slack://open?team=${teamId}` : null;
  };

  useEffect(() => {
    if (isInstalled && teamId && !processedRef.current) {
      processedRef.current = true;
      
      // Try to open Slack automatically after a brief delay
      const timer = setTimeout(() => {
        const deepLink = getSlackDeepLink();
        if (deepLink) {
          window.location.href = deepLink;
          setSlackOpened(true);
        }
      }, 800);
      
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstalled, teamId, botId]);

  const handleOpenSlack = () => {
    const deepLink = getSlackDeepLink();
    if (deepLink) {
      window.location.href = deepLink;
      setSlackOpened(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Clean up URL params
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete('installed');
    newParams.delete('openSlack');
    newParams.delete('botId');
    const newUrl = newParams.toString() ? `?${newParams.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  };

  if (!isInstalled || dismissed) {
    return null;
  }

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-sm">
      {/* Success header */}
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/50 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
          <CheckCircle2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-emerald-900">Installation successful!</h3>
          <p className="text-sm text-emerald-700">Clarity is now in your Slack workspace</p>
        </div>
      </div>

      {/* Main content */}
      <div className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
            <Sparkles className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h4 className="mb-1 font-medium text-neutral-900">Complete your setup in Slack</h4>
            <p className="text-sm leading-relaxed text-neutral-600">
              We sent you a welcome message with a <strong>&quot;Complete Setup&quot;</strong> button. 
              Click it to choose which channels you want Clarity to coach you in.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="mb-5 space-y-2 rounded-xl bg-neutral-50 p-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">1</span>
            <span className="text-neutral-700">Open Slack {botId ? '(opens Clarity DM directly)' : '(should open automatically)'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</span>
            <span className="text-neutral-700">Click <strong>&quot;✨ Complete Setup&quot;</strong> button in the message</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">3</span>
            <span className="text-neutral-700">Choose your channels and preferences</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenSlack}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow-md active:scale-[0.98]"
          >
            <MessageSquare className="h-4 w-4" />
            {slackOpened ? 'Open Slack Again' : 'Open Slack'}
          </button>
          
          {teamId && (
            <a
              href={`https://slack.com/app_redirect?team=${teamId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Open in browser
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          
          <button
            onClick={handleDismiss}
            className="ml-auto text-sm text-neutral-500 transition-colors hover:text-neutral-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
