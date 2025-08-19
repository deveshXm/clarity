'use client';

import React from 'react';
import { Container, Stack, Title, Text } from '@/components/ui';

export default function TermsPage(): React.ReactElement {
  return (
    <Container size="md" py={60}>
      <Stack gap={40}>
        <Stack gap={16}>
          <Title order={1} size="h1">
            Terms of Service
          </Title>
          <Text size="lg" c="dimmed">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </Stack>

        <Stack gap={32}>
          <Stack gap={16}>
            <Title order={2} size="h2">
              1. Acceptance of Terms
            </Title>
            <Text>
              By installing, accessing, or using Clarity (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you disagree with any part of these terms, then you may not access the Service.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              2. Description of Service
            </Title>
            <Text>
              Clarity is a Slack application that provides AI-powered communication coaching and message improvement suggestions. The Service analyzes your messages and provides feedback to help improve clarity and tone in your workplace communications.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              3. User Accounts and Data
            </Title>
            <Text>
              When you install Clarity, we collect and store your Slack user information, workspace details, and message data as necessary to provide the Service. You are responsible for maintaining the security of your Slack workspace and controlling access to Clarity within your workspace.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              4. Subscription and Billing
            </Title>
            <Text>
              Clarity offers both free and paid subscription tiers. Paid subscriptions are billed monthly through Stripe. You may cancel your subscription at any time through the Slack settings interface. Cancellations take effect at the end of your current billing period.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              5. Privacy and Data Protection
            </Title>
            <Text>
              We are committed to protecting your privacy. Our collection and use of your data is governed by our Privacy Policy. We only access messages in channels where Clarity has been explicitly added, and all feedback is private to you.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              6. Acceptable Use
            </Title>
            <Text>
              You agree not to use the Service for any unlawful purposes or to violate any applicable laws. You may not attempt to reverse engineer, modify, or interfere with the Service&apos;s operation.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              7. Limitation of Liability
            </Title>
            <Text>
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the Service.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              8. Changes to Terms
            </Title>
            <Text>
              We reserve the right to modify these Terms at any time. We will notify users of any material changes via email or through the Service. Continued use of the Service after changes constitutes acceptance of the new Terms.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              9. Contact Information
            </Title>
            <Text>
              If you have any questions about these Terms, please contact us at our support page.
            </Text>
          </Stack>
        </Stack>
      </Stack>
    </Container>
  );
}
