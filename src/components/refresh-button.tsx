import { useSpring, animated, config } from '@react-spring/web';
import clsx from 'clsx';
import { RefreshIcon } from './ui/icons';

interface RefreshButtonProps {
  isLoading: boolean;
  onRefresh: () => void;
}

export const RefreshButton = ({ isLoading, onRefresh }: RefreshButtonProps) => {
  const refreshSpring = useSpring({
    transform: isLoading ? 'rotate(360deg) scale(1.2)' : 'rotate(0deg) scale(1)',
    config: config.wobbly,
  });

  return (
    <animated.button
      style={refreshSpring}
      onClick={onRefresh}
      disabled={isLoading}
      className={clsx(
        'p-2 rounded-full transition-colors duration-200',
        'text-base-content/50 hover:text-base-content hover:bg-base-200 hover:cursor-pointer hover:scale-105',
        'disabled:opacity-50 disabled:pointer-events-none'
      )}
      aria-label="Refresh PRs"
    >
      <RefreshIcon width={18} height={18} />
    </animated.button>
  );
};
