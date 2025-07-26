'use client';

import { 
  Container, 
  Card, 
  Title, 
  Text, 
  Stack
} from '@/components/ui';

export default function HelpPage() {
  return (
    <Container size="md" py={40}>
      <Stack gap="lg">
        <Card p="xl">
          <Title order={1} size="h2" mb="md">
            Personal AI Coach Help 🤖
          </Title>
          
          <Text size="md" c="dimmed" mb="xl">
            Learn how to use your AI communication coach to improve your messaging skills.
          </Text>
        </Card>
        
        <Card p="xl">
          <Title order={2} size="h3" mb="md">
            Slash Commands
          </Title>
          
          <Stack gap="lg">
            <div>
              <Text fw={600} mb="xs" c="blue">/personalfeedback</Text>
              <Text size="sm" mb="md">
                Get instant analysis of your communication patterns based on your recent messages.
              </Text>
              <Text size="sm" c="dimmed">
                <strong>Usage:</strong> Type <code>/personalfeedback</code> in any channel
              </Text>
            </div>
            
            <div>
              <Text fw={600} mb="xs" c="blue">/rephrase [message]</Text>
              <Text size="sm" mb="md">
                Get improved versions of your messages with specific suggestions for better communication.
              </Text>
              <Text size="sm" c="dimmed">
                <strong>Usage:</strong> <code>/rephrase Can you get this done ASAP?</code>
              </Text>
            </div>
            
            <div>
              <Text fw={600} mb="xs" c="blue">/settings</Text>
              <Text size="sm" mb="md">
                Configure your AI coach preferences, including report frequency and analysis settings.
              </Text>
              <Text size="sm" c="dimmed">
                <strong>Usage:</strong> <code>/settings</code> or <code>/settings frequency weekly</code>
              </Text>
            </div>
          </Stack>
        </Card>
        
        <Card p="xl">
          <Title order={2} size="h3" mb="md">
            Real-time Analysis
          </Title>
          
          <Stack gap="md">
            <div>
              <Text fw={600} mb="xs">How it works:</Text>
              <Stack gap="xs">
                <Text size="sm">• The AI analyzes your messages in public channels automatically</Text>
                <Text size="sm">• You receive private suggestions only you can see (ephemeral messages)</Text>
                <Text size="sm">• No message content is permanently stored - only analysis patterns</Text>
                <Text size="sm">• The bot learns from conversation context to provide better suggestions</Text>
              </Stack>
            </div>
            
            <div>
              <Text fw={600} mb="xs">What it analyzes:</Text>
              <Stack gap="xs">
                <Text size="sm">• <strong>Pushiness:</strong> Overly aggressive or demanding language</Text>
                <Text size="sm">• <strong>Vagueness:</strong> Unclear or imprecise communication</Text>
                <Text size="sm">• <strong>Non-objective:</strong> Subjective opinions presented as facts</Text>
                <Text size="sm">• <strong>Circular:</strong> Repetitive or redundant messaging</Text>
                <Text size="sm">• <strong>Rudeness:</strong> Impolite or discourteous tone</Text>
                <Text size="sm">• <strong>Passive-aggressive:</strong> Indirect expression of negative feelings</Text>
                <Text size="sm">• <strong>Fake/Inauthentic:</strong> Insincere or overly positive tone</Text>
                <Text size="sm">• <strong>One-liner:</strong> Overly brief responses lacking context</Text>
              </Stack>
            </div>
          </Stack>
        </Card>
        
        <Card p="xl">
          <Title order={2} size="h3" mb="md">
            Reports & Analytics
          </Title>
          
          <Stack gap="md">
            <div>
              <Text fw={600} mb="xs">Personal Reports:</Text>
              <Text size="sm" mb="md">
                Receive detailed communication analysis reports via direct message based on your configured frequency (weekly or monthly).
              </Text>
            </div>
            
            <div>
              <Text fw={600} mb="xs">What&apos;s included:</Text>
              <Stack gap="xs">
                <Text size="sm">• Overall communication score and trends</Text>
                <Text size="sm">• Strengths and areas for improvement</Text>
                <Text size="sm">• Common communication patterns</Text>
                <Text size="sm">• Personalized recommendations</Text>
                <Text size="sm">• Progress tracking over time</Text>
              </Stack>
            </div>
          </Stack>
        </Card>
        
        <Card p="xl">
          <Title order={2} size="h3" mb="md">
            Privacy & Security
          </Title>
          
          <Stack gap="md">
            <div>
              <Text fw={600} mb="xs">Data Policy:</Text>
              <Stack gap="xs">
                <Text size="sm">• Message content is analyzed but not permanently stored</Text>
                <Text size="sm">• Only communication patterns and improvements are saved</Text>
                <Text size="sm">• Analysis is personal and not shared with others</Text>
                <Text size="sm">• You can disable analysis at any time</Text>
              </Stack>
            </div>
            
            <div>
              <Text fw={600} mb="xs">Permissions:</Text>
              <Stack gap="xs">
                <Text size="sm">• Read messages in public channels you participate in</Text>
                <Text size="sm">• Send ephemeral messages (only you can see them)</Text>
                <Text size="sm">• Send direct messages for reports</Text>
                <Text size="sm">• Access your basic profile information</Text>
              </Stack>
            </div>
          </Stack>
        </Card>
        
        <Card p="xl">
          <Title order={2} size="h3" mb="md">
            Getting Started
          </Title>
          
          <Stack gap="md">
            <div>
              <Text fw={600} mb="xs">Quick Start:</Text>
              <Stack gap="xs">
                <Text size="sm">1. Start messaging in public channels as usual</Text>
                <Text size="sm">2. Look for private suggestions from the AI coach</Text>
                <Text size="sm">3. Try the <code>/personalfeedback</code> command for instant analysis</Text>
                <Text size="sm">4. Use <code>/rephrase</code> to improve specific messages</Text>
                <Text size="sm">5. Configure <code>/settings</code> to your preferences</Text>
              </Stack>
            </div>
            
            <div>
              <Text fw={600} mb="xs">Best Practices:</Text>
              <Stack gap="xs">
                <Text size="sm">• Be open to feedback and suggestions</Text>
                <Text size="sm">• Practice implementing suggested improvements</Text>
                <Text size="sm">• Review your reports regularly</Text>
                <Text size="sm">• Use the tools consistently for best results</Text>
              </Stack>
            </div>
          </Stack>
        </Card>
        
        <Card p="xl">
          <Title order={2} size="h3" mb="md">
            Need More Help?
          </Title>
          
          <Text size="sm" c="dimmed" mb="md">
            If you have questions or need assistance, you can:
          </Text>
          
          <Stack gap="xs">
            <Text size="sm">• Try the <code>/settings</code> command for configuration options</Text>
            <Text size="sm">• Use <code>/personalfeedback</code> to check if the system is working</Text>
            <Text size="sm">• Contact your workspace admin if you can&apos;t access the commands</Text>
            <Text size="sm">• Check that the app is properly installed in your workspace</Text>
          </Stack>
        </Card>

        <Stack gap="md">
          <Title order={2}>🔧 Troubleshooting</Title>
          
          <Card withBorder>
            <Stack gap="sm">
              <Title order={3}>❌ &ldquo;/personalfeedback&rdquo; shows &ldquo;not_authed&rdquo; error</Title>
              <Text size="sm" c="dimmed">
                This means your <code>SLACK_BOT_TOKEN</code> environment variable is missing or invalid.
              </Text>
              <Text size="sm">
                <strong>Fix:</strong> Add your bot token to your environment variables:
                <br />
                1. Go to your Slack app&apos;s &ldquo;OAuth &amp; Permissions&rdquo; page
                <br />
                                 2. Copy the &ldquo;Bot User OAuth Token&rdquo; (starts with xoxb-)
                <br />
                3. Add it as <code>SLACK_BOT_TOKEN</code> in your deployment platform
              </Text>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="sm">
              <Title order={3}>🤖 Auto coaching not working</Title>
              <Text size="sm" c="dimmed">
                Messages in channels aren&apos;t being analyzed automatically.
              </Text>
              <Text size="sm">
                <strong>Requirements for auto coaching:</strong>
                <br />
                1. Bot must be added to the channel (invite @YourAppBot)
                <br />
                2. Event subscriptions must be enabled in Slack app settings
                <br />
                3. Webhook URL must be set to: <code>https://your-domain.com/api/slack/events</code>
                <br />
                4. Interactive components URL must be set to: <code>https://your-domain.com/api/slack/interactive</code>
                <br />
                5. User must have completed onboarding
                <br />
                6. Message events must be subscribed to in your Slack app
                <br />
                7. Bot needs <code>chat:write</code> and <code>chat:write.public</code> permissions for message replacement
              </Text>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="sm">
              <Title order={3}>⚡ Testing the auto coaching</Title>
              <Text size="sm">
                To test if auto coaching is working:
                <br />
                1. Make sure the bot is in your test channel
                <br />
                                 2. Send a pushy message like &quot;Hey can you do this ASAP!!!&quot;
                <br />
                3. You should see an ephemeral message with:
                <br />
                   • Original message and improved version
                <br />
                   • Explanation of the issue
                <br />
                                       • &quot;🔄 Replace Message&quot; button to replace your text
                <br />
                    • &quot;✅ Keep Original&quot; button to dismiss
                <br />
                                 4. Click &quot;🔄 Replace Message&quot; to test message replacement
              </Text>
            </Stack>
          </Card>
        </Stack>

        <Stack gap="md">
          <Title order={2}>✨ Enhanced Auto Coaching Features</Title>
          
          <Card withBorder>
            <Stack gap="sm">
              <Title order={3}>🔄 Message Replacement</Title>
              <Text size="sm" c="dimmed">
                When you send a message with communication issues, you&apos;ll now get:
              </Text>
              <Text size="sm">
                                 📝 <strong>Original Message:</strong> &ldquo;Hey can you do this ASAP!!!&rdquo;
                <br />
                ✨ <strong>Improved Version:</strong> &ldquo;Hi! Could you please help with this when you have a chance?&rdquo;
                <br />
                💡 <strong>Explanation:</strong> Reduces pushiness and adds politeness
                <br />
                🔄 <strong>Replace Button:</strong> Deletes original and posts improved version
                <br />
                ✅ <strong>Keep Original:</strong> Dismisses suggestion if you prefer your style
              </Text>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="sm">
              <Title order={3}>🎯 Smart Analysis</Title>
              <Text size="sm">
                The AI analyzes your messages for common issues:
                <br />
                • <strong>Pushiness:</strong> Demanding immediate responses
                <br />
                • <strong>Vagueness:</strong> Lacking specific details  
                <br />
                • <strong>Rudeness:</strong> Harsh or dismissive tone
                <br />
                • <strong>One-liners:</strong> Messages lacking context
                <br />
                • <strong>Passive-aggressive:</strong> Indirect negative feelings
                <br />
                • <strong>Circular:</strong> Repetitive communication
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </Container>
  );
} 