import { useSpring, animated, config } from '@react-spring/web';
import clsx from 'clsx';

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
        'text-gray-500 hover:text-gray-700 hover:bg-gray-100 hover:cursor-pointer hover:scale-105',
        'disabled:opacity-50'
      )}
      aria-label="Refresh PRs"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    </animated.button>
  );
};
