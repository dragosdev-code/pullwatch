import type { ReactNode } from 'react';
import { useOnboarding } from '../../hooks/use-onboarding';
import { OnboardingOverlay, type OnboardingPhase } from './onboarding-overlay';

type OnboardingGateProps = {
  children: ReactNode;
};

/**
 * WHY [overlay + inert]: PR lists hydrate into TanStack Query before paint; this gate keeps the
 * main tree mounted (so hooks + storage sync keep running) while blocking interaction and SR(screen reader)
 * exposure until onboarding clears — no cache tricks and no layout dimension changes at handoff.
 *
 * WHY [single shell, phase-driven]: `showLoggedOutLayer` and `showFirstRunReveal` are mutually
 * exclusive but used to be rendered as two independent overlays, so the `isLoggedIn` flip
 * unmounted one dialog and mounted another in the same commit — a visible flash even when the
 * state change was correct. Collapsing to one shell with a phase crossfade removes the flash.
 */
export function OnboardingGate({ children }: OnboardingGateProps) {
  const {
    mainAppInert,
    storageReady,
    showCheckingLayer,
    showLoggedOutLayer,
    showFirstRunReveal,
    refreshState,
    refreshErrorMessage,
    refreshInfoMessage,
    refreshGitHubSession,
    prefersReducedMotion,
    markRevealComplete,
  } = useOnboarding();

  const phase: OnboardingPhase | null = showCheckingLayer
    ? 'checking'
    : showLoggedOutLayer
      ? 'loggedOut'
      : showFirstRunReveal
        ? 'reveal'
        : null;

  return (
    <div
      className="pw-popup-shell relative overflow-hidden"
      style={{ width: 'var(--pw-popup-width)', height: 'var(--pw-popup-height)' }}
    >
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

      {phase ? (
        <OnboardingOverlay
          phase={phase}
          prefersReducedMotion={prefersReducedMotion}
          refreshState={refreshState}
          refreshErrorMessage={refreshErrorMessage}
          refreshInfoMessage={refreshInfoMessage}
          onRefresh={refreshGitHubSession}
          onRevealComplete={markRevealComplete}
        />
      ) : null}
    </div>
  );
}
