import { MAX_CUSTOM_SOUND_NAME_LENGTH } from './constants';
import { SOUND_DEFINITIONS } from './sound-config';

/** Allowed: A–Z, a–z, 0–9, space, and ' - . , */
const ALLOWED_NAME_PATTERN = /^[A-Za-z0-9 \-',.]+$/;

const RESERVED_LOWER = new Set(
  SOUND_DEFINITIONS.filter((d) => d.id !== 'off').map((d) => d.name.trim().toLowerCase()),
);
RESERVED_LOWER.add('off');

export type ValidateCustomSoundNameContext = {
  existingNames: string[];
};

export type ValidateCustomSoundNameResult =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

/**
 * Validates a custom notification sound display name.
 * `normalized` is trim-only; storage should use it when ok.
 */
export function validateCustomSoundName(
  raw: string,
  ctx: ValidateCustomSoundNameContext,
): ValidateCustomSoundNameResult {
  const normalized = raw.trim();

  if (normalized.length === 0) {
    return { ok: false, message: 'Enter a sound name.' };
  }

  if (normalized.length > MAX_CUSTOM_SOUND_NAME_LENGTH) {
    return {
      ok: false,
      message: `Name must be at most ${MAX_CUSTOM_SOUND_NAME_LENGTH} characters.`,
    };
  }

  if (!ALLOWED_NAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      message: 'Use only letters, numbers, spaces, and . , - \'.',
    };
  }

  if (!/[A-Za-z]/.test(normalized)) {
    return { ok: false, message: 'Include at least one letter (A–Z).' };
  }

  const lower = normalized.toLowerCase();
  if (RESERVED_LOWER.has(lower)) {
    return {
      ok: false,
      message: 'That name is reserved for a built-in sound. Choose another name.',
    };
  }

  const taken = ctx.existingNames.some((n) => n.trim().toLowerCase() === lower);
  if (taken) {
    return { ok: false, message: 'You already have a custom sound with this name.' };
  }

  return { ok: true, normalized };
}
