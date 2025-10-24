'use client';

import { useState, useRef, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';

import { getSlackOAuthUrl } from '@/lib/server-actions';
import { Card, Container, Link, Stack, Text, Title, Button } from '@/components/ui';
import { SUBSCRIPTION_TIERS } from '@/types';
// PostHog autocapture handles all frontend tracking automatically
import BackgroundMesh from './components/BackgroundMesh';
import StaticFeatures from './components/StaticFeatures';
import CTAButton from './components/CTAButton';

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const freeCardRef = useRef<HTMLDivElement | null>(null);
  const proCardRef = useRef<HTMLDivElement | null>(null);
  // PostHog autocapture handles all tracking automatically

  // Note: Page views automatically tracked by PostHog autocapture

  const handleInstallSlack = async () => {
    // Note: Button clicks automatically tracked by PostHog autocapture
    
    setIsLoading(true);
    try {
      const slackOAuthUrl = await getSlackOAuthUrl();
      window.location.href = slackOAuthUrl;
    } catch (error) {
      // PostHog autocapture will track errors automatically
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
        {/* Enhanced Hero with Live Demo */}
        <div className="mx-auto max-w-4xl px-2 pt-16 text-center md:pt-24">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Title order={1} size="h1" fw={900} style={{ color: '#0F172A', lineHeight: 1.05, fontSize: '44px' }}>
              Write <span className="brand-marker">clearer messages</span> in Slack
            </Title>
            <Text size="xl" mt="md" style={{ color: '#334155', fontSize: '20px' }}>
              Get instant, private AI coaching that only you can see. No setup hassle.
            </Text>
            
            {/* Live Demo Preview hidden as requested */}
            
            <Stack gap="sm" mt="xl" align="center">
              <Text size="sm" className="rounded-full border border-neutral-200/70 px-3 py-1 bg-white/70" style={{ color: '#334155' }}>
                Don&apos;t have install permissions? <Link href="/docs/troubleshooting/non-admin-install" style={{ color: '#2563EB', textDecoration: 'underline', textUnderlineOffset: 2 }}>Follow this quick guide</Link>.
              </Text>
              <CTAButton onClick={handleInstallSlack} loading={isLoading}>
                Install Clarity AI — It&apos;s free
              </CTAButton>
              <Text size="sm" style={{ color: '#64748B' }}>
                ⚡ Works in 30 seconds • 🔒 Private to you only
              </Text>
            </Stack>
          </motion.div>
        </div>

        {/* Social Proof Section hidden as requested */}

        {/* Documentation button moved closer to FAQ section */}

        {/* Video section hidden as requested */}

        {/* Static features section - all 3 features visible at once */}
        <section aria-label="What Clarity does" className="mt-28">
          <StaticFeatures />
        </section>

        {/* Simplified Pricing Section */}
        <section className="mt-20">
          <div className="text-center mb-12">
            <Title order={2} size="h2" fw={900} style={{ color: '#0F172A', fontSize: '32px' }}>
              Start free, upgrade when ready
            </Title>
            <Text size="lg" style={{ color: '#475569' }}>
              No credit card required. Cancel anytime.
            </Text>
          </div>

          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
            {/* Free Plan - Emphasized */}
            <Card shadow="xl" radius="lg" p="xl" className="border-2 border-blue-200 flex flex-col">
              <div className="text-center flex-1 flex flex-col">
                <Title order={3} size="h3" fw={900} style={{ color: '#0F172A', fontSize: '28px' }}>
                  Start Free
                </Title>
                <div className="mt-2">
                  <span style={{ fontSize: '48px', fontWeight: 900, color: '#0F172A' }}>$0</span>
                  <span style={{ color: '#64748B' }}>/forever</span>
                </div>
                <Text size="sm" mt="sm" style={{ color: '#334155' }}>
                  Perfect for trying Clarity
                </Text>
                
                <div className="mt-6 space-y-3 flex-1">
                  {[
                    "50 auto-coaching suggestions/month",
                    "10 manual rephrase commands", 
                    "2 personal feedback reports",
                    "Basic tone improvements"
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      </div>
                      <Text size="sm" style={{ color: '#0F172A' }}>{feature}</Text>
                    </div>
                  ))}
                </div>
                
                <CTAButton onClick={handleInstallSlack} loading={isLoading} className="w-full mt-8">
                  Get Started Free
                </CTAButton>
              </div>
            </Card>

            {/* Pro Plan */}
            <Card shadow="xl" radius="lg" p="xl" className="flex flex-col" style={{
              background: 'linear-gradient(135deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)'
            }}>
              <div className="text-center text-white flex-1 flex flex-col">
                <Title order={3} size="h3" fw={900} style={{ fontSize: '28px' }}>
                  Pro
                </Title>
                <div className="mt-2">
                  <span style={{ fontSize: '48px', fontWeight: 900 }}>$4.99</span>
                  <span style={{ opacity: 0.9 }}>/month</span>
                </div>
                <Text size="sm" mt="sm" style={{ opacity: 0.9 }}>
                  For serious communicators
                </Text>
                
                <div className="mt-6 space-y-3 flex-1">
                  {[
                    "Unlimited auto-coaching",
                    "Unlimited rephrase commands",
                    "Unlimited personal feedback", 
                    "Weekly & monthly reports",
                    "Advanced AI reasoning"
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                      <Text size="sm">{feature}</Text>
                    </div>
                  ))}
                </div>
                
                <CTAButton 
                  className="w-full mt-8"
                  onClick={handleInstallSlack}
                  loading={isLoading}
                >
                  Get Started Free
                </CTAButton>
              </div>
            </Card>
          </div>
        </section>

        {/* Documentation button moved closer to FAQ section */}
        <motion.div 
          className="mx-auto mt-20 text-center"
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <CTAButton size="sm" onClick={() => { window.location.href = '/docs'; }}>
            Read Documentation
          </CTAButton>
        </motion.div>

        {/* FAQ Section */}
        <section className="mt-12">
          <div className="text-center mb-12">
            <Title order={2} size="h2" fw={900} style={{ color: '#0F172A', fontSize: '32px' }}>
              Frequently Asked Questions
            </Title>
          </div>
          
          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                q: "Is my data private?",
                a: "Yes! All feedback is private to you. We don't save your messages or share data with anyone."
              },
              {
                q: "How quickly does it work?", 
                a: "Installation takes 30 seconds. You'll get your first coaching suggestion within minutes."
              },
              {
                q: "Can I try it without commitment?",
                a: "Absolutely! Start with our free plan. No credit card required, cancel anytime."
              },
              {
                q: "Will my team know I'm using it?",
                a: "No, all coaching is private. Your team only sees your improved messages."
              }
            ].map((faq, index) => (
              <Card key={index} shadow="sm" p="lg">
                <Text size="lg" fw={600} style={{ color: '#0F172A' }} className="mb-2">
                  {faq.q}
                </Text>
                <Text size="sm" style={{ color: '#334155' }}>
                  {faq.a}
                </Text>
              </Card>
            ))}
          </div>
        </section>

        {/* End of guided features */}
      </Container>

      {/* Footer stuck to bottom of page */}
      <footer className="mt-auto mb-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-2 py-4 text-xs text-slate-500 sm:flex-row">
          <div>© {new Date().getFullYear()} Clarity. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/docs">Documentation</Link>
            <Link href="/contact-us">Contact</Link>
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