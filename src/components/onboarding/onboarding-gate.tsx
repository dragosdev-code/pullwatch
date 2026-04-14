import type { ReactNode } from 'react';
import { useOnboarding } from '../../hooks/use-onboarding';
import { LoggedOutView } from './logged-out-view';
import { OnboardingReveal } from './onboarding-reveal';

type OnboardingGateProps = {
  children: ReactNode;
};

/**
 * WHY [overlay + inert]: PR lists hydrate into TanStack Query before paint; this gate keeps the
 * main tree mounted (so hooks + storage sync keep running) while blocking interaction and SR(screen reader)
 * exposure until onboarding clears — no cache tricks and no layout dimension changes at handoff.
 */
export function OnboardingGate({ children }: OnboardingGateProps) {
  const {
    mainAppInert,
    storageReady,
    showLoggedOutLayer,
    showFirstRunReveal,
    refreshState,
    refreshErrorMessage,
    refreshInfoMessage,
    refreshGitHubSession,
    prefersReducedMotion,
    markRevealComplete,
  } = useOnboarding();

  return (
    <div className="relative h-[400px] w-[380px] overflow-hidden">
      <div
        className="flex h-full w-full flex-col bg-base-100"
        aria-hidden={mainAppInert}
        inert={mainAppInert ? true : undefined}
        style={{ pointerEvents: mainAppInert ? 'none' : 'auto' }}
      >
        {children}
      </div>

      {!storageReady ? (
        <div className="absolute inset-0 z-40 bg-[#5b616b]" aria-busy="true" aria-label="Loading" />
      ) : null}

      {showLoggedOutLayer ? (
        <LoggedOutView
          refreshState={refreshState}
          refreshErrorMessage={refreshErrorMessage}
          refreshInfoMessage={refreshInfoMessage}
          prefersReducedMotion={prefersReducedMotion}
          onRefresh={refreshGitHubSession}
        />
      ) : null}

      {showFirstRunReveal ? (
        <OnboardingReveal
          reducedMotion={prefersReducedMotion}
          onRevealComplete={markRevealComplete}
        />
      ) : null}
    </div>
  );
}
