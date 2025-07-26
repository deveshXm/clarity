'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Container, 
  Card, 
  Title, 
  Text, 
  Button, 
  Stack, 
  TextInput
} from '@/components/ui';

export default function InvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sentEmails, setSentEmails] = useState<string[]>([]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setIsLoading(true);
    
    // Simulate sending invitation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSentEmails([...sentEmails, email]);
    setEmail('');
    setIsLoading(false);
  };

  return (
    <Container size="md" py={40}>
      <Button 
        variant="light" 
        onClick={() => router.push('/app')}
        mb="lg"
      >
        ← Back to Dashboard
      </Button>
      
      <Card p="xl">
        <Title order={1} size="h2" mb="md">
          Invite Team Members 📧
        </Title>
        
        <Text size="md" c="dimmed" mb="xl">
          Help your teammates improve their communication skills by inviting them to use the Personal AI Coach.
        </Text>
        
        <Stack gap="lg">
          <div>
            <Text fw={600} mb="md">How it works:</Text>
            <Stack gap="xs">
              <Text size="sm">1. Enter your teammate&apos;s email address</Text>
              <Text size="sm">2. We&apos;ll send them an invitation with installation instructions</Text>
                              <Text size="sm">3. They can install the app directly to their Slack workspace</Text>
                <Text size="sm">4. Each person gets their own personal AI coach</Text>
            </Stack>
          </div>
          
          <form onSubmit={handleInvite}>
            <Stack gap="md">
              <TextInput
                label="Email Address"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                disabled={isLoading}
                required
              />
              
              <Button
                type="submit"
                loading={isLoading}
                disabled={!email.trim()}
              >
                Send Invitation
              </Button>
            </Stack>
          </form>
          
          {sentEmails.length > 0 && (
            <div>
              <Text fw={600} mb="md">Invitations Sent:</Text>
              <Stack gap="xs">
                {sentEmails.map((sentEmail, index) => (
                  <Text key={index} size="sm" c="green">
                    ✅ {sentEmail}
                  </Text>
                ))}
              </Stack>
            </div>
          )}
          
          <div>
            <Text size="sm" c="dimmed">
              💡 <strong>Pro tip:</strong> Each team member needs to install the app individually. 
              The AI coach provides personalized feedback based on each person&apos;s communication patterns.
            </Text>
          </div>
        </Stack>
      </Card>
    </Container>
  );
} 