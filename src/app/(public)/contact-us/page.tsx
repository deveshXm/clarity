'use client';

import React from 'react';
import { Container, Stack, Title, Text, Card } from '@/components/ui';
import { Mail, MessageCircle, FileText, ExternalLink } from 'lucide-react';

export default function ContactUsPage(): React.ReactElement {
  return (
    <Container size="md" py={60}>
      <Stack gap={40}>
        <Stack gap={16} align="center">
          <Title order={1} size="h1" ta="center">
            Contact Support
          </Title>
          <Text size="lg" c="dimmed" ta="center">
            We&apos;re here to help! Get in touch with our support team.
          </Text>
        </Stack>

        <Stack gap={24}>
          <Card p={32} radius="lg" withBorder>
            <Stack gap={20}>
              <Stack gap={12} align="center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <Mail size={24} className="text-blue-600" />
                </div>
                <Title order={3} size="h3" ta="center">
                  Email Support
                </Title>
              </Stack>
              <Text ta="center" c="dimmed">
                Get help with technical issues, billing questions, or general inquiries.
              </Text>
              <Text ta="center" fw={600}>
                support@clarity.rocktangle.com
              </Text>
              <Text ta="center" size="sm" c="dimmed">
                We typically respond within 24 hours
              </Text>
            </Stack>
          </Card>

          <Card p={32} radius="lg" withBorder>
            <Stack gap={20}>
              <Stack gap={12} align="center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <MessageCircle size={24} className="text-green-600" />
                </div>
                <Title order={3} size="h3" ta="center">
                  Slack Support
                </Title>
              </Stack>
              <Text ta="center" c="dimmed">
                Need help with Slack commands or features? Use our built-in help command.
              </Text>
              <Text ta="center" fw={600} ff="monospace">
                /clarity-help
              </Text>
              <Text ta="center" size="sm" c="dimmed">
                Available directly in your Slack workspace
              </Text>
            </Stack>
          </Card>

          <Card p={32} radius="lg" withBorder>
            <Stack gap={20}>
              <Stack gap={12} align="center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <FileText size={24} className="text-purple-600" />
                </div>
                <Title order={3} size="h3" ta="center">
                  Documentation
                </Title>
              </Stack>
              <Text ta="center" c="dimmed">
                Find answers to common questions and learn about all features.
              </Text>
              <div className="flex justify-center">
                <a 
                  href="/docs" 
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  View Documentation
                  <ExternalLink size={16} />
                </a>
              </div>
              <Text ta="center" size="sm" c="dimmed">
                Comprehensive guides and troubleshooting
              </Text>
            </Stack>
          </Card>
        </Stack>

        <Stack gap={16} align="center" pt={32}>
          <Title order={3} size="h4" ta="center">
            Business Inquiries
          </Title>
          <Text ta="center" c="dimmed">
            For partnership opportunities, enterprise solutions, or media inquiries, please reach out to:
          </Text>
          <Text ta="center" fw={600}>
            hello@clarity.rocktangle.com
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
