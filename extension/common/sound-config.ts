// extension/common/sound-config.ts
// Shared sound configuration used by both offscreen document and frontend

import type { NotificationSound } from './types';

/**
 * Sound preset configuration for Web Audio API playback.
 * Defines the audio characteristics of each notification sound.
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
  /** Visual icon type for the sound */
  icon: 'wave' | 'bell' | 'mute';
  /** Color accent for the sound in the UI */
  color: 'primary' | 'secondary' | 'neutral';
}

/**
 * Sound presets for active notification sounds.
 * Used by the offscreen document to generate audio.
 */
export const SOUND_PRESETS: Record<Exclude<NotificationSound, 'off'>, SoundPreset> = {
  ping: {
    times: [0, 0.12],
    frequencies: [880, 1100], // Higher, sharper tones (A5, C#6)
    duration: 0.08,
    initialGain: 0.25,
    oscillatorType: 'sine',
  },
  bell: {
    times: [0, 0.25, 0.5],
    frequencies: [523, 659, 784], // Lower, bell-like tones (C5, E5, G5)
    duration: 0.15,
    initialGain: 0.35,
    oscillatorType: 'triangle', // Triangle wave sounds more bell-like
  },
};

/**
 * Sound definitions for UI display.
 * Includes all sounds including 'off' option.
 */
export const SOUND_DEFINITIONS: SoundDefinition[] = [
  {
    id: 'ping',
    name: 'Ping',
    description: 'Quick, high-pitched digital tone',
    icon: 'wave',
    color: 'primary',
  },
  {
    id: 'bell',
    name: 'Bell',
    description: 'Soft, melodic bell chime',
    icon: 'bell',
    color: 'secondary',
  },
  {
    id: 'off',
    name: 'Off',
    description: 'No notification sound',
    icon: 'mute',
    color: 'neutral',
  },
];

/**
 * Get the sound definition for a specific sound ID.
 * @param soundId - The notification sound identifier
 * @returns The sound definition or undefined if not found
 */
export function getSoundDefinition(soundId: NotificationSound): SoundDefinition | undefined {
  return SOUND_DEFINITIONS.find((def) => def.id === soundId);
}

/**
 * Get the sound preset for a specific sound ID.
 * @param soundId - The notification sound identifier
 * @returns The sound preset or undefined if not found (e.g., for 'off')
 */
export function getSoundPreset(
  soundId: NotificationSound
): SoundPreset | undefined {
  if (soundId === 'off') return undefined;
  return SOUND_PRESETS[soundId];
}

/**
 * Get all available sound IDs except 'off'.
 * Useful for iterating over playable sounds.
 * @returns Array of playable sound IDs
 */
export function getPlayableSoundIds(): Exclude<NotificationSound, 'off'>[] {
  return ['ping', 'bell'];
}

/**
 * Check if a sound is playable (not 'off').
 * @param soundId - The notification sound identifier
 * @returns True if the sound can be played
 */
export function isPlayableSound(soundId: NotificationSound): boolean {
  return soundId !== 'off';
}
