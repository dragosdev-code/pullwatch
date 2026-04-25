import { createStore } from 'zustand/vanilla';
import { MAX_CUSTOM_SOUND_DURATION_S } from '@common/constants';
import { getWaveformPeaks } from '../utils/audio-utils';

/**
 * Draft audio loaded into the editor: waveform source, display label, and trim range.
 * Kept separate from delete-confirmation and save-pipeline state so reset/trim logic
 * cannot accidentally clear unrelated UI (see architecture plan).
 */
export type AudioDraftSlice = {
  audioBuffer: AudioBuffer | null;
  peaks: number[];
  /** Display label for the loaded file (next to "Change file"); draft metadata only. */
  fileName: string;
  startS: number;
  endS: number;
};

export type AudioDraftActions = {
  setStartS: (v: number) => void;
  setEndS: (v: number) => void;
  reset: () => void;
  applyDecoded: (buffer: AudioBuffer, fileLabel: string) => void;
};

export type AudioDraftState = AudioDraftSlice & AudioDraftActions;

const initialSlice: AudioDraftSlice = {
  audioBuffer: null,
  peaks: [],
  fileName: '',
  startS: 0,
  endS: 0,
};

export function createAudioDraftStore() {
  return createStore<AudioDraftState>()((set) => ({
    ...initialSlice,
    setStartS: (startS) => set({ startS }),
    setEndS: (endS) => set({ endS }),
    reset: () => set(initialSlice),
    applyDecoded: (buffer, fileLabel) =>
      set({
        audioBuffer: buffer,
        peaks: getWaveformPeaks(buffer, 120),
        fileName: fileLabel,
        startS: 0,
        endS: Math.min(buffer.duration, MAX_CUSTOM_SOUND_DURATION_S),
      }),
  }));
}

export type AudioDraftStore = ReturnType<typeof createAudioDraftStore>;
