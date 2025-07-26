'use client';

import { useState } from 'react';
import { 
  Container, 
  Card, 
  Title, 
  Text, 
  Button, 
  Stack, 
  Center
} from '@/components/ui';

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleInstallSlack = async () => {
    setIsLoading(true);
    
    try {
      const { getSlackOAuthUrl } = await import('@/lib/server-actions');
      const slackOAuthUrl = await getSlackOAuthUrl();
      console.log('OAuth URL:', slackOAuthUrl); // Debug log
      window.location.href = slackOAuthUrl;
    } catch (error) {
      console.error('Failed to get OAuth URL:', error);
      setIsLoading(false);
    }
  };

  return (
    <Container size="lg" py={80}>
      <Center>
        <Card w={600} shadow="xl" radius="lg" p="xl">
          <Stack gap="lg" align="center">
            <div style={{ textAlign: 'center' }}>
              <Title order={1} size="h1" fw={700} mb="md">
                Personal AI Coach 🤖
              </Title>
              <Text size="lg" c="dimmed" mb="xl">
                Your AI-powered communication coach for Slack. Get real-time feedback, 
                personalized reports, and actionable suggestions to improve your messaging skills.
              </Text>
            </div>

            <Stack gap="md" align="center" w="100%">
              <Text fw={600} size="md">✨ What you&apos;ll get:</Text>
              <Stack gap="xs" align="start" w="100%">
                <Text size="sm">🔍 Real-time message analysis and suggestions</Text>
                <Text size="sm">📊 Personal communication feedback reports</Text>
                <Text size="sm">💬 Slash commands for instant help (/rephrase, /settings)</Text>
                <Text size="sm">🔒 Privacy-first - no permanent message storage</Text>
              </Stack>
            </Stack>

            <Button
              size="lg"
              fullWidth
              onClick={handleInstallSlack}
              loading={isLoading}
              styles={{
                root: {
                  backgroundColor: '#4A154B',
                  height: '60px',
                  fontSize: '16px',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: '#350d36',
                  },
                },
              }}
            >
              🚀 Add to Slack Workspace
            </Button>

            <Text size="xs" c="dimmed" ta="center" px="md">
              By installing this app, you agree to our Terms of Service and Privacy Policy.
              <br />
              Works with any Slack workspace - no admin approval required.
            </Text>
          </Stack>
        </Card>
      </Center>
    </Container>
  );
}
