import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingGate } from '../onboarding-gate';

const useOnboardingMock = vi.hoisted(() => vi.fn());

const hookReturn = vi.hoisted(() => ({
  mainAppInert: false,
  storageReady: true,
  showCheckingLayer: false,
  showLoggedOutLayer: false,
  showFirstRunReveal: false,
  refreshState: 'idle' as const,
  refreshErrorMessage: null as string | null,
  refreshInfoMessage: null as string | null,
  refreshGitHubSession: vi.fn(),
  prefersReducedMotion: true,
  markRevealComplete: vi.fn(),
}));

vi.mock('@src/hooks/use-onboarding', () => ({
  useOnboarding: useOnboardingMock,
}));

vi.mock('../onboarding-overlay', () => ({
  OnboardingOverlay: () => <div data-testid="onboarding-overlay-stub" />,
}));

function resetHookReturn() {
  hookReturn.mainAppInert = false;
  hookReturn.storageReady = true;
  hookReturn.showCheckingLayer = false;
  hookReturn.showLoggedOutLayer = false;
  hookReturn.showFirstRunReveal = false;
  hookReturn.refreshState = 'idle';
  hookReturn.refreshErrorMessage = null;
  hookReturn.refreshInfoMessage = null;
  hookReturn.refreshGitHubSession = vi.fn();
  hookReturn.prefersReducedMotion = true;
  hookReturn.markRevealComplete = vi.fn();
}

describe('First run and logged out overlays', () => {
  beforeEach(() => {
    resetHookReturn();
    useOnboardingMock.mockImplementation(() => {
      return { ...hookReturn };
    });
  });

  it('blocks interaction with the main popup while the first run celebration is showing', () => {
    hookReturn.storageReady = true;
    hookReturn.showFirstRunReveal = true;
    hookReturn.showCheckingLayer = false;
    hookReturn.showLoggedOutLayer = false;
    hookReturn.mainAppInert = true;

    render(
      <OnboardingGate>
        <button type="button">Main popup action</button>
      </OnboardingGate>,
    );

    expect(screen.getByTestId('onboarding-overlay-stub')).toBeTruthy();

    const button = screen.getByRole('button', {
      name: 'Main popup action',
      hidden: true,
    });
    const mainShell = button.parentElement;
    expect(mainShell).not.toBeNull();
    expect(mainShell!.getAttribute('aria-hidden')).toBe('true');
    expect(mainShell!.hasAttribute('inert')).toBe(true);
  });

  it('shows the loading veil until storage has finished hydrating onboarding flags', () => {
    hookReturn.storageReady = false;
    hookReturn.showCheckingLayer = false;
    hookReturn.showLoggedOutLayer = false;
    hookReturn.showFirstRunReveal = false;
    hookReturn.mainAppInert = true;

    const view = render(
      <OnboardingGate>
        <span>Main app</span>
      </OnboardingGate>,
    );

    const veil = screen.getByLabelText('Loading');
    expect(veil.getAttribute('aria-busy')).toBe('true');

    hookReturn.storageReady = true;
    hookReturn.mainAppInert = false;

    view.rerender(
      <OnboardingGate>
        <span>Main app</span>
      </OnboardingGate>,
    );

    expect(screen.queryByLabelText('Loading')).toBeNull();
  });
});
