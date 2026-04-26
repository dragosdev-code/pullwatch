import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SquashMinigameSection } from '../squash-minigame-section';
import type { MinigameStats } from '@common/types';

const useMinigameDiscoveryMock = vi.hoisted(() =>
  vi.fn<() => { stats: MinigameStats | null; ready: boolean }>()
);

vi.mock('../../hooks/use-minigame-discovery', () => ({
  useMinigameDiscovery: useMinigameDiscoveryMock,
}));

vi.mock('../neo-terminal-launcher', () => ({
  NeoTerminalLauncher: () => <div data-testid="neo-terminal-stub" />,
}));

beforeEach(() => {
  useMinigameDiscoveryMock.mockReset();
});

function buildStats(overrides: Partial<MinigameStats>): MinigameStats {
  return {
    hasDiscovered: false,
    popupOpenCount: 0,
    overall: { totalBugsSquashed: 0, totalFeaturesBroken: 0, totalTimePlayedSeconds: 0 },
    modes: {
      standard: { playCount: 0, highScore: 0, highestCombo: 0 },
      legacy: { playCount: 0, highScore: 0, highestCombo: 0 },
      scopeCreep: { playCount: 0, highScore: 0, highestCombo: 0 },
      fridayDeploy: { playCount: 0, highScore: 0, highestCombo: 0 },
    },
    ...overrides,
  };
}

describe('SquashMinigameSection', () => {
  it('renders nothing while stats are still hydrating', () => {
    useMinigameDiscoveryMock.mockReturnValue({ stats: null, ready: false });
    const { container } = render(<SquashMinigameSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the user has not discovered the minigame', () => {
    useMinigameDiscoveryMock.mockReturnValue({
      stats: buildStats({ hasDiscovered: false }),
      ready: true,
    });
    const { container } = render(<SquashMinigameSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the launcher once stats indicate discovery', () => {
    useMinigameDiscoveryMock.mockReturnValue({
      stats: buildStats({ hasDiscovered: true }),
      ready: true,
    });
    render(<SquashMinigameSection />);
    expect(screen.getByTestId('neo-terminal-stub')).toBeTruthy();
    expect(screen.getByText('Squash the Bugs')).toBeTruthy();
  });
});
