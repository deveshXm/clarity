'use client';

import { useState } from 'react';
import { 
  Container, 
  Card, 
  Title, 
  Text, 
  Button, 
  Stack, 
  Center,
  LoadingOverlay,
  Alert
} from '@mantine/core';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL + '/app/onboarding'
      });
    } catch (err) {
      console.error('Sign in error:', err);
      setError('Failed to sign in with Google. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container size="sm" py={80}>
      <Center>
        <Card w={400} shadow="lg" radius="lg" p="xl" pos="relative">
          <LoadingOverlay visible={isLoading} />
          
          <Stack gap="lg" align="center">
            <div style={{ textAlign: 'center' }}>
              <Title order={1} size="h2" fw={600} mb="xs">
                Welcome to Answerable
              </Title>
              <Text c="dimmed" size="sm">
                Sign in to access your marketing intelligence dashboard
              </Text>
            </div>

            {error && (
              <Alert 
                color="red" 
                variant="light"
                w="100%"
              >
                {error}
              </Alert>
            )}

            <Button
              variant="default"
              size="md"
              fullWidth
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              styles={{
                root: {
                  border: '1px solid #e5e7eb',
                  '&:hover': {
                    backgroundColor: '#f9fafb',
                  },
                },
              }}
            >
              Continue with Google
            </Button>

            <Text size="xs" c="dimmed" ta="center" px="md">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </Text>
          </Stack>
        </Card>
      </Center>
    </Container>
  );
} 