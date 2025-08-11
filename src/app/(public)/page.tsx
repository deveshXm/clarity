'use client';

import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';

import { Card, Container, Image, Link, Stack, Text, Title } from '@/components/ui';
import BackgroundMesh from './components/BackgroundMesh';
import FeatureScroller from './components/FeatureScroller';
import CTAButton from './components/CTAButton';

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const freeCardRef = useRef<HTMLDivElement | null>(null);
  const proCardRef = useRef<HTMLDivElement | null>(null);

  const demoVideoId = useMemo(() => process.env.NEXT_PUBLIC_DEMO_VIDEO_ID, []);

  const handleInstallSlack = async () => {
    setIsLoading(true);
    try {
      const { getSlackOAuthUrl } = await import('@/lib/server-actions');
      const slackOAuthUrl = await getSlackOAuthUrl();
      window.location.href = slackOAuthUrl;
    } catch (error) {
      console.error('Failed to get OAuth URL:', error);
      setIsLoading(false);
    }
  };

  // Equalize pricing card heights using the tallest card
  useLayoutEffect(() => {
    const updateHeights = () => {
      const freeEl = freeCardRef.current;
      const proEl = proCardRef.current;
      if (!freeEl || !proEl) return;

      // Reset to auto to measure true content heights
      freeEl.style.minHeight = 'auto';
      proEl.style.minHeight = 'auto';

      const freeH = freeEl.offsetHeight;
      const proH = proEl.offsetHeight;
      const maxH = Math.max(freeH, proH);

      freeEl.style.minHeight = `${maxH}px`;
      proEl.style.minHeight = `${maxH}px`;
    };

    updateHeights();
    window.addEventListener('resize', updateHeights, { passive: true });
    return () => window.removeEventListener('resize', updateHeights as EventListener);
  }, []);

  return (
    <div className="relative min-h-[100svh] overflow-hidden flex flex-col" style={{ backgroundColor: '#FAFAF9' }}>
      <BackgroundMesh />
      
      <div className="relative z-10 flex-1 flex flex-col">
      <Container size="lg" py={32}>
        {/* Hero */}
        <div className="mx-auto max-w-3xl px-2 pt-16 text-center md:pt-24">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Title order={1} size="h1" fw={900} style={{ color: '#0F172A', lineHeight: 1.05, fontSize: '44px' }}>
              <span className="brand-marker">Clarity</span> for Slack
            </Title>
            <Text size="xl" mt="md" style={{ color: '#334155', fontSize: '20px' }}>
              Write clearer messages, faster. Private coaching that fits your team&apos;s tone.
            </Text>
            <Stack gap="sm" mt="xl" align="center">
              <CTAButton onClick={handleInstallSlack} loading={isLoading}>Install Clarity</CTAButton>
              <Text size="sm" style={{ color: '#475569' }}>
                Privacy-first. Feedback is ephemeral and visible only to you.
              </Text>
            </Stack>
          </motion.div>
        </div>

        {/* See it in action */}
        <div className="mx-auto mt-16 max-w-5xl px-2">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <Card shadow="xl" radius="lg" p={0} style={{ backgroundColor: 'white', border: '1px solid rgba(2,6,23,0.06)' }}>
              <div className="relative overflow-hidden rounded-lg">
                {demoVideoId ? (
                  <LiteYouTubeEmbed id={demoVideoId} title="Clarity demo" rel="prefetch" poster="maxresdefault" />
                ) : (
                  <Image src="/landing/temp.png" alt="Clarity demo" width={1280} height={720} className="block w-full" />
                )}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* One-at-a-time feature with pinned panel and scroll-controlled swap */}
        <section aria-label="What Clarity does" className="mt-28">
          <FeatureScroller />
        </section>

        {/* Pricing with CTA - full screen section */}
        <section aria-label="Pricing" className="min-h-[100svh] flex flex-col items-center justify-center px-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <Title
              order={2}
              size="h2"
              fw={900}
              style={{ color: '#0F172A', fontSize: '36px', lineHeight: 1.1 }}
            >
              Ready to ship messages with clarity?
            </Title>
            <Text size="lg" mt="sm" style={{ color: '#475569', fontSize: '20px' }}>
              Add Clarity to Slack and level up your team&apos;s tone and focus in minutes.
            </Text>
            <Stack gap="sm" mt="xl" align="center">
              <CTAButton onClick={handleInstallSlack} loading={isLoading}>Add to Slack — It&apos;s free</CTAButton>
              <Text size="sm" style={{ color: '#64748B' }}>
                No setup hassle. Private, ephemeral feedback by default.
              </Text>
            </Stack>

            <div className="mt-16">
              <Title order={2} size="h2" fw={900} style={{ color: '#0F172A', fontSize: '36px' }}>
                Simple pricing
              </Title>
              <Text size="lg" mt="sm" style={{ color: '#475569', fontSize: '20px' }}>
                Start free, upgrade any time. No credit card required to try.
              </Text>
            </div>
          </motion.div>

          <div className="mt-10 flex flex-wrap items-stretch justify-center gap-6">
            {/* Free plan - slimmer card */}
            <Card
              shadow="xl"
              radius="lg"
              withBorder
              p={0}
              className="w-[320px] md:w-[360px] h-full"
              style={{
                backgroundColor: 'white',
                borderColor: 'rgba(2,6,23,0.05)',
                boxShadow: '0 8px 24px rgba(2,6,23,0.06)'
              }}
              ref={freeCardRef}
            >
              <div className="p-8 pb-12 h-full flex flex-col">
              <Stack gap="lg" className="flex-1">
                <div className="flex items-baseline justify-between">
                  <Title order={3} size="h3" fw={900} style={{ color: '#0F172A', fontSize: '26px' }}>Free</Title>
                  <div className="flex items-baseline gap-1">
                    <Title order={2} size="h2" fw={900} style={{ color: '#0F172A', fontSize: '30px' }}>$0</Title>
                    <Text size="sm" style={{ color: '#94A3B8', fontSize: '14px' }}>/ forever</Text>
                  </div>
                </div>
                <div className="space-y-2">
                  <Text size="sm" style={{ color: '#334155', fontSize: '18px' }}>
                    Quick start with core coaching.
                  </Text>
                  <div style={{ borderTop: '1px solid rgba(2,6,23,0.08)' }} />
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-base" style={{ color: '#0F172A' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Instant, private suggestions
                    </li>
                    <li className="flex items-center gap-2 text-base" style={{ color: '#0F172A' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M5 5L15 15" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                        <path d="M15 5L5 15" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Context-aware rephrase
                    </li>
                    <li className="flex items-center gap-2 text-base" style={{ color: '#0F172A' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      One‑tap message replace
                    </li>
                    <li className="flex items-center gap-2 text-base" style={{ color: '#0F172A' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Basic tone guardrails
                    </li>
                  </ul>
                </div>
              </Stack>
              </div>
            </Card>

            {/* Pro plan - highlighted as most popular */}
            <Card
              shadow="xl"
              radius="lg"
              p={0}
              className="w-[320px] md:w-[360px] h-full"
              style={{
                background: 'linear-gradient(92deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)',
              }}
              ref={proCardRef}
            >
              <div className="p-8 pb-12 h-full flex flex-col">
              <Stack gap="lg" className="flex-1">
                <div className="flex items-baseline justify-between">
                  <Title order={3} size="h3" fw={900} style={{ color: '#FFFFFF', fontSize: '26px' }}>Pro</Title>
                  <div className="flex items-baseline gap-1">
                    <Title order={2} size="h2" fw={900} style={{ color: '#FFFFFF', fontSize: '30px' }}>$4</Title>
                    <Text size="sm" style={{ color: 'rgba(255,255,255,0.95)', fontSize: '14px' }}>/ month</Text>
                  </div>
                </div>
                <div className="space-y-2">
                  <Text size="sm" style={{ color: 'rgba(255,255,255,0.95)', fontSize: '18px' }}>
                    Advanced, context-aware coaching.
                  </Text>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.25)' }} />
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-base" style={{ color: '#FFFFFF' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Instant, private suggestions
                    </li>
                    <li className="flex items-center gap-2 text-base" style={{ color: '#FFFFFF' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Context-aware rephrase
                    </li>
                    <li className="flex items-center gap-2 text-base" style={{ color: '#FFFFFF' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Weekly coaching reports
                    </li>
                    <li className="flex items-center gap-2 text-base" style={{ color: '#FFFFFF' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M7.5 13.5L4.5 10.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                        <path d="M7.5 13.5L15.5 5.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Priority insights & updates
                    </li>
                  </ul>
                </div>
              </Stack>
              <div
                className="mt-8 pointer-events-none w-full rounded-full py-3 text-sm font-extrabold tracking-wider text-white/95 text-center border border-white/60"
                style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.10))' }}
              >
                MOST POPULAR
              </div>
              </div>
            </Card>
          </div>

        </section>

        {/* End of guided features */}
      </Container>

      {/* Footer stuck to bottom of page */}
      <footer className="mt-auto mb-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-2 py-4 text-xs text-slate-500 sm:flex-row">
          <div>© {new Date().getFullYear()} Clarity. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/app/help">Help</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
      </div>

      {/* Styles moved to globals.css */}
    </div>
  );
}