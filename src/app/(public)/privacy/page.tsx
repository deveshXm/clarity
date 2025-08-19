'use client';

import React from 'react';
import { Container, Stack, Title, Text } from '@/components/ui';

export default function PrivacyPage(): React.ReactElement {
  return (
    <Container size="md" py={60}>
      <Stack gap={40}>
        <Stack gap={16}>
          <Title order={1} size="h1">
            Privacy Policy
          </Title>
          <Text size="lg" c="dimmed">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </Stack>

        <Stack gap={32}>
          <Stack gap={16}>
            <Title order={2} size="h2">
              1. Information We Collect
            </Title>
            <Text>
              When you use Clarity, we collect:
            </Text>
            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
              <li>Your Slack user profile information (name, user ID, workspace ID)</li>
              <li>Messages from channels where Clarity is explicitly added as a member</li>
              <li>Usage analytics and interaction data with our Service</li>
              <li>Billing information processed securely through Stripe</li>
            </ul>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              2. How We Use Your Information
            </Title>
            <Text>
              We use your information to:
            </Text>
            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
              <li>Provide AI-powered communication coaching and suggestions</li>
              <li>Generate personalized feedback reports</li>
              <li>Improve our Service through analytics and usage patterns</li>
              <li>Process payments and manage subscriptions</li>
              <li>Provide customer support</li>
            </ul>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              3. Data Access and Channel Privacy
            </Title>
            <Text>
              Clarity only accesses messages from channels where it has been explicitly added as a member. We do not have access to:
            </Text>
            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
              <li>Private conversations or direct messages (unless sent directly to Clarity)</li>
              <li>Channels where Clarity has not been added</li>
              <li>Historical messages from before Clarity was added to a channel</li>
            </ul>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              4. Data Security
            </Title>
            <Text>
              We implement appropriate technical and organizational measures to protect your data against unauthorized access, alteration, disclosure, or destruction. All communication with our servers is encrypted using industry-standard SSL/TLS protocols.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              5. Data Sharing
            </Title>
            <Text>
              We do not sell, trade, or otherwise transfer your personal information to third parties except:
            </Text>
            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
              <li>To process payments through Stripe (our payment processor)</li>
              <li>When required by law or to protect our rights</li>
              <li>With your explicit consent</li>
            </ul>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              6. Data Retention
            </Title>
            <Text>
              We retain your data only as long as necessary to provide the Service or as required by law. You may request deletion of your data by uninstalling Clarity from your Slack workspace or contacting our support team.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              7. Third-Party Services
            </Title>
            <Text>
              Our Service integrates with Slack and uses Stripe for payment processing. These third-party services have their own privacy policies that govern their handling of your data.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              8. Changes to Privacy Policy
            </Title>
            <Text>
              We may update this Privacy Policy from time to time. We will notify you of any material changes via email or through the Service. Your continued use of the Service after changes constitutes acceptance of the updated Privacy Policy.
            </Text>
          </Stack>

          <Stack gap={16}>
            <Title order={2} size="h2">
              9. Contact Us
            </Title>
            <Text>
              If you have any questions about this Privacy Policy or our data practices, please contact us through our support page.
            </Text>
          </Stack>
        </Stack>
      </Stack>
    </Container>
  );
}
