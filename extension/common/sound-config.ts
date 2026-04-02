// extension/common/sound-config.ts
// Shared sound configuration used by both offscreen document and frontend

import type { NotificationSound, BuiltInSound } from './types';

/**
 * Sound preset configuration for Web Audio API playback.
 * Defines the audio characteristics of each built-in notification sound.
 */
export interface SoundPreset {
  /** Start times for each tone in the sequence (seconds) */
  times: number[];
  /** Frequencies for each tone (Hz) */
  frequencies: number[];
  /** Duration of each individual tone (seconds) */
  duration: number;
  /** Initial volume level (0-1) */
  initialGain: number;
  /** Oscillator waveform type */
  oscillatorType: OscillatorType;
}

/**
 * Metadata for displaying sounds in the UI.
 * User-friendly names, descriptions, and visual indicators.
 */
export interface SoundDefinition {
  /** The sound identifier */
  id: NotificationSound;
  /** Display name for the sound */
  name: string;
  /** Brief description of the sound character */
  description: string;
  /** Color accent for the sound in the UI */
  color: 'primary' | 'secondary' | 'neutral';
}

/**
 * Sound presets for built-in notification sounds.
 * Used by the offscreen document to generate audio via oscillators.
 */
export const SOUND_PRESETS: Record<BuiltInSound, SoundPreset> = {
  ping: {
    times: [0, 0.12],
    frequencies: [880, 1100],
    duration: 0.08,
    initialGain: 0.25,
    oscillatorType: 'sine',
  },
  bell: {
    times: [0, 0.25, 0.5],
    frequencies: [523, 659, 784],
    duration: 0.15,
    initialGain: 0.35,
    oscillatorType: 'triangle',
  },
};

/**
 * Built-in sound definitions for UI display.
 * Custom sounds are loaded dynamically from storage and are not in this array.
 */
export const SOUND_DEFINITIONS: SoundDefinition[] = [
  {
    id: 'ping',
    name: 'Ping',
    description: 'Quick, high-pitched digital tone',
    color: 'primary',
  },
  {
    id: 'bell',
    name: 'Bell',
    description: 'Soft, melodic bell chime',
    color: 'secondary',
  },
  {
    id: 'off',
    name: 'Off',
    description: 'No notification sound',
    color: 'neutral',
  },
];

export function isCustomSoundId(soundId: NotificationSound): soundId is `custom_${number}` {
  return typeof soundId === 'string' && /^custom_\d+$/.test(soundId);
}

export function isBuiltInSound(soundId: NotificationSound): soundId is BuiltInSound {
  return soundId === 'ping' || soundId === 'bell';
}

export function getSoundDefinition(soundId: NotificationSound): SoundDefinition | undefined {
  return SOUND_DEFINITIONS.find((def) => def.id === soundId);
}

export function getSoundPreset(soundId: NotificationSound): SoundPreset | undefined {
  if (isBuiltInSound(soundId)) {
    return SOUND_PRESETS[soundId];
  }
  return undefined;
}

export function getBuiltInSoundIds(): BuiltInSound[] {
  return ['ping', 'bell'];
}

export function isPlayableSound(soundId: NotificationSound): boolean {
  return soundId !== 'off';
}
