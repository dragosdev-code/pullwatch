export interface DebugState {
  isDebugMode: boolean;
  clickCount: number;
  isDebugPending: boolean;
  handleGithubClick: () => void;
  resetDebugMode: () => void;
}
