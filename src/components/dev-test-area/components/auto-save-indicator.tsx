import { CheckIcon } from '@heroicons/react/24/outline';
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
      <CheckIcon className="w-3 h-3" />
      Saved!
    </span>
  );
};
