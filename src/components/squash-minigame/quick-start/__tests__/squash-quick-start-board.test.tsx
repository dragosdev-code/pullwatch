import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SquashQuickStartBoard } from '../squash-quick-start-board';

describe('SquashQuickStartBoard', () => {
  it('calls onStart with the selected mode when Start is pressed', () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <SquashQuickStartBoard lastPlayedMode="legacy" onStart={onStart} onClose={onClose} />
    );

    fireEvent.click(screen.getByTestId('squash-quick-start-mode-fridayDeploy'));
    fireEvent.click(screen.getByTestId('squash-quick-start-start'));

    expect(onStart).toHaveBeenCalledWith('fridayDeploy');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Close is pressed', () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(<SquashQuickStartBoard onStart={onStart} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('squash-quick-start-close'));

    expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
});
