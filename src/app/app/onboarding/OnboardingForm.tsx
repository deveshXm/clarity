'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Title, Button, Stack, Center, Container, Text, Card, TextInput } from '@/components/ui';
import { validateSlackUser, completeSlackOnboarding, getWorkspaceChannels } from '@/lib/server-actions';
import { SlackChannel } from '@/types';

type OnboardingStep = 'frequency' | 'channels' | 'invitations';

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
  const [email, setEmail] = useState('');
  const [sentEmails, setSentEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<SlackUser | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isAddingEmail, startAddingEmail] = useTransition();
  const [isCompletingSetup, startCompletingSetup] = useTransition();
  const [isValidating, setIsValidating] = useState(true);
  
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
      
      const result = await getWorkspaceChannels(teamId);
      if (result.success && result.channels) {
        setAvailableChannels(result.channels.filter(channel => !channel.is_archived));
        setCurrentStep('channels');
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
    setCurrentStep('invitations');
  }

  function handleInviteEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    
    startAddingEmail(async () => {
      try {
        // Simulate sending invitation (implement actual email sending later)
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSentEmails([...sentEmails, email]);
        setEmail('');
      } catch (err) {
        setError('Failed to send invitation. Please try again.');
        console.error('Invitation error:', err);
      }
    });
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
          sentEmails.length > 0 ? sentEmails : undefined
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

  // Show loading while validating user
  if (isValidating) {
    return (
      <Container size="sm" py={80}>
        <Center>
          <Card p="xl" style={{ width: '100%', maxWidth: 400 }}>
            <Center>
              <Text>Validating user...</Text>
            </Center>
          </Card>
        </Center>
      </Container>
    );
  }

  // Don't render anything if user is null (will redirect)
  if (!user) {
    return null;
  }

  const renderFrequencyStep = () => (
    <Card p="xl" style={{ width: '100%', maxWidth: 400 }}>
      <Stack gap="lg" align="center">
        <div style={{ textAlign: 'center' }}>
          <Title order={1} size="h2" mb="xs">
            Level Up Your Communication
          </Title>
          <Text size="md" c="dimmed">
            Choose your coaching schedule
          </Text>
        </div>

        <form onSubmit={handleFrequencyNext} style={{ width: '100%' }}>
          <Stack gap="md">
            <Stack gap="xs">
              <Button
                variant={analysisFrequency === 'weekly' ? 'filled' : 'light'}
                onClick={() => setAnalysisFrequency('weekly')}
                fullWidth
                size="lg"
              >
                <Stack gap={2} align="center">
                  <Text>📅 Weekly</Text>
                  <Text size="xs" c="dimmed">(faster growth)</Text>
                </Stack>
              </Button>
              <Button
                variant={analysisFrequency === 'monthly' ? 'filled' : 'light'}
                onClick={() => setAnalysisFrequency('monthly')}
                fullWidth
                size="lg"
              >
                <Stack gap={2} align="center">
                  <Text>📊 Monthly</Text>
                  <Text size="xs" c="dimmed">(steady progress)</Text>
                </Stack>
              </Button>
            </Stack>

            {error && (
              <Text size="sm" c="red" ta="center">
                {error}
              </Text>
            )}

            <Button
              type="submit"
              fullWidth
              size="md"
              mt="md"
              loading={isLoadingChannels}
            >
              {isLoadingChannels ? 'Loading channels...' : 'Next →'}
            </Button>
          </Stack>
        </form>
      </Stack>
    </Card>
  );

  const renderInvitationsStep = () => (
    <Card p="xl" style={{ width: '100%', maxWidth: 400 }}>
      <Stack gap="lg">
        <Button 
          variant="subtle" 
          onClick={() => setCurrentStep('channels')}
          style={{ alignSelf: 'flex-start' }}
          size="sm"
        >
          ← Back
        </Button>

        <div style={{ textAlign: 'center' }}>
          <Title order={1} size="h2" mb="xs">
            Build a Better Team
          </Title>
          <Text size="md" c="dimmed">
            Invite teammates to improve too
          </Text>
        </div>
        
        <form onSubmit={handleInviteEmail}>
          <Stack gap="md">
            <TextInput
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              disabled={isAddingEmail}
              size="md"
            />
            
            <Button
              type="submit"
              loading={isAddingEmail}
              disabled={!email.trim()}
              fullWidth
              variant="light"
            >
              {isAddingEmail ? 'Adding...' : 'Add Teammate'}
            </Button>
          </Stack>
        </form>
        
        {sentEmails.length > 0 && (
          <Stack gap="xs">
            {sentEmails.map((sentEmail, index) => (
              <Text key={index} size="sm" c="green">
                ✅ {sentEmail}
              </Text>
            ))}
          </Stack>
        )}

        {error && (
          <Text size="sm" c="red" ta="center">
            {error}
          </Text>
        )}
        
        <Button
          onClick={completeOnboarding}
          loading={isCompletingSetup}
          fullWidth
          size="md"
          mt="md"
        >
          {isCompletingSetup ? 'Completing setup...' : 'Complete Setup'}
        </Button>
      </Stack>
    </Card>
  );

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
    <Card p="xl" style={{ width: '100%', maxWidth: 500 }}>
      <Stack gap="lg">
        <Button 
          variant="subtle" 
          onClick={() => setCurrentStep('frequency')}
          style={{ alignSelf: 'flex-start' }}
          size="sm"
        >
          ← Back
        </Button>

        <div style={{ textAlign: 'center' }}>
          <Title order={1} size="h2" mb="xs">
            Choose Your Channels
          </Title>
          <Text size="md" c="dimmed">
            Select channels where you want AI coaching
          </Text>
        </div>

        <form onSubmit={handleChannelsNext}>
          <Stack gap="md">
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <Stack gap="xs">
                {availableChannels.map((channel) => {
                  const isSelected = selectedChannels.some(c => c.id === channel.id);
                  return (
                    <Button
                      key={channel.id}
                      variant={isSelected ? 'filled' : 'light'}
                      onClick={() => toggleChannelSelection(channel)}
                      fullWidth
                      size="sm"
                      style={{ 
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                      }}
                    >
                      <Stack gap={2} align="flex-start" style={{ width: '100%' }}>
                        <Text size="sm">
                          {channel.is_private ? '🔒' : '#'} {channel.name}
                        </Text>
                        {channel.is_private && (
                          <Text size="xs" c="dimmed">Private channel</Text>
                        )}
                      </Stack>
                    </Button>
                  );
                })}
              </Stack>
            </div>

            {availableChannels.length === 0 && (
              <Text size="sm" c="dimmed" ta="center">
                No channels available
              </Text>
            )}

            {selectedChannels.length > 0 && (
              <Text size="sm" c="green" ta="center">
                ✅ {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} selected
              </Text>
            )}

            {error && (
              <Text size="sm" c="red" ta="center">
                {error}
              </Text>
            )}

            <Button
              type="submit"
              fullWidth
              size="md"
              mt="md"
            >
              Next →
            </Button>
          </Stack>
        </form>
      </Stack>
    </Card>
  );

  return (
    <Container size="sm" py={80}>
      <Center>
        {currentStep === 'frequency' && renderFrequencyStep()}
        {currentStep === 'channels' && renderChannelsStep()}
        {currentStep === 'invitations' && renderInvitationsStep()}
      </Center>
    </Container>
  );
} 