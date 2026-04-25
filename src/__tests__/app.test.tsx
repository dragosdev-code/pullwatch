import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGlobalErrorStore } from '@src/stores/global-error';

vi.mock('@src/components/onboarding/onboarding-gate', () => ({
  OnboardingGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@src/components/header', () => ({
  Header: () => <div data-testid="header-stub" />,
}));

vi.mock('@src/diagnostics-surface', () => ({
  DiagnosticsSurface: () => null,
}));

vi.mock('@src/components/parser-breakage-banner', () => ({
  ParserBreakageBanner: () => null,
}));

vi.mock('@src/components/github-outage-banner', () => ({
  GitHubOutageBanner: () => null,
}));

vi.mock('@src/components/dev-test-area', () => ({
  DevTestArea: () => null,
}));

vi.mock('@src/components/settings', () => ({
  SettingsOverlay: () => null,
}));

vi.mock('@src/components/ui/tabs/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-stub">{children}</div>,
}));

vi.mock('@src/components/ui/tabs/tab-panel', () => ({
  TabPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@src/components/lists/assigned-list', () => ({
  AssignedList: () => <div data-testid="assigned-stub" />,
}));

vi.mock('@src/components/lists/authored-list', () => ({
  AuthoredList: () => <div data-testid="authored-stub" />,
}));

vi.mock('@src/components/lists/merged-list', () => ({
  MergedList: () => <div data-testid="merged-stub" />,
}));

vi.mock('@src/hooks/use-assigned-prs', () => ({
  useAssignedPRs: () => ({ data: [], isSuccess: false }),
}));

vi.mock('@src/hooks/use-merged-prs', () => ({
  useMergedPRs: () => ({ data: [] }),
}));

vi.mock('@src/hooks/use-authored-prs', () => ({
  useAuthoredPRs: () => ({ data: [] }),
}));

vi.mock('@src/hooks/use-storage-sync', () => ({
  useStorageSync: () => {},
}));

vi.mock('@src/hooks/use-pr-lists-storage-sync', () => ({
  usePrListsStorageSync: () => {},
}));

vi.mock('@src/stores/debug', () => ({
  useDebugMode: () => false,
}));

import App from '../app';

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe('Popup error surface', () => {
  beforeEach(() => {
    useGlobalErrorStore.getState().clearError();
  });

  afterEach(() => {
    cleanup();
    useGlobalErrorStore.getState().clearError();
    vi.clearAllMocks();
  });

  it('shows a dismissible banner when a global error is present and clears it when the user dismisses', () => {
    const message = 'Refresh failed: network error';
    useGlobalErrorStore.getState().setError(message);

    renderApp();

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(useGlobalErrorStore.getState().error).toBeNull();
    expect(screen.queryByText(message)).toBeNull();
  });
});
