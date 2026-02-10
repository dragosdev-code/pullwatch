export interface GlobalErrorState {
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
}
