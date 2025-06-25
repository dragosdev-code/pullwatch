import { useContext } from 'react';
import { DebugInfoContext, type DebugInfoContextType } from '../contexts/debugInfo/context';

export function useDebug(): DebugInfoContextType {
  const context = useContext(DebugInfoContext);
  if (context === undefined) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
}
