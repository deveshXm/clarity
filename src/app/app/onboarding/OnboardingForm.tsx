'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Title, TextInput, Button, Stack, Center, Container, Text } from '@/components/ui';
import { upsertAccountConfig } from '@/lib/server-actions';
import { AccountConfigFormData } from '@/types';

export default function OnboardingForm() {
  const [isPending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }

    startTransition(async () => {
      // Create account config data
      const accountConfig: AccountConfigFormData = {
        companyName: companyName.trim(),
        websiteUrl: websiteUrl.trim() || undefined,
      };

      const res = await upsertAccountConfig(accountConfig);
      
      if (!res.success) {
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        } else {
          setError(res.error ?? 'Something went wrong');
        }
        return;
      }

      // Success - redirect to main app
      router.push('/app');
    });
  }

  return (
    <Container size="sm" py={60}>
      <Center>
        <div style={{ width: '100%', maxWidth: 500 }}>
          <Title order={1} size="h2" ta="center" mb="lg">
            Welcome to Your App
          </Title>
          
          <Text size="md" c="dimmed" ta="center" mb="xl">
            Let's get you set up with a basic configuration
          </Text>

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Company Name"
                placeholder="Enter your company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.currentTarget.value)}
                disabled={isPending}
                error={fieldErrors.companyName?.[0]}
                required
              />

              <TextInput
                label="Website URL (Optional)"
                placeholder="https://yourcompany.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.currentTarget.value)}
                disabled={isPending}
                error={fieldErrors.websiteUrl?.[0]}
              />

              {error && (
                <Text size="sm" c="red" ta="center">
                  {error}
                </Text>
              )}

              <Button
                type="submit"
                loading={isPending}
                disabled={!companyName.trim()}
                fullWidth
              >
                {isPending ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </Stack>
          </form>
        </div>
      </Center>
    </Container>
  );
} 