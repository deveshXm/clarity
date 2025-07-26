import { Suspense } from 'react';
import { Center, Text } from '@/components/ui';
import OnboardingForm from './OnboardingForm';

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <Center h="100vh">
        <Text>Loading...</Text>
      </Center>
    }>
      <OnboardingForm />
    </Suspense>
  );
}