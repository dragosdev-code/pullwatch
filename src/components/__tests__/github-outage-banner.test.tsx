import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { GitHubOutagePayload } from '@common/types';
import type { GitHubStatusUiSnapshot } from '@src/hooks/use-github-status-snapshot';

const outageMock = vi.hoisted(() => ({
  state: {
    isActive: false,
    payload: null as GitHubOutagePayload | null,
    lastUntrustedAttemptAt: null as number | null,
  },
}));

const statusSnapshotMock = vi.hoisted(() => ({
  value: null as GitHubStatusUiSnapshot | null,
}));

vi.mock('@src/hooks/use-github-outage', () => ({
  useGitHubOutage: () => outageMock.state,
}));

vi.mock('@src/hooks/use-github-status-snapshot', async () => {
  const actual = await vi.importActual<typeof import('@src/hooks/use-github-status-snapshot')>(
    '@src/hooks/use-github-status-snapshot'
  );
  return {
    ...actual,
    useGitHubStatusSnapshot: () => statusSnapshotMock.value,
  };
});

import { GitHubOutageBanner } from '../github-outage-banner';

const transportPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_000_000,
  context: 'transport boom',
  reason: 'transport',
};

const componentDegradedPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_001_000,
  context: 'PR component degraded',
  reason: 'pr_component_degraded',
};

const listChurnPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_002_000,
  context: 'tombstone resurrection',
  reason: 'pr_list_churn',
};

const corroboratingSnapshot: GitHubStatusUiSnapshot = {
  prComponentStatus: 'partial_outage',
  globalIndicator: 'minor',
  fetchedAt: 1_700_000_000_000,
};

const greenSnapshot: GitHubStatusUiSnapshot = {
  prComponentStatus: 'operational',
  globalIndicator: 'none',
  fetchedAt: 1_700_000_000_000,
};

function setActivePayload(
  payload: GitHubOutagePayload,
  lastUntrustedAttemptAt: number | null = null
) {
  outageMock.state.isActive = true;
  outageMock.state.payload = payload;
  outageMock.state.lastUntrustedAttemptAt = lastUntrustedAttemptAt;
}

describe('<GitHubOutageBanner />', () => {
  beforeEach(() => {
    outageMock.state.isActive = false;
    outageMock.state.payload = null;
    outageMock.state.lastUntrustedAttemptAt = null;
    statusSnapshotMock.value = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing while inactive', () => {
    const { container } = render(<GitHubOutageBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the transport variant without a Statuspage link when no corroboration is cached', () => {
    setActivePayload(transportPayload);
    statusSnapshotMock.value = greenSnapshot;
    render(<GitHubOutageBanner />);

    expect(screen.getByText("GitHub didn't respond. Showing your last known list.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'githubstatus.com' })).toBeNull();
    expect(screen.queryByText(/Last check/)).toBeNull();
    expect(document.querySelector('[data-variant-id="outage.transport"]')).not.toBeNull();
  });

  it('renders the transport variant with a Statuspage link when the cached snapshot corroborates an incident', () => {
    setActivePayload(transportPayload);
    statusSnapshotMock.value = corroboratingSnapshot;
    render(<GitHubOutageBanner />);

    const link = screen.getByRole('link', { name: 'githubstatus.com' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://www.githubstatus.com');
  });

  it('renders the component-degraded variant with the time line but no Statuspage link by default', () => {
    setActivePayload(componentDegradedPayload, 5_000);
    statusSnapshotMock.value = greenSnapshot;
    render(<GitHubOutageBanner />);

    expect(screen.getByText('Pullwatch noticed an unusual change in your list.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'githubstatus.com' })).toBeNull();
    expect(screen.getByText(/Last check \(kept your cached list\)/)).toBeTruthy();
    expect(document.querySelector('[data-variant-id="outage.component-degraded"]')).not.toBeNull();
  });

  it('shows the Statuspage link for component-degraded only when the cached snapshot corroborates', () => {
    setActivePayload(componentDegradedPayload, 5_000);
    statusSnapshotMock.value = corroboratingSnapshot;
    render(<GitHubOutageBanner />);

    expect(screen.getByRole('link', { name: 'githubstatus.com' })).toBeTruthy();
  });

  it('renders the list-churn variant without a Statuspage link even when Statuspage corroborates', () => {
    setActivePayload(listChurnPayload);
    statusSnapshotMock.value = corroboratingSnapshot;
    render(<GitHubOutageBanner />);

    expect(screen.getByText('A pull request briefly disappeared and came back.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'githubstatus.com' })).toBeNull();
    expect(screen.queryByText(/Last check/)).toBeNull();
    expect(document.querySelector('[data-variant-id="outage.list-churn"]')).not.toBeNull();
  });

  it('omits the time line for transport even when lastUntrustedAttemptAt is somehow present', () => {
    setActivePayload(transportPayload, 5_000);
    render(<GitHubOutageBanner />);

    expect(screen.queryByText(/Last check/)).toBeNull();
  });
});
