import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { DebugInfoContext, type DebugInfoContextType } from './context';

const STORAGE_KEY = 'pr-extension-debug-mode';

interface DebugInfoProviderProps {
  children: ReactNode;
}

export function DebugInfoProvider({ children }: DebugInfoProviderProps) {
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [isDebugPending, setIsDebugPending] = useState(false);

  // Load debug mode state from Chrome storage on mount
  useEffect(() => {
    const loadDebugState = async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          const result = await chrome.storage.local.get(STORAGE_KEY);
          const savedDebugMode = result[STORAGE_KEY] || false;
          setIsDebugMode(savedDebugMode);
        }
      } catch (error) {
        console.warn('Failed to load debug state from storage:', error);
      }
    };

    loadDebugState();
  }, []);

  // Save debug mode state to Chrome storage whenever it changes
  useEffect(() => {
    const saveDebugState = async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          await chrome.storage.local.set({ [STORAGE_KEY]: isDebugMode });
        }
      } catch (error) {
        console.warn('Failed to save debug state to storage:', error);
      }
    };

    saveDebugState();
  }, [isDebugMode]);

  const handleGithubClick = () => {
    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);

    if (newClickCount === 4) {
      // 4th click - show pending state
      setIsDebugPending(true);
      console.log('🔧 Debug mode pending - click once more to activate');
    } else if (newClickCount === 5) {
      // 5th click - activate debug mode
      setIsDebugMode(true);
      setIsDebugPending(false);
      setClickCount(0); // Reset counter
      console.log('🚀 Debug mode activated!');
    } else if (newClickCount === 1 && isDebugMode) {
      // 6th click (1st click when debug is active) - deactivate debug mode
      setIsDebugMode(false);
      setIsDebugPending(false);
      setClickCount(0); // Reset counter
      console.log('🔒 Debug mode deactivated');
    } else if (newClickCount >= 6) {
      // Reset if too many clicks without activating
      setClickCount(0);
      setIsDebugPending(false);
    }

    // Auto-reset click count after 3 seconds of inactivity
    setTimeout(() => {
      setClickCount((current) => {
        if (current === newClickCount) {
          // Only reset if no new clicks happened
          setIsDebugPending(false);
          return 0;
        }
        return current;
      });
    }, 3000);
  };

  const resetDebugMode = () => {
    setIsDebugMode(false);
    setIsDebugPending(false);
    setClickCount(0);
  };

  const value: DebugInfoContextType = {
    isDebugMode,
    clickCount,
    isDebugPending,
    handleGithubClick,
    resetDebugMode,
  };

  return <DebugInfoContext.Provider value={value}>{children}</DebugInfoContext.Provider>;
}
