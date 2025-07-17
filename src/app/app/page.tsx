'use client';

import {
  Container,
  Title,
  Button,
} from '@/components/ui';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

export default function AppPage() {
  const router = useRouter();
  const [configModalOpened, setConfigModalOpened] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <Container size="lg" py={40}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <Title order={3} size="h3">
          Your App
        </Title>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="light" size="xs" onClick={() => setConfigModalOpened(true)}>
            Account Config
          </Button>
          <Button variant="light" size="xs" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div style={{ textAlign: 'center', marginTop: 100 }}>
        <Title order={1} size="h1">
          Dashboard
        </Title>
      </div>
    </Container>
  );
} 