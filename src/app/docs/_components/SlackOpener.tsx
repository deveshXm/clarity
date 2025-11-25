'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export function SlackOpener() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const openSlackTeamId = searchParams.get('openSlack');
  const processedRef = useRef(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (openSlackTeamId && !processedRef.current) {
      processedRef.current = true;
      
      // Try to open Slack automatically
      window.location.href = `slack://open?team=${openSlackTeamId}`;
      
      // Show button as fallback after a short delay
      const timer = setTimeout(() => {
        setShowButton(true);
      }, 1000);
      
      // Clean up URL param after a delay
      const cleanupTimer = setTimeout(() => {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.delete('openSlack');
        const newUrl = newParams.toString() ? `?${newParams.toString()}` : window.location.pathname;
        router.replace(newUrl, { scroll: false });
      }, 2000);
      
      return () => {
        clearTimeout(timer);
        clearTimeout(cleanupTimer);
      };
    }
  }, [openSlackTeamId, searchParams, router]);

  const handleOpenSlack = () => {
    if (openSlackTeamId) {
      window.location.href = `slack://open?team=${openSlackTeamId}`;
    }
  };

  if (!openSlackTeamId || !showButton) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-900">Setup complete! 🎉</p>
          <p className="text-sm text-blue-700">Click below to open Slack and start using Clarity.</p>
        </div>
        <button
          onClick={handleOpenSlack}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Open Slack
        </button>
      </div>
    </div>
  );
}
