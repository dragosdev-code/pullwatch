import { useRef, useState, useCallback } from 'react';

const SAVED_INDICATOR_VISIBLE_MS = 1500;

export const useSavedIndicator = () => {
  const [visible, setVisible] = useState(false);
  const [flashId, setFlashId] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setFlashId((n) => n + 1);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), SAVED_INDICATOR_VISIBLE_MS);
  }, []);

  return { visible, flash, flashId };
};
