import { useDebugStore } from '@src/stores/debug';
import { DiagnosticsPromptModal } from './diagnostics-prompt-modal';
import { useMergedTabChordActivation } from './use-merged-tab-chord-activation';

export function DiagnosticsSurface() {
  const mergedTabButton = useDebugStore((s) => s.chordSlotElement);
  useMergedTabChordActivation(mergedTabButton);
  return <DiagnosticsPromptModal />;
}
