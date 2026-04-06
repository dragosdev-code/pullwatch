export interface DebugState {
  isDebugMode: boolean;
  setDebugMode: (value: boolean) => void;
  resetDebugMode: () => void;
  chordSlotElement: HTMLButtonElement | null;
  bindChordSlot: (el: HTMLButtonElement | null) => void;
  diagnosticsPromptOpen: boolean;
  openDiagnosticsPrompt: () => void;
  closeDiagnosticsPrompt: () => void;
}
