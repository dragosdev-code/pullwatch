import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NeoTerminalLauncher } from '../neo-terminal-launcher';
import { ensureCompleteMinigameStats } from '../../storage/minigame-stats-defaults';

vi.mock('../../squash-minigame.lazy', () => ({
  SquashMinigameLazy: ({
    mode,
    onExit,
    onFinish,
    onChangeMode: _onChangeMode,
  }: {
    mode: string;
    onExit?: () => void;
    onFinish?: (s: {
      mode: string;
      roundId: number;
      score: number;
      highestCombo: number;
      bugsSquashed: number;
      featuresBroken: number;
      durationSeconds: number;
    }) => void;
    onChangeMode?: (m: string) => void;
  }) => (
    <div data-testid="squash-lazy-stub">
      <span data-testid="squash-lazy-mode">{mode}</span>
      <button type="button" data-testid="squash-lazy-exit" onClick={onExit}>
        exit
      </button>
      <button
        type="button"
        data-testid="squash-lazy-finish"
        onClick={() =>
          onFinish?.({
            mode,
            roundId: 1,
            score: 70,
            highestCombo: 5,
            bugsSquashed: 7,
            featuresBroken: 1,
            durationSeconds: 30,
          })
        }
      >
        finish
      </button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NeoTerminalLauncher menu', () => {
  it('renders all four mode buttons with their per mode stats', () => {
    const stats = ensureCompleteMinigameStats({
      hasDiscovered: true,
      modes: {
        standard: { playCount: 3, highScore: 90, highestCombo: 5 },
        legacy: { playCount: 1, highScore: 40, highestCombo: 2 },
        scopeCreep: { playCount: 0, highScore: 0, highestCombo: 0 },
        fridayDeploy: { playCount: 7, highScore: 220, highestCombo: 11 },
      },
    } as never);

    render(<NeoTerminalLauncher stats={stats} />);

    expect(screen.getByTestId('neo-terminal-mode-standard')).toBeTruthy();
    expect(screen.getByTestId('neo-terminal-mode-legacy')).toBeTruthy();
    expect(screen.getByTestId('neo-terminal-mode-scopeCreep')).toBeTruthy();
    expect(screen.getByTestId('neo-terminal-mode-fridayDeploy')).toBeTruthy();

    const statsPanel = screen.getByTestId('neo-terminal-stats-fridayDeploy');
    expect(statsPanel.textContent).toContain('220');
    expect(statsPanel.textContent).toContain('Plays');
    expect(statsPanel.textContent).toContain('High score');
    expect(statsPanel.textContent).toContain('Peak combo');
    expect(statsPanel.textContent).toMatch(/7/);
    expect(statsPanel.textContent).toContain('×11');
  });

  it('renders overall lifetime totals in the footer', () => {
    const stats = ensureCompleteMinigameStats({
      hasDiscovered: true,
      overall: {
        totalBugsSquashed: 42,
        totalFeaturesBroken: 5,
        totalTimePlayedSeconds: 180,
      },
    } as never);
    render(<NeoTerminalLauncher stats={stats} />);
    const footer = screen.getByTestId('neo-terminal-overall');
    expect(footer.textContent).toContain('bugs 42');
    expect(footer.textContent).toContain('features 5');
    expect(footer.textContent).toContain('played 180s');
  });

  it('marks the last played mode with a last badge', () => {
    const stats = ensureCompleteMinigameStats({
      hasDiscovered: true,
      lastPlayedMode: 'legacy',
    } as never);
    render(<NeoTerminalLauncher stats={stats} />);
    const button = screen.getByTestId('neo-terminal-mode-legacy');
    expect(button.textContent?.toLowerCase()).toContain('last');
  });

  it('delegates to onRequestPlayMode instead of mounting inline when provided', () => {
    const stats = ensureCompleteMinigameStats({ hasDiscovered: true } as never);
    const onRequestPlayMode = vi.fn();
    render(<NeoTerminalLauncher stats={stats} onRequestPlayMode={onRequestPlayMode} />);

    fireEvent.click(screen.getByTestId('neo-terminal-mode-fridayDeploy'));

    expect(onRequestPlayMode).toHaveBeenCalledWith('fridayDeploy');
    expect(screen.queryByTestId('neo-terminal-active')).toBeNull();
  });

  it('mounts the lazy game shell with the chosen mode when a button is clicked (inline)', () => {
    const stats = ensureCompleteMinigameStats({ hasDiscovered: true } as never);
    render(<NeoTerminalLauncher stats={stats} />);

    fireEvent.click(screen.getByTestId('neo-terminal-mode-fridayDeploy'));

    expect(screen.getByTestId('neo-terminal-active')).toBeTruthy();
    expect(screen.getByTestId('squash-lazy-mode').textContent).toBe('fridayDeploy');
  });

  it('returns to the menu when the shell calls onExit', () => {
    const stats = ensureCompleteMinigameStats({ hasDiscovered: true } as never);
    render(<NeoTerminalLauncher stats={stats} />);
    fireEvent.click(screen.getByTestId('neo-terminal-mode-standard'));
    fireEvent.click(screen.getByTestId('squash-lazy-exit'));
    expect(screen.queryByTestId('neo-terminal-active')).toBeNull();
    expect(screen.getByTestId('neo-terminal-menu')).toBeTruthy();
  });

  it('forwards finished round summaries to the recorder', async () => {
    const stats = ensureCompleteMinigameStats({ hasDiscovered: true } as never);
    const recorder = vi.fn();
    render(<NeoTerminalLauncher stats={stats} recordRoundResult={recorder} />);
    fireEvent.click(screen.getByTestId('neo-terminal-mode-standard'));
    fireEvent.click(screen.getByTestId('squash-lazy-finish'));
    await waitFor(() => expect(recorder).toHaveBeenCalledTimes(1));
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'standard', score: 70, highestCombo: 5 })
    );
  });
});
