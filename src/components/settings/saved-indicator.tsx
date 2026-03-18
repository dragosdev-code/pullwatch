import { useTransition, animated } from '@react-spring/web';

interface SavedIndicatorProps {
  visible: boolean;
}

export const SavedIndicator = ({ visible }: SavedIndicatorProps) => {
  const transitions = useTransition(visible, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: 200 },
  });

  return transitions((style, show) =>
    show ? (
      <animated.div style={style} className="flex items-center gap-1 ml-auto">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
          className="size-3 text-primary"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        <span className="text-[11px] text-base-content/50">Saved</span>
      </animated.div>
    ) : null
  );
};
