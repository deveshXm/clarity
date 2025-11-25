'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Title, Button, Stack, Row, Center, Container, Text, Checkbox, SegmentedControl, Card, Skeleton, TextInput } from '@/components/ui';
import { validateSlackUser, completeSlackOnboarding, getWorkspaceChannels } from '@/lib/server-actions';
import { SlackChannel, SUBSCRIPTION_TIERS } from '@/types';
import { usePostHog } from '@/hooks/useAnalytics';

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
  const [analysisFrequency, setAnalysisFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [availableChannels, setAvailableChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<SlackUser | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isCompletingSetup, startCompletingSetup] = useTransition();
  const [isValidating, setIsValidating] = useState(true);
  const { identify } = usePostHog();
  const [isMobile, setIsMobile] = useState(false);

  // Fixed rows logic for channels list
  const CHANNEL_ROW_HEIGHT = 44; // px
  const CHANNEL_VISIBLE_ROWS = 5;
  const CHANNEL_CONTAINER_HEIGHT = CHANNEL_ROW_HEIGHT * CHANNEL_VISIBLE_ROWS + 24; // + padding (12 top/bottom)
  
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch channels logic
  async function fetchChannels(teamId: string) {
    setIsLoadingChannels(true);
    try {
      const result = await getWorkspaceChannels(teamId);
      if (result.success && result.channels) {
        // Filter out archived AND private channels
        setAvailableChannels(result.channels.filter(channel => 
          !channel.is_archived && !channel.is_private
        ));
      } else {
        console.error('Failed to load channels:', result.error);
      }
    } catch (err) {
      console.error('Channel loading error:', err);
    } finally {
      setIsLoadingChannels(false);
    }
  }

  // Validate user and check onboarding status on component mount
  useEffect(() => {
    async function validateUser() {
      const slackUserId = searchParams.get('user');
      const teamId = searchParams.get('team');

      if (!slackUserId || !teamId) {
        console.log('Missing user or team parameters');
        router.replace('/docs');
        return;
      }

      try {
        const result = await validateSlackUser(slackUserId, teamId);

        if (result.error || !result.user) {
          console.log('User not found or invalid:', result.error);
          router.replace('/docs');
          return;
        }

        if (result.user.hasCompletedOnboarding) {
          console.log('Onboarding already completed');
          router.replace('/docs');
          return;
        }

        setUser(result.user);
        setAnalysisFrequency(result.user.analysisFrequency || 'weekly');
        setIsValidating(false);

        identify(result.user.slackId, {
          name: result.user.name,
          slack_user_id: result.user.slackId,
          mongodb_id: result.user._id,
          workspace_id: result.user.workspaceId,
          subscription_tier: result.user.subscription?.tier || 'FREE',
        });

        // Fetch channels immediately after validation
        void fetchChannels(teamId);

      } catch (error) {
        console.error('Error validating user:', error);
        router.replace('/docs');
      }
    }

    validateUser();
  }, [searchParams, router, identify]);

  // Responsive detection for mobile layouts
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in e ? e.matches : (e as MediaQueryList).matches;
      setIsMobile(matches);
    };
    handler(media);
    media.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    // Initial check
    setIsMobile(media.matches);
    return () => media.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

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

  function validateForm(): boolean {
    setError(null);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!userEmail.trim()) {
      setError('Email address is required.');
      return false;
    }
    if (!emailRegex.test(userEmail.trim())) {
      setError('Please enter a valid email address.');
      return false;
    }
    return true;
  }

  function completeOnboarding() {
    if (!user) return;

    startCompletingSetup(async () => {
      try {
          const result = await completeSlackOnboarding(
            user.slackId,
            user.workspaceId,
            analysisFrequency,
            selectedChannels.length > 0 ? selectedChannels : undefined,
            undefined, // invitationEmails
            userEmail.trim() // user email
          );

        if (result.error) {
          throw new Error(result.error);
        }

        console.log('Onboarding completed successfully');
        
        // Redirect to help page with Slack open trigger
        // Note: router.push is client-side navigation, it should preserve the query param
        const teamId = searchParams.get('team');
        const targetUrl = `/docs${teamId ? `?openSlack=${teamId}` : ''}`;
        console.log('Redirecting to:', targetUrl);
        router.push(targetUrl);
      } catch (err) {
        setError('Failed to complete setup. Please try again.');
        console.error('Onboarding error:', err);
      }
    });
  }

  function handleContinueWithFree() {
    if (!validateForm()) return;
    completeOnboarding();
  }

  async function handleUpgradeToPro() {
    if (!user) return;
    if (!validateForm()) return;
    
    try {
      const checkoutUrl = `/api/stripe/checkout?user=${encodeURIComponent(user._id)}`;
      window.location.href = checkoutUrl;
    } catch (error) {
      setError('Failed to start upgrade process. Please try again.');
      console.error('Upgrade error:', error);
    }
  }

  // Loading state
  if (isValidating) {
    return (
      <Container size="lg" py={64}>
        <Center h="70vh">
          <Text c="dimmed">Validating…</Text>
        </Center>
      </Container>
    );
  }

  if (!user) {
    return null;
  }

  const hasProSubscription = user?.subscription?.tier === 'PRO' && user?.subscription?.status === 'active';

  // --- Render Sections ---

  const renderFrequencySection = () => (
    <Stack gap="sm">
      <Stack gap={4}>
        <Title order={3} size="h3" style={{ color: '#0F172A' }}>Report frequency</Title>
        <Text size="sm" c="dimmed">How often should we DM your report?</Text>
      </Stack>
      <Center py={8}>
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
    </Stack>
  );

  const renderChannelsSection = () => (
    <Stack gap="sm">
      <Stack gap={4}>
        <Title order={3} size="h3" style={{ color: '#0F172A' }}>Channels</Title>
        <Text size="sm" c="dimmed">Choose channels to enable AI coaching</Text>
      </Stack>
      
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
          ) : availableChannels.length === 0 ? (
            <Center h="100%">
              <Text size="sm" c="dimmed">No public channels found</Text>
            </Center>
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

  const renderEmailSection = () => (
    <Stack gap="sm">
      <Stack gap={4}>
        <Title order={3} size="h3" style={{ color: '#0F172A' }}>Email address</Title>
        <Text size="sm" c="dimmed">Where should we send your reports?</Text>
      </Stack>
      <Stack gap="xs">
        <TextInput
          placeholder="your@email.com"
          value={userEmail}
          onChange={(e) => setUserEmail(e.currentTarget.value)}
          required
          type="email"
          size="md"
          style={{ fontSize: 16 }}
        />
        <Text size="sm" c="dimmed">
          Don&apos;t worry, we won&apos;t spam you. We&apos;ll use this to send your communication reports and important product updates.
        </Text>
      </Stack>
    </Stack>
  );

  const renderFooter = () => {
    if (hasProSubscription) {
      return (
        <Stack gap="lg" mt={24}>
          <Card
            p="sm"
            style={{
              background: 'linear-gradient(92deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)',
              color: 'white',
              textAlign: 'center'
            }}
          >
            <Text size="sm" fw={600}>
              🎉 You already have a PRO subscription!
            </Text>
          </Card>
          <Button 
            size="lg" 
            onClick={completeOnboarding}
            loading={isCompletingSetup}
          >
            Complete Setup
          </Button>
        </Stack>
      );
    }

    return (
      <Stack gap="lg" w="100%" mt={24}>
        <Stack gap={4} align="center">
          <Title order={3} size="h3" style={{ color: '#0F172A' }}>Choose your plan</Title>
          <Text size="sm" c="dimmed">Select the plan that works best for you</Text>
        </Stack>

        <Center>
          <Text size="sm" ta="center" style={{ maxWidth: 640, color: '#334155', fontWeight: 600 as unknown as number }}>
            We never store your chats or any personal information.
          </Text>
        </Center>
        
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
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Stack p={isMobile ? 20 : 24} gap={isMobile ? 'md' : 'lg'} style={{ height: '100%', flex: 1 }}>
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
                loading={isCompletingSetup}
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
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Stack p={isMobile ? 20 : 24} gap={isMobile ? 'md' : 'lg'} style={{ height: '100%', flex: 1 }}>
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
  };

  return (
    <Container px={16} py={isMobile ? 24 : 64} size={isMobile ? 'xs' : 'md'}>
      <Stack
        gap={48} // Increased gap between major sections
        w="100%"
        style={{
          maxWidth: isMobile ? 420 : 800,
          marginInline: 'auto',
          marginTop: isMobile ? 24 : 48
        }}
      >
        <Stack gap={8} align="center" mb={16}>
          <Title order={1} size="h1" ta="center" style={{ color: '#0F172A' }}>
            Configure your assistant
          </Title>
          <Text size="lg" c="dimmed" ta="center" style={{ maxWidth: 600 }}>
            Set up how Clarity works for you. You can change these settings anytime.
          </Text>
        </Stack>

        <Card withBorder={false} shadow="none" padding="lg" style={{ background: 'transparent' }}>
          <Stack gap={48}>
            {renderFrequencySection()}
            {renderChannelsSection()}
            {renderEmailSection()}
          </Stack>
        </Card>

        {error && (
          <Center>
            <Text size="sm" c="red">{error}</Text>
          </Center>
        )}

        {renderFooter()}
      </Stack>
    </Container>
  );
}
