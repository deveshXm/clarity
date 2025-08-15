'use client';

import { useState, useTransition, useEffect, useRef, useLayoutEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Title, Button, Stack, Row, Center, Container, Text, Checkbox, SegmentedControl, Card, Skeleton } from '@/components/ui';
import { validateSlackUser, completeSlackOnboarding, getWorkspaceChannels } from '@/lib/server-actions';
import { SlackChannel, SUBSCRIPTION_TIERS } from '@/types';
import { gsap } from 'gsap';

type OnboardingStep = 'frequency' | 'channels' | 'payment';

interface SlackUser {
  _id: string;
  slackId: string;
  workspaceId: string;
  name: string;
  analysisFrequency: 'weekly' | 'monthly';
  hasCompletedOnboarding?: boolean;
  subscription?: {
    tier: 'FREE' | 'PRO';
    status: 'active' | 'cancelled' | 'past_due';
  };
}

export default function OnboardingForm() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('frequency');
  const [analysisFrequency, setAnalysisFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [availableChannels, setAvailableChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<SlackUser | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isCompletingSetup, startCompletingSetup] = useTransition();
  const [isValidating, setIsValidating] = useState(true);
  // Transition state (GSAP)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [outgoingStep, setOutgoingStep] = useState<OnboardingStep | null>(null);
  const [incomingStep, setIncomingStep] = useState<OnboardingStep | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [isMobile, setIsMobile] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const outgoingRef = useRef<HTMLDivElement | null>(null);
  const incomingRef = useRef<HTMLDivElement | null>(null);
  // Payment card height equalization
  const freeCardRef = useRef<HTMLDivElement | null>(null);
  const proCardRef = useRef<HTMLDivElement | null>(null);
  // Fixed rows logic for channels list
  const CHANNEL_ROW_HEIGHT = 44; // px
  const CHANNEL_VISIBLE_ROWS = 5;
  const CHANNEL_CONTAINER_HEIGHT = CHANNEL_ROW_HEIGHT * CHANNEL_VISIBLE_ROWS + 24; // + padding (12 top/bottom)
  
  const router = useRouter();
  const searchParams = useSearchParams();

  // Validate user and check onboarding status on component mount
  useEffect(() => {
    async function validateUser() {
      const slackUserId = searchParams.get('user');
      const teamId = searchParams.get('team');

      if (!slackUserId || !teamId) {
        console.log('Missing user or team parameters');
        router.replace('/app/help');
        return;
      }

      try {
        // Use server action instead of fetch
        const result = await validateSlackUser(slackUserId, teamId);

        if (result.error || !result.user) {
          console.log('User not found or invalid:', result.error);
          router.replace('/app/help');
          return;
        }

        // Check if onboarding already completed
        if (result.user.hasCompletedOnboarding) {
          console.log('Onboarding already completed');
          router.replace('/app/help');
          return;
        }

        // Set user data and initial frequency
        setUser(result.user);
        setAnalysisFrequency(result.user.analysisFrequency || 'weekly');
        setIsValidating(false);

      } catch (error) {
        console.error('Error validating user:', error);
        router.replace('/app/help');
      }
    }

    validateUser();
  }, [searchParams, router]);

  async function handleFrequencyNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoadingChannels(true);
    
    try {
      // Fetch workspace channels with team ID
      const teamId = searchParams.get('team');
      if (!teamId) {
        setError('Missing team information. Please try again.');
        return;
      }
      // Start showing the channels step immediately (button disabled) while API loads
      startStepTransition('channels');

      const result = await getWorkspaceChannels(teamId);
      if (result.success && result.channels) {
        setAvailableChannels(result.channels.filter(channel => !channel.is_archived));
      } else {
        setError(result.error || 'Failed to load channels. Please try again.');
      }
    } catch (err) {
      setError('Failed to load channels. Please try again.');
      console.error('Channel loading error:', err);
    } finally {
      setIsLoadingChannels(false);
    }
  }

  function handleChannelsNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    // Check if user already has PRO subscription - skip payment step
    const hasProSubscription = user?.subscription?.tier === 'PRO' && user?.subscription?.status === 'active';
    
    if (hasProSubscription) {
      // Skip payment step and complete onboarding directly
      completeOnboarding();
    } else {
      // Move to payment step for FREE users
      startStepTransition('payment');
    }
  }

  function completeOnboarding() {
    if (!user) return;

    startCompletingSetup(async () => {
      try {
        // Use server action instead of fetch
          const result = await completeSlackOnboarding(
            user.slackId,
            user.workspaceId,
            analysisFrequency,
            selectedChannels.length > 0 ? selectedChannels : undefined,
            undefined
          );

        if (result.error) {
          throw new Error(result.error);
        }

        console.log('Onboarding completed successfully');
        
        // Redirect to help page
        router.push('/app/help');
      } catch (err) {
        setError('Failed to complete setup. Please try again.');
        console.error('Onboarding error:', err);
      }
    });
  }

  function handleContinueWithFree() {
    // Complete onboarding with free plan
    completeOnboarding();
  }

  async function handleUpgradeToPro() {
    if (!user) return;
    
    try {
      // Create checkout session using the existing API endpoint
      const checkoutUrl = `/api/stripe/checkout?user=${encodeURIComponent(user._id)}`;
      window.location.href = checkoutUrl;
    } catch (error) {
      setError('Failed to start upgrade process. Please try again.');
      console.error('Upgrade error:', error);
    }
  }

  // Run GSAP animation when both panels are mounted (placed before any conditional returns to keep hook order stable)
  useEffect(() => {
    if (!isTransitioning || !outgoingRef.current || !incomingRef.current || !stageRef.current) return;

    const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReduced ? 0.25 : 0.45;
    const enterStart = direction === 'forward' ? 30 : -30;
    const exitShift = direction === 'forward' ? -20 : 20;
    const ease = 'power2.out';

    const ctx = gsap.context(() => {
      const outEl = outgoingRef.current!;
      const inEl = incomingRef.current!;
      const stageEl = stageRef.current!;

      // Disable interaction during transition
      gsap.set(stageEl, { pointerEvents: 'none' });

      // Panels remain in normal flow; container uses CSS grid to stack them

      const tl = gsap.timeline({ defaults: { duration, ease } });
      tl.set(inEl, { xPercent: enterStart, opacity: 0, filter: prefersReduced ? 'none' : 'blur(4px)' })
        .to(outEl, { xPercent: exitShift, opacity: 0, filter: prefersReduced ? 'none' : 'blur(4px)' }, 0)
        .to(inEl, { xPercent: 0, opacity: 1, filter: prefersReduced ? 'none' : 'blur(0px)' }, 0.05)
        .add(() => {
          // Swap panels
          setCurrentStep(prev => {
            return (incomingStep as OnboardingStep) || prev;
          });
          setIsTransitioning(false);
          setOutgoingStep(null);
          setIncomingStep(null);
          // Re-enable interaction
          gsap.set(stageEl, { pointerEvents: '' });
        });

      return () => {
        tl.kill();
      };
    }, stageRef);

    return () => ctx.revert();
  }, [isTransitioning, direction, incomingStep]);

  // Equalize payment card heights (match landing behavior)
  useLayoutEffect(() => {
    if (currentStep !== 'payment') return;

    const updateHeights = () => {
      const freeEl = freeCardRef.current;
      const proEl = proCardRef.current;
      if (!freeEl || !proEl) return;

      // On mobile, stack vertically and let heights be auto
      if (isMobile) {
        freeEl.style.minHeight = 'auto';
        proEl.style.minHeight = 'auto';
        return;
      }

      freeEl.style.minHeight = 'auto';
      proEl.style.minHeight = 'auto';

      const freeH = freeEl.offsetHeight;
      const proH = proEl.offsetHeight;
      const maxH = Math.max(freeH, proH);

      freeEl.style.minHeight = `${maxH}px`;
      proEl.style.minHeight = `${maxH}px`;
    };

    updateHeights();
    window.addEventListener('resize', updateHeights, { passive: true } as EventListenerOptions);
    return () => window.removeEventListener('resize', updateHeights as EventListener);
  }, [currentStep, isMobile]);

  // Responsive detection for mobile layouts
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in e ? e.matches : (e as MediaQueryList).matches;
      setIsMobile(matches);
    };
    handler(media);
    media.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => media.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  // Show loading while validating user (no cards, lightweight)
  if (isValidating) {
    return (
      <Container size="lg" py={64}>
        <Center h="70vh">
          <Text c="dimmed">Validating…</Text>
        </Center>
      </Container>
    );
  }

  // Don't render anything if user is null (will redirect)
  if (!user) {
    return null;
  }

  // Remove the FrequencySelector wrapper completely

  const renderFrequencyStep = () => (
    <Center>
      <SegmentedControl
        value={analysisFrequency}
        onChange={(v) => setAnalysisFrequency(v as 'weekly' | 'monthly')}
        transitionDuration={300}
        transitionTimingFunction="ease-in-out"
        data={[
          { label: 'Weekly', value: 'weekly' },
          { label: 'Monthly', value: 'monthly' },
        ]}
      />
    </Center>
  );

  // Invitations step removed

  const toggleChannelSelection = (channel: SlackChannel) => {
    setSelectedChannels(prev => {
      const isSelected = prev.some(c => c.id === channel.id);
      if (isSelected) {
        return prev.filter(c => c.id !== channel.id);
      } else {
        return [...prev, { id: channel.id, name: channel.name }];
      }
    });
  };

  const renderChannelsStep = () => {
    const hasProSubscription = user?.subscription?.tier === 'PRO' && user?.subscription?.status === 'active';
    
    return (
      <Stack gap="md" w="100%">
        {hasProSubscription && (
          <Card
            p="sm"
            style={{
              background: 'linear-gradient(92deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)',
              color: 'white',
              textAlign: 'center'
            }}
          >
            <Text size="sm" fw={600}>
              🎉 You already have a PRO subscription! Complete your setup below.
            </Text>
          </Card>
        )}
        
        <Stack
          style={{
            height: CHANNEL_CONTAINER_HEIGHT,
            minHeight: CHANNEL_CONTAINER_HEIGHT,
            maxHeight: CHANNEL_CONTAINER_HEIGHT,
            overflowY: 'auto',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.60)',
            border: '1px solid rgba(226,232,240,0.70)',
            padding: 12,
            boxSizing: 'border-box',
            flex: `0 0 ${CHANNEL_CONTAINER_HEIGHT}px`
          }}
        >
        <Stack gap={0}>
          {isLoadingChannels ? (
            Array.from({ length: CHANNEL_VISIBLE_ROWS }).map((_, idx) => (
              <Row key={idx} align="center" gap={8} style={{ height: CHANNEL_ROW_HEIGHT }}>
                <Skeleton width={18} height={18} radius={4} />
                <Skeleton height={10} style={{ flex: 1 }} />
              </Row>
            ))
          ) : (
            availableChannels.map((channel) => {
              const isSelected = selectedChannels.some(c => c.id === channel.id);
              return (
                <Row key={channel.id} align="center" style={{ height: CHANNEL_ROW_HEIGHT }}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleChannelSelection(channel)}
                    label={`${channel.is_private ? '🔒' : '#'} ${channel.name}`}
                    styles={{ label: { whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' } }}
                  />
                </Row>
              );
            })
          )}
        </Stack>
        </Stack>
      </Stack>
    );
  };

  const renderPaymentStep = () => (
    <Stack gap="lg" w="100%">
      {/* Pricing cards side by side (match landing style) */}
      <Row justify="center" gap={isMobile ? 12 : 24} wrap={isMobile ? 'wrap' : 'nowrap'} align="stretch" style={{ width: '100%' }}>
        {/* Free plan card */}
        <Card
          shadow="xl"
          radius="lg"
          withBorder
          p={0}
          style={{
            width: isMobile ? '100%' : 320,
            minWidth: isMobile ? '100%' : 300,
            maxWidth: isMobile ? '100%' : 320,
            backgroundColor: 'white',
            borderColor: 'rgba(2,6,23,0.05)',
            boxShadow: '0 8px 24px rgba(2,6,23,0.06)',
            flexShrink: 0
          }}
          ref={freeCardRef}
        >
          <Stack p={isMobile ? 20 : 24} gap={isMobile ? 'md' : 'lg'} style={{ height: '100%' }}>
            <Stack gap="lg" style={{ flex: 1 }}>
              <Row justify="space-between" align="baseline">
                <Title order={3} size="h3" fw={900} style={{ color: '#0F172A', fontSize: isMobile ? 22 : 26 }}>
                  {SUBSCRIPTION_TIERS.FREE.name}
                </Title>
                <Row align="baseline" gap={4}>
                  <Title order={2} size="h2" fw={900} style={{ color: '#0F172A', fontSize: isMobile ? 24 : 28 }}>
                    ${SUBSCRIPTION_TIERS.FREE.price}
                  </Title>
                  <Text size="sm" style={{ color: '#94A3B8', fontSize: 14 }}>{SUBSCRIPTION_TIERS.FREE.priceLabel}</Text>
                </Row>
              </Row>
              <Text size="sm" style={{ color: '#334155', fontSize: isMobile ? 15 : 16, marginBottom: 12 }}>
                {SUBSCRIPTION_TIERS.FREE.description}
              </Text>
              <Stack style={{ borderTop: '1px solid rgba(2,6,23,0.08)' }} />
              <Stack gap={8}>
                {SUBSCRIPTION_TIERS.FREE.displayFeatures.map((feature, index) => (
                  <Row key={index} align="center" gap={8} style={{ color: '#0F172A' }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M7.5 13.5L4.5 10.5" stroke={feature.included ? "#10B981" : "#EF4444"} strokeWidth="2" strokeLinecap="round" />
                      <path d="M7.5 13.5L15.5 5.5" stroke={feature.included ? "#10B981" : "#EF4444"} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <Text size="sm" style={{ color: '#0F172A' }}>
                      {feature.limitLabel}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Stack>
            <Button
              size="md"
              onClick={handleContinueWithFree}
              style={{
                marginTop: isMobile ? 16 : 24,
                backgroundColor: '#F8FAFC',
                color: '#334155',
                border: '1px solid #E2E8F0',
                fontWeight: 600
              }}
            >
              Continue with Free
            </Button>
          </Stack>
        </Card>

        {/* Pro plan card */}
        <Card
          shadow="xl"
          radius="lg"
          p={0}
          style={{
            width: isMobile ? '100%' : 320,
            minWidth: isMobile ? '100%' : 300,
            maxWidth: isMobile ? '100%' : 320,
            background: 'linear-gradient(92deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)',
            flexShrink: 0
          }}
          ref={proCardRef}
        >
          <Stack p={isMobile ? 20 : 24} gap={isMobile ? 'md' : 'lg'} style={{ height: '100%' }}>
            <Stack gap="lg" style={{ flex: 1 }}>
              <Row justify="space-between" align="baseline">
                <Title order={3} size="h3" fw={900} style={{ color: '#FFFFFF', fontSize: isMobile ? 22 : 26 }}>
                  {SUBSCRIPTION_TIERS.PRO.name}
                </Title>
                <Row align="baseline" gap={4}>
                  <Title order={2} size="h2" fw={900} style={{ color: '#FFFFFF', fontSize: isMobile ? 24 : 28 }}>
                    ${SUBSCRIPTION_TIERS.PRO.price}
                  </Title>
                  <Text size="sm" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>{SUBSCRIPTION_TIERS.PRO.priceLabel}</Text>
                </Row>
              </Row>
              <Text size="sm" style={{ color: 'rgba(255,255,255,0.95)', fontSize: isMobile ? 15 : 16, marginBottom: 12 }}>
                {SUBSCRIPTION_TIERS.PRO.description}
              </Text>
              <Stack style={{ borderTop: '1px solid rgba(255,255,255,0.25)' }} />
              <Stack gap={8}>
                {SUBSCRIPTION_TIERS.PRO.displayFeatures.map((feature, index) => (
                  <Row key={index} align="center" gap={8} style={{ color: '#FFFFFF' }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M7.5 13.5L4.5 10.5" stroke={feature.included ? "#FFFFFF" : "#EF4444"} strokeWidth="2" strokeLinecap="round" />
                      <path d="M7.5 13.5L15.5 5.5" stroke={feature.included ? "#FFFFFF" : "#EF4444"} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <Text size="sm" style={{ color: '#FFFFFF' }}>
                      {feature.limitLabel}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Stack>
            {/* Pro badge */}
            <Center
              style={{
                marginTop: isMobile ? 8 : 8,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.10))',
                color: 'rgba(255,255,255,0.95)',
                border: '1px solid rgba(255,255,255,0.6)',
                borderRadius: 999,
                width: '100%',
                padding: isMobile ? '10px 0' : '12px 0',
                fontWeight: 800,
                letterSpacing: 1
              }}
            >
              MOST POPULAR
            </Center>
            <Button
              size="md"
              onClick={handleUpgradeToPro}
              style={{
                marginTop: isMobile ? 12 : 16,
                background: 'rgba(255,255,255,0.2)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.3)',
                fontWeight: 800,
                backdropFilter: 'blur(10px)'
              }}
            >
              Upgrade to Pro
            </Button>
          </Stack>
        </Card>
      </Row>
    </Stack>
  );

  const stepMeta: Record<OnboardingStep, { title: string; subtitle?: string }> = {
    frequency: { title: 'Report frequency', subtitle: 'How often should we DM your report?' },
    channels: { title: 'Channels', subtitle: 'Choose channels to enable AI coaching' },
    payment: { title: 'Choose your plan', subtitle: 'Select the plan that works best for you' },
  };

  const goBack = () => {
    setError(null);
    if (currentStep === 'channels') startStepTransition('frequency');
    if (currentStep === 'payment') startStepTransition('channels');
  };

  const goNext = (e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) e.preventDefault();
    setError(null);
    if (currentStep === 'frequency') {
      // reuse existing loader
      void handleFrequencyNext(new Event('submit') as unknown as React.FormEvent);
    } else if (currentStep === 'channels') {
      void handleChannelsNext(new Event('submit') as unknown as React.FormEvent);
    }
    // Payment step doesn't have a "Next" button - it has specific plan buttons
  };



  // Helper to perform smooth right-to-left slide transition between steps
  function startStepTransition(nextStep: OnboardingStep) {
    if (nextStep === currentStep || isTransitioning) return;
    const order: Record<OnboardingStep, number> = { frequency: 0, channels: 1, payment: 2 };
    setDirection(order[nextStep] > order[currentStep] ? 'forward' : 'back');
    setOutgoingStep(currentStep);
    setIncomingStep(nextStep);
    setIsTransitioning(true);
  }


  // Panel renderer: header + step content + footer
  function renderPanel(step: OnboardingStep, disableButtons: boolean) {
    // Check if user has PRO subscription to determine button label
    const hasProSubscription = user?.subscription?.tier === 'PRO' && user?.subscription?.status === 'active';
    const label = step === 'channels' && hasProSubscription ? 'Complete Setup' : 'Next';
    const loading = disableButtons
      ? false
      : step === 'frequency'
        ? isLoadingChannels
        : isCompletingSetup;

    return (
      <Card
        withBorder={false}
        shadow="none"
        padding="lg"
        style={{ background: 'transparent', boxShadow: 'none', border: 'none' }}
      >
        {/* Animated header (title + subtitle) */}
        <Stack gap={4}>
          <Title order={2} size="h2" style={{ color: '#0F172A' }}>{stepMeta[step].title}</Title>
          {stepMeta[step].subtitle && (
            <Text size="sm" c="dimmed" mt={4}>{stepMeta[step].subtitle}</Text>
          )}
        </Stack>

        {/* Step body */}
        <Stack mt={12}>
          {step === 'frequency' && renderFrequencyStep()}
          {step === 'channels' && renderChannelsStep()}
          {step === 'payment' && renderPaymentStep()}
        </Stack>

        {error && (<Text size="sm" c="red" mt={12} ta="left">{error}</Text>)}

        {/* Footer - only show for non-payment steps */}
        {step !== 'payment' && (
          <Stack gap={0} pt={12}>
            <Row justify="space-between" align="center">
              <div>
                {step !== 'frequency' && (
                  <Button variant="subtle" size="sm" disabled={disableButtons} onClick={disableButtons ? undefined : goBack}>← Back</Button>
                )}
              </div>
              <div>
                <Button size="md" loading={loading} disabled={disableButtons || isTransitioning || (step === 'channels' && isLoadingChannels)} onClick={disableButtons ? undefined : goNext}>
                  {label}
                </Button>
              </div>
            </Row>
          </Stack>
        )}

        {/* Payment step back button - positioned differently */}
        {step === 'payment' && (
          <Center mt={24}>
            <Button variant="subtle" size="sm" disabled={disableButtons} onClick={disableButtons ? undefined : goBack}>← Back to channels</Button>
          </Center>
        )}
      </Card>
    );
  }

  return (
    <Container px={16} py={isMobile ? 24 : 64} size={isMobile ? 'xs' : 'md'}>
      <Stack
        gap={0}
        w="100%"
        style={{
          maxWidth: isMobile ? 420 : 768,
          position: 'relative',
          marginInline: 'auto',
          marginTop: isMobile ? 24 : 'clamp(48px, 20vh, 200px)'
        }}
      >
        {/* Stage: Header + Content + Footer animate together */}
        <div ref={stageRef} style={{ position: 'relative' }}>
            {!isTransitioning && (
            <div>{renderPanel(currentStep, false)}</div>
            )}

            {isTransitioning && (
              <div style={{ display: 'grid' }}>
                <div ref={outgoingRef} style={{ gridArea: '1 / 1' }}>{outgoingStep && renderPanel(outgoingStep, true)}</div>
                <div ref={incomingRef} style={{ gridArea: '1 / 1' }}>{incomingStep && renderPanel(incomingStep, true)}</div>
              </div>
            )}
          </div>
        </Stack>
    </Container>
  );
} 