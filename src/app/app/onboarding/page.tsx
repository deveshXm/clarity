import { Suspense } from 'react';
import { Center, Text } from '@/components/ui';
import OnboardingForm from './OnboardingForm';

export default function OnboardingPage() {
  return (
    <div
      className="relative min-h-[100svh]"
      style={{
        backgroundColor: '#FAFAF9',
        backgroundImage:
          'radial-gradient(30% 40% at 15% 15%, rgba(56,189,248,0.32) 0%, rgba(56,189,248,0) 70%),\
radial-gradient(28% 38% at 85% 10%, rgba(34,211,238,0.30) 0%, rgba(34,211,238,0) 70%),\
radial-gradient(26% 40% at 50% 90%, rgba(96,165,250,0.26) 0%, rgba(96,165,250,0) 70%)',
      }}
    >
      <div className="relative z-10">
        <Suspense
          fallback={
            <Center h="100vh">
              <Text>Loading...</Text>
            </Center>
          }
        >
          <OnboardingForm />
        </Suspense>
      </div>
    </div>
  );
}