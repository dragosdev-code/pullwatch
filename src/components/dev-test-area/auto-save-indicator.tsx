import { useEffect, useRef, useState } from 'react';

interface AutoSaveIndicatorProps {
  revision: number;
}

export const AutoSaveIndicator = ({ revision }: AutoSaveIndicatorProps) => {
  const mountedRevision = useRef(revision);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (revision === mountedRevision.current) return;
    mountedRevision.current = revision;

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1400);
    return () => clearTimeout(timer);
  }, [revision]);

  if (!visible) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium ml-1.5 select-none">
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      Saved!
    </span>
  );
};
