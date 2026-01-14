'use client';

import { useState, useRef, useLayoutEffect } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';

import { getSlackOAuthUrl } from '@/lib/server-actions';
import { Card, Container, Link, Stack, Text, Title, Button } from '@/components/ui';
import { SUBSCRIPTION_TIERS } from '@/types';
// PostHog autocapture handles all frontend tracking automatically
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
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen text-slate-900 bg-white">
        {/* Header */}
        <header className="flex justify-between items-center p-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-500 via-red-500 to-amber-500 text-white text-xl font-bold shadow-lg">
              ✨
            </span>
            <Title order={1} style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>Clarity</Title>
          </div>
          <Button 
            onClick={handleInstallSlack} 
            loading={isLoading}
            styles={{
              root: {
                borderRadius: 16,
                paddingLeft: 24,
                paddingRight: 24,
                paddingTop: 8,
                paddingBottom: 8,
              }
            }}
          >
            Add to Slack
          </Button>
        </header>

        {/* Hero Section - Two Column Layout */}
        <section className="min-h-[85vh] flex items-center">
          <div className="max-w-7xl mx-auto w-full px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Column - Text Content on White Background */}
              <div className="bg-white py-12">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-8"
                  style={{ color: '#0F172A', lineHeight: '1.1' }}
                >
                  Write in a way that feels
                  <span className="block bg-gradient-to-r from-orange-500 via-red-500 to-amber-500 bg-clip-text text-transparent mt-2">
                    kind, clear & connected.
                  </span>
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-xl md:text-2xl mb-10 leading-relaxed"
                  style={{ color: '#1E293B', fontWeight: 500 }}
                >
                  When teams communicate with clarity and kindness, beautiful things happen. Clarity helps you build that kind of workplace — where every message strengthens relationships instead of creating friction.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="flex flex-wrap items-center gap-4 mb-10"
                >
                  <CTAButton onClick={handleInstallSlack} loading={isLoading} className="flex items-center gap-2 text-lg px-8 py-4">
                    Start improving
                    <ArrowRight className="w-5 h-5" />
                  </CTAButton>
                  <p className="text-base" style={{ color: '#64748B', fontWeight: 500 }}>
                    Only you see the coaching. Your messages stay private.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="flex flex-wrap gap-4 text-base"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 border border-gray-200">
                    <span className="h-3 w-3 rounded-full bg-orange-500" />
                    <span style={{ color: '#1E293B', fontWeight: 500 }}>Fewer misunderstandings</span>
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 border border-gray-200">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span style={{ color: '#1E293B', fontWeight: 500 }}>Softer tone, same honesty</span>
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 border border-gray-200">
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    <span style={{ color: '#1E293B', fontWeight: 500 }}>Better relationships at work</span>
                  </span>
                </motion.div>
              </div>

              {/* Right Column - Image */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="relative h-full min-h-[600px] lg:min-h-[700px] rounded-2xl overflow-hidden shadow-2xl"
              >
                <Image
                  src="/Background Image Clarity.png"
                  alt="Collaborative workspace"
                  fill
                  priority
                  className="object-cover"
                  style={{ objectPosition: 'center center' }}
                  quality={100}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Rest of page with clean white background */}
        <div className="relative z-10 bg-white">
          <main className="max-w-6xl mx-auto px-6 pt-20 pb-32">
          {/* FEATURE CARDS */}
          <section className="grid md:grid-cols-3 gap-10 mb-32">
            {/* Auto-coaching Feature */}
            <Card 
              shadow="sm" 
              radius="xl" 
              p="lg"
              style={{ 
                border: '1px solid rgba(0, 0, 0, 0.05)',
                background: '#FFFFFF'
              }}
            >
              <Title order={3} size="h3" fw={600} style={{ fontSize: '20px', marginBottom: '12px', color: '#0F172A' }}>
                Rewrite with confidence
              </Title>
              <Text size="sm" style={{ color: '#475569', marginBottom: '12px' }}>
                Get a kinder, clearer rewrite of any message in one click — while keeping your own
                voice.
              </Text>
              <Text size="xs" style={{ 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: '#EA580C',
                fontWeight: 600
              }}>
                Private coaching only you can see
              </Text>
            </Card>

            {/* Rephrase Feature */}
            <Card 
              shadow="sm" 
              radius="xl" 
              p="lg"
              style={{ 
                border: '1px solid rgba(0, 0, 0, 0.05)',
                background: '#FFFFFF'
              }}
            >
              <Title order={3} size="h3" fw={600} style={{ fontSize: '20px', marginBottom: '12px', color: '#0F172A' }}>
                Defuse tension, keep truth
              </Title>
              <Text size="sm" style={{ color: '#475569', marginBottom: '12px' }}>
                Clarity flags phrases that might land as rude, dismissive or passive aggressive and
                suggests softer alternatives.
              </Text>
              <Text size="xs" style={{ 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: '#DC2626',
                fontWeight: 600
              }}>
                Honest, not harsh
              </Text>
            </Card>

            {/* Custom Coaching Feature */}
            <Card 
              shadow="sm" 
              radius="xl" 
              p="lg"
              style={{ 
                border: '1px solid rgba(0, 0, 0, 0.05)',
                background: '#FFFFFF'
              }}
            >
              <Title order={3} size="h3" fw={600} style={{ fontSize: '20px', marginBottom: '12px', color: '#0F172A' }}>
                Personalized coaching focus
              </Title>
              <Text size="sm" style={{ color: '#475569', marginBottom: '12px' }}>
                Choose what matters to you. Customize which communication patterns Clarity helps you
                improve—from tone to clarity to collaboration style.
              </Text>
              <Text size="xs" style={{ 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                color: '#F59E0B',
                fontWeight: 600
              }}>
                Your coaching, your way
              </Text>
            </Card>
          </section>

          {/* SEE CLARITY IN ACTION - 3 KEY FEATURES */}
          <section className="mb-24 max-w-6xl mx-auto">
            <div className="mb-16 text-center">
              <Title order={2} size="h2" fw={900} style={{ fontSize: 'clamp(32px, 5vw, 48px)', marginBottom: '12px', color: '#0F172A' }}>
                See Clarity in action
              </Title>
            </div>

            <div className="space-y-32">
              {/* Feature 1: Auto rephrase messages */}
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="flex flex-col lg:flex-row items-center gap-12"
              >
                <div className="flex-1 w-full">
                  <div className="rounded-xl overflow-hidden shadow-2xl">
                    <div className="rounded-t-xl p-6" style={{ background: '#0F172A', color: '#F1F5F9' }}>
                      <div className="rounded-lg p-4 text-sm" style={{ background: '#1E293B' }}>
                        <p className="mb-3" style={{ color: '#CBD5E1' }}>dhruv · 12:56</p>
                        <p className="rounded-lg px-4 py-3 inline-block text-base" style={{ background: '#334155' }}>
                          Devesh, honestly I think you don&apos;t know what you are talking about
                        </p>
                      </div>
                    </div>
                    <div className="rounded-b-xl p-6" style={{ background: '#F8FAFC', color: '#0F172A' }}>
                      <p className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: '#E11D48' }}>
                        I noticed your message could be improved for <span className="font-bold">rudeness</span>.
                      </p>
                      <Text size="sm" style={{ marginBottom: '16px', color: '#334155' }}>
                        Message directly attacks Devesh&apos;s competence (&quot;you don&apos;t know what you are talking about&quot;), which is insulting and unprofessional.
                      </Text>
                      <p className="text-sm font-semibold mb-2" style={{ color: '#64748B' }}>✨ Improved:</p>
                      <p className="rounded-lg px-4 py-3 text-base mb-4" style={{ background: '#D1FAE5', color: '#065F46' }}>
                        &quot;Devesh, I don&apos;t think that&apos;s correct — can you walk me through your reasoning?&quot;
                      </p>
                      <ul className="text-sm space-y-2 list-disc list-inside" style={{ color: '#64748B' }}>
                        <li>Removes the personal attack and focuses on the idea.</li>
                        <li>Invites explanation instead of escalating the conflict.</li>
                        <li>Keeps the direct, casual tone you intended.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="flex-1 text-center lg:text-left">
                  <Title order={3} size="h3" fw={900} style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: '16px', color: '#0F172A' }}>
                    Auto rephrase messages just after being sent to avoid embarrassment
                  </Title>
                  <Text size="xl" className="leading-relaxed" style={{ color: '#334155', fontSize: 'clamp(18px, 2.5vw, 22px)' }}>
                    Build stronger relationships with every message. Clarity helps you communicate in ways that bring teams together instead of creating distance—all while keeping your authentic voice.
                  </Text>
                </div>
              </motion.div>

              {/* Feature 2: Check message before sending */}
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="flex flex-col lg:flex-row-reverse items-center gap-12"
              >
                <div className="flex-1 w-full">
                  <div className="rounded-xl overflow-hidden shadow-2xl">
                    <div className="rounded-t-xl p-6" style={{ background: '#0F172A', color: '#F1F5F9' }}>
                      <div className="rounded-lg p-4 text-sm" style={{ background: '#1E293B' }}>
                        <p className="mb-3" style={{ color: '#CBD5E1' }}>dhruv · 12:37</p>
                        <p className="rounded-lg px-4 py-3 inline-block text-base" style={{ background: '#334155' }}>
                          I really feel our product sucks. Can we have a chat urgently?
                        </p>
                      </div>
                    </div>
                    <div className="rounded-b-xl p-6" style={{ background: '#F8FAFC', color: '#0F172A' }}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-base">🔄</span>
                        <span className="text-base font-semibold" style={{ color: '#0F172A' }}>Message Improvement Suggestions</span>
                      </div>
                      <div className="mb-4">
                        <div className="text-sm font-semibold mb-2" style={{ color: '#64748B' }}>Original:</div>
                        <p className="rounded-lg px-4 py-3 text-base" style={{ background: '#E2E8F0', color: '#334155' }}>
                          &quot;I really feel our product sucks. Can we have a chat urgently?&quot;
                        </p>
                      </div>
                      <div className="mb-4">
                        <div className="text-sm font-semibold mb-2" style={{ color: '#64748B' }}>Improved:</div>
                        <p className="rounded-lg px-4 py-3 text-base" style={{ background: '#D1FAE5', color: '#065F46' }}>
                          &quot;Devesh - I&apos;m really concerned about the product quality right now. Can we have a quick, urgent chat to go over what&apos;s failing and what we can do to fix it?&quot;
                        </p>
                      </div>
                      <div className="text-sm" style={{ color: '#64748B' }}>
                        <span className="font-semibold">Tone:</span> professional
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 text-center lg:text-left">
                  <Title order={3} size="h3" fw={900} style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: '16px', color: '#0F172A' }}>
                    Check any message before you send it for optimal clarity
                  </Title>
                  <Text size="xl" className="leading-relaxed" style={{ color: '#334155', fontSize: 'clamp(18px, 2.5vw, 22px)' }}>
                    Send messages that build trust and understanding. Get real-time suggestions that help you express yourself clearly while maintaining genuine connection with your team.
                  </Text>
                </div>
              </motion.div>

              {/* Feature 3: Custom coaching flags */}
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="flex flex-col lg:flex-row items-center gap-12"
              >
                <div className="flex-1 w-full">
                  <div className="rounded-xl overflow-hidden shadow-2xl">
                    <div className="rounded-t-xl p-6" style={{ background: '#0F172A', color: '#F1F5F9' }}>
                      <div className="rounded-lg p-4 text-sm" style={{ background: '#1E293B' }}>
                        <p className="mb-3" style={{ color: '#CBD5E1' }}>Clarity Settings</p>
                        <p className="text-base font-semibold mb-3" style={{ color: '#F1F5F9' }}>
                          🎯 Coaching Focus (6/8 active)
                        </p>
                      </div>
                    </div>
                    <div className="rounded-b-xl p-6" style={{ background: '#F8FAFC', color: '#0F172A' }}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span style={{ color: '#22C55E' }}>✅</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Pushiness</p>
                            <p className="text-xs" style={{ color: '#64748B' }}>Overly aggressive or demanding tone</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span style={{ color: '#22C55E' }}>✅</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Vagueness</p>
                            <p className="text-xs" style={{ color: '#64748B' }}>Unclear or imprecise requests</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span style={{ color: '#22C55E' }}>✅</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Rudeness</p>
                            <p className="text-xs" style={{ color: '#64748B' }}>Impolite or discourteous communication</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 opacity-50">
                          <span>⬜</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>One-Liner</p>
                            <p className="text-xs" style={{ color: '#64748B' }}>Overly brief responses</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 text-center lg:text-left">
                  <Title order={3} size="h3" fw={900} style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: '16px', color: '#0F172A' }}>
                    Focus on what matters to you
                  </Title>
                  <Text size="xl" className="leading-relaxed" style={{ color: '#334155', fontSize: 'clamp(18px, 2.5vw, 22px)' }}>
                    Choose your coaching focus. Enable the flags that match your goals, disable what you&apos;ve mastered, and even create custom flags for patterns unique to your communication style.
                  </Text>
                </div>
              </motion.div>
            </div>
          </section>

          {/* COMING SOON */}
          <section className="max-w-6xl mx-auto mb-24">
            <div className="text-center mb-16">
              <Title order={2} size="h2" fw={900} style={{ fontSize: 'clamp(36px, 6vw, 48px)', marginBottom: '16px', color: '#0F172A' }}>
                Coming soon
              </Title>
              <Text size="xl" style={{ color: '#475569', fontSize: 'clamp(18px, 2.5vw, 24px)', marginBottom: '0' }}>
                More ways to keep conversations soft, honest and human — across your whole workspace.
              </Text>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                'Message editing and coaching directly in DMs.',
                'Workspace‑wide enablement — optional or default.',
                'Multi‑person thread coaching for sensitive, emotionally charged discussions.',
                'Support for workspaces you don\'t own.',
                'Official Slack Marketplace launch.'
              ].map((item, index) => (
                <Card
                  key={index}
                  shadow="lg"
                  radius="xl"
                  p="xl"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    minHeight: '140px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1">
                      <ArrowRight size={24} style={{ color: '#EA580C' }} />
                    </div>
                    <Text size="md" style={{ color: '#334155', fontSize: 'clamp(16px, 1.8vw, 18px)', lineHeight: 1.6 }}>
                      {item}
                    </Text>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* PRICING SECTION */}
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
              <Card 
                shadow="xl" 
                radius="xl" 
                p="xl" 
                className="flex flex-col"
                style={{
                  border: '2px solid #BFDBFE',
                  background: 'rgba(255, 255, 255, 0.9)'
                }}
                ref={freeCardRef}
              >
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
                      "20 auto-coaching suggestions/month",
                      "50 manual rephrase commands", 
                      "Default coaching flags",
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
              <Card 
                shadow="xl" 
                radius="xl" 
                p="xl" 
                className="flex flex-col" 
                style={{
                  background: 'linear-gradient(135deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)',
                  border: 'none'
                }}
                ref={proCardRef}
              >
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
                      "200 auto-coaching suggestions/month",
                      "200 rephrase commands/month",
                      "Custom coaching flags", 
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

          {/* FAQ Section */}
          <section className="mt-20">
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
                  a: "No, all coaching is private. All coaching feedback is private. Only you receive the messages in your DMs. Your team will not see your suggestions or insights."
                }
              ].map((faq, index) => (
                <Card 
                  key={index} 
                  shadow="sm" 
                  p="lg"
                  style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: 'none'
                  }}
                >
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
          </main>

          {/* Footer */}
          <footer className="mt-auto mb-4">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-2 py-4 text-xs sm:flex-row" style={{ color: '#64748B' }}>
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
      </div>
    </MotionConfig>
  );
}
