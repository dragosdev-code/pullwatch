import { createContext, useContext, type ReactNode } from 'react';
import type { GameStore } from '../game-store';

const GameStoreContext = createContext<GameStore | null>(null);

export interface GameStoreProviderProps {
  store: GameStore;
  children: ReactNode;
}

/**
 * Wraps the React tree so cells can subscribe to the same vanilla zustand store the loop drives.
 * The store is supplied by the shell (which owns its lifetime via useRef) rather than created
 * here, so tests can inject a deterministic store and the shell can recreate the store cleanly
 * across mounts without context churn.
 */
export function GameStoreProvider({ store, children }: GameStoreProviderProps) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext);
  if (!store) {
    throw new Error('useGameStore must be used within GameStoreProvider');
  }
  return store;
}
