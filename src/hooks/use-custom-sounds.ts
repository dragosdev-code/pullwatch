import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CustomSoundMeta, CustomSoundId } from '../../extension/common/types';
import type { SoundDefinition } from '../../extension/common/sound-config';
import {
  STORAGE_KEY_CUSTOM_SOUNDS_META,
  CUSTOM_SOUND_STORAGE_PREFIX,
  MAX_CUSTOM_SOUNDS,
} from '../../extension/common/constants';
import { validateCustomSoundName } from '../../extension/common/custom-sound-name';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';

/**
 * Custom sounds: metadata list in `custom_sounds_meta`, WAV bytes per slot in `custom_sound_{n}`.
 * WHY split storage: chrome.storage.sync (settings) only references ids like `custom_1`; large Base64
 * WAVs stay in local so sync quota isn’t blown and the service worker can read bytes for offscreen.
 */

/** WHY guard: hook runs in unit tests / Storybook without extension APIs—return empty instead of throwing. */
async function loadMeta(): Promise<CustomSoundMeta[]> {
  if (!chromeExtensionService.isExtensionContext()) return [];
  const result = await chromeExtensionService.storage.local.get(STORAGE_KEY_CUSTOM_SOUNDS_META);
  return (result[STORAGE_KEY_CUSTOM_SOUNDS_META] as CustomSoundMeta[] | undefined) ?? [];
}

async function persistMeta(meta: CustomSoundMeta[]): Promise<void> {
  await chromeExtensionService.storage.local.set({ [STORAGE_KEY_CUSTOM_SOUNDS_META]: meta });
}

/**
 * Picks the smallest unused slot in `1..MAX_CUSTOM_SOUNDS`.
 * WHY not monotonic ids: after deleting `custom_1`, the next save should reuse slot 1 so we don’t
 * leave “holes” forever and settings that still say `custom_1` (sync) can match a real clip again.
 * The service worker resolves sound by slot number → `custom_sound_{slot}` key.
 */
function nextAvailableSlot(existing: CustomSoundMeta[]): number {
  const usedSlots = new Set(existing.map((m) => parseInt(m.id.replace('custom_', ''), 10)));
  for (let i = 1; i <= MAX_CUSTOM_SOUNDS + 1; i++) {
    if (!usedSlots.has(i)) return i;
  }
  return existing.length + 1;
}

export function useCustomSounds() {
  const [customSounds, setCustomSounds] = useState<CustomSoundMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMeta().then((meta) => {
      setCustomSounds(meta);
      setIsLoading(false);
    });
  }, []);

  /**
   * WHY listen: another UI surface (e.g. sound picker vs editor) or the same app in another frame
   * can write `custom_sounds_meta`; without this, React state would stay stale until remount.
   */
  useEffect(() => {
    if (!chromeExtensionService.isExtensionContext()) return;

    const listener = (
      changes: { [key: string]: StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !(STORAGE_KEY_CUSTOM_SOUNDS_META in changes)) return;
      const newVal = changes[STORAGE_KEY_CUSTOM_SOUNDS_META].newValue as
        | CustomSoundMeta[]
        | undefined;
      setCustomSounds(newVal ?? []);
    };

    chromeExtensionService.storage.onChanged.addListener(listener);
    return () => chromeExtensionService.storage.onChanged.removeListener(listener);
  }, []);

  /** WHY length-based: slot reuse means “free slot” ≠ “under max count”; cap is total clips, not highest id. */
  const canAddMore = customSounds.length < MAX_CUSTOM_SOUNDS;

  const saveCustomSound = useCallback(
    async (
      name: string,
      base64Wav: string,
      durationMs: number,
    ): Promise<CustomSoundId> => {
      // WHY reload from disk: two saves in parallel must see each other’s meta, not stale React state.
      const current = await loadMeta();
      if (current.length >= MAX_CUSTOM_SOUNDS) {
        throw new Error(`Maximum of ${MAX_CUSTOM_SOUNDS} custom sounds reached`);
      }

      const validated = validateCustomSoundName(name, {
        existingNames: current.map((m) => m.name),
      });
      if (!validated.ok) {
        throw new Error(validated.message);
      }

      const slot = nextAvailableSlot(current);
      const id = `custom_${slot}` as CustomSoundId;
      const storageKey = `${CUSTOM_SOUND_STORAGE_PREFIX}${slot}`;

      const meta: CustomSoundMeta = {
        id,
        name: validated.normalized,
        durationMs,
        createdAt: new Date().toISOString(),
        storageKey,
      };

      const updated = [...current, meta];

      // WHY WAV before meta: background/offscreen read meta then load by `storageKey`; meta pointing at missing WAV causes orphan/fallback noise.
      await chromeExtensionService.storage.local.set({ [storageKey]: base64Wav });
      await persistMeta(updated);
      setCustomSounds(updated);

      return id;
    },
    [],
  );

  const deleteCustomSound = useCallback(async (id: CustomSoundId): Promise<void> => {
    const current = await loadMeta();
    const target = current.find((m) => m.id === id);
    if (!target) return;

    const updated = current.filter((m) => m.id !== id);

    // WHY remove WAV key: free disk; slot becomes eligible again via `nextAvailableSlot`.
    await chromeExtensionService.storage.local.remove(target.storageKey);
    await persistMeta(updated);
    setCustomSounds(updated);
  }, []);

  const getCustomSoundDefinition = useCallback(
    (id: CustomSoundId): SoundDefinition | undefined => {
      const meta = customSounds.find((m) => m.id === id);
      if (!meta) return undefined;
      return {
        id: meta.id,
        name: meta.name,
        description: `Custom sound (${(meta.durationMs / 1000).toFixed(1)}s)`,
        color: 'primary',
      };
    },
    [customSounds],
  );

  /** WHY map: sync settings only store `custom_*` ids—labels for picker rows come from meta, not from ids. */
  const resolveDisplayName = useMemo(() => {
    const map = new Map(customSounds.map((m) => [m.id, m.name]));
    return (soundId: string): string | undefined => map.get(soundId as CustomSoundId);
  }, [customSounds]);

  return {
    customSounds,
    isLoading,
    canAddMore,
    saveCustomSound,
    deleteCustomSound,
    getCustomSoundDefinition,
    resolveDisplayName,
  };
}
