import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SquashMinigameSection } from '../squash-minigame-section';
import type { MinigameStats } from '@common/types';
import type { GameMode } from '../../game-types';

const discoverMinigameStub = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const openSquashGameStub = vi.hoisted(() => vi.fn((_: GameMode) => undefined));
const beginSquashFromHeaderCtaStub = vi.hoisted(() => vi.fn());

const useSquashMinigameExperienceMock = vi.hoisted(() =>
  vi.fn<
    () => {
      stats: MinigameStats | null;
      ready: boolean;
      discoverMinigame: () => Promise<void>;
      openSquashGame: (mode: GameMode) => void;
      beginSquashFromHeaderCta: () => void;
    }
  >()
);

vi.mock('../../squash-minigame-experience-provider', () => ({
  useSquashMinigameExperience: useSquashMinigameExperienceMock,
}));

vi.mock('../neo-terminal-launcher', () => ({
  NeoTerminalLauncher: () => <div data-testid="neo-terminal-stub" />,
}));

beforeEach(() => {
  useSquashMinigameExperienceMock.mockReset();
  discoverMinigameStub.mockReset().mockResolvedValue(undefined);
  openSquashGameStub.mockReset();
  beginSquashFromHeaderCtaStub.mockReset();
});

function buildStats(overrides: Partial<MinigameStats>): MinigameStats {
  return {
    dataVersion: 2,
    hasDiscovered: false,
    hasSeenSquashQuickStart: false,
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
    useSquashMinigameExperienceMock.mockReturnValue({
      stats: null,
      ready: false,
      discoverMinigame: discoverMinigameStub,
      openSquashGame: openSquashGameStub,
      beginSquashFromHeaderCta: beginSquashFromHeaderCtaStub,
    });
    const { container } = render(<SquashMinigameSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the user has not discovered the minigame', () => {
    useSquashMinigameExperienceMock.mockReturnValue({
      stats: buildStats({ hasDiscovered: false }),
      ready: true,
      discoverMinigame: discoverMinigameStub,
      openSquashGame: openSquashGameStub,
      beginSquashFromHeaderCta: beginSquashFromHeaderCtaStub,
    });
    const { container } = render(<SquashMinigameSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the launcher once stats indicate discovery', () => {
    useSquashMinigameExperienceMock.mockReturnValue({
      stats: buildStats({ hasDiscovered: true }),
      ready: true,
      discoverMinigame: discoverMinigameStub,
      openSquashGame: openSquashGameStub,
      beginSquashFromHeaderCta: beginSquashFromHeaderCtaStub,
    });
    render(<SquashMinigameSection />);
    expect(screen.getByTestId('neo-terminal-stub')).toBeTruthy();
    expect(screen.getByText('Squash the Bugs')).toBeTruthy();
  });
});
