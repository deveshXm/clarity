'use client';

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Title, Button, Stack, Row, Center, Container, Text, Checkbox, SegmentedControl, Card, Skeleton } from '@/components/ui';
import { validateSlackUser, completeSlackOnboarding, getWorkspaceChannels } from '@/lib/server-actions';
import { SlackChannel } from '@/types';
import { gsap } from 'gsap';

type OnboardingStep = 'frequency' | 'channels';

interface SlackUser {
  _id: string;
  slackId: string;
  workspaceId: string;
  name: string;
  analysisFrequency: 'weekly' | 'monthly';
  hasCompletedOnboarding?: boolean;
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const outgoingRef = useRef<HTMLDivElement | null>(null);
  const incomingRef = useRef<HTMLDivElement | null>(null);
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
    // No next step; channels is last now
    completeOnboarding();
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

      // Prepare incoming panel (absolute overlay)
      gsap.set(inEl, {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%'
      });

      // Disable interaction during transition
      gsap.set(stageEl, { pointerEvents: 'none' });

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

  const renderChannelsStep = () => (
    <Stack gap="md" w="100%">
      <div
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
              <div key={idx} style={{ height: CHANNEL_ROW_HEIGHT, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Skeleton width={18} height={18} radius={4} />
                <Skeleton height={10} style={{ flex: 1 }} />
              </div>
            ))
          ) : (
            availableChannels.map((channel) => {
              const isSelected = selectedChannels.some(c => c.id === channel.id);
              return (
                <div key={channel.id} style={{ height: CHANNEL_ROW_HEIGHT, display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleChannelSelection(channel)}
                    label={`${channel.is_private ? '🔒' : '#'} ${channel.name}`}
                    styles={{ label: { whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' } }}
                  />
                </div>
              );
            })
          )}
        </Stack>
      </div>
    </Stack>
  );

  const stepMeta: Record<OnboardingStep, { title: string; subtitle?: string }> = {
    frequency: { title: 'Report frequency', subtitle: 'How often should we DM your report?' },
    channels: { title: 'Channels', subtitle: 'Choose channels to enable AI coaching' },
  };

  const goBack = () => {
    setError(null);
    if (currentStep === 'channels') startStepTransition('frequency');
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
  };

  const primaryButtonProps = () => {
    if (currentStep === 'frequency') return { label: 'Next', loading: isLoadingChannels } as const;
    return { label: 'Finish', loading: isCompletingSetup } as const;
  };

  // Helper to perform smooth right-to-left slide transition between steps
  function startStepTransition(nextStep: OnboardingStep) {
    if (nextStep === currentStep || isTransitioning) return;
    const order: Record<OnboardingStep, number> = { frequency: 0, channels: 1 };
    setDirection(order[nextStep] > order[currentStep] ? 'forward' : 'back');
    setOutgoingStep(currentStep);
    setIncomingStep(nextStep);
    setIsTransitioning(true);
  }


  // Panel renderer: header + step content + footer
  function renderPanel(step: OnboardingStep, disableButtons: boolean) {
    const label = step === 'channels' ? 'Finish' : 'Next';
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
        <div style={{ marginTop: 12 }}>
          {step === 'frequency' && renderFrequencyStep()}
          {step === 'channels' && renderChannelsStep()}
        </div>

        {error && (<Text size="sm" c="red" mt={12} ta="left">{error}</Text>)}

        {/* Footer */}
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
      </Card>
    );
  }

  return (
    <Container px={16} py={64} size="xs">
      <Stack
        gap={0}
        w="100%"
        style={{
          maxWidth: 480,
          position: 'relative',
          marginInline: 'auto',
          marginTop: 'clamp(48px, 20vh, 200px)'
        }}
      >
        {/* Stage: Header + Content + Footer animate together */}
        <div ref={stageRef} style={{ position: 'relative', overflow: 'hidden' }}>
            {!isTransitioning && (
            <div>{renderPanel(currentStep, false)}</div>
            )}

            {isTransitioning && (
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                {/* Outgoing stays in flow */}
              <div ref={outgoingRef}>{outgoingStep && renderPanel(outgoingStep, true)}</div>

                {/* Incoming absolute overlay */}
              <div ref={incomingRef}>{incomingStep && renderPanel(incomingStep, true)}</div>
              </div>
            )}
          </div>
        </Stack>
    </Container>
  );
} 