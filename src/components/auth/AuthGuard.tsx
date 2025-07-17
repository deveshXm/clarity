'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { LoadingOverlay, Center, Text } from '@/components/ui';
import { User } from '@/types';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireOnboarding?: boolean;
  fallbackPath?: string;
}

export function AuthGuard({ 
  children, 
  requireAuth = true, 
  requireOnboarding = false,
  fallbackPath = '/login' 
}: AuthGuardProps) {
  const { data: session, isPending, error } = useSession();
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isPending) return; // Wait for session to load

    const user = session?.user as User | undefined;

    // Handle authentication requirement
    if (!user && requireAuth) {
      setRedirecting(true);
      router.replace(fallbackPath);
      return;
    }

    // Handle onboarding requirement
    if (user && requireOnboarding && !user.hasCompletedOnboarding) {
      setRedirecting(true);
      router.replace('/app/config');
      return;
    }

    // Redirect away from config if onboarding is complete
    if (user && user.hasCompletedOnboarding && window.location.pathname === '/app/config') {
      setRedirecting(true);
      router.replace('/app');
      return;
    }
  }, [session, isPending, requireAuth, requireOnboarding, fallbackPath, router]);

  // Show loading state
  if (isPending || redirecting) {
    return (
      <Center style={{ minHeight: '100vh' }}>
        <LoadingOverlay visible={true} />
        <Text size="sm" c="dimmed" mt="md">
          Checking authentication...
        </Text>
      </Center>
    );
  }

  // Show error state
  if (error) {
    return (
      <Center style={{ minHeight: '100vh' }}>
        <Text c="red" size="sm">
          Authentication error occurred
        </Text>
      </Center>
    );
  }

  const user = session?.user as User | undefined;

  // Don't render children if auth is required but user is not authenticated
  if (requireAuth && !user) {
    return null;
  }

  // Don't render children if onboarding is required but not completed
  if (requireOnboarding && user && !user.hasCompletedOnboarding) {
    return null;
  }

  return <>{children}</>;
} 