import { createContext } from 'react';

export interface DebugInfoContextType {
  isDebugMode: boolean;
  clickCount: number;
  isDebugPending: boolean; // When user has clicked 4 times
  handleGithubClick: () => void;
  resetDebugMode: () => void;
}

export const DebugInfoContext = createContext<DebugInfoContextType | undefined>(undefined);
