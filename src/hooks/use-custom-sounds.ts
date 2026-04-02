import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CustomSoundMeta, CustomSoundId } from '../../extension/common/types';
import type { SoundDefinition } from '../../extension/common/sound-config';
import {
  STORAGE_KEY_CUSTOM_SOUNDS_META,
  CUSTOM_SOUND_STORAGE_PREFIX,
  MAX_CUSTOM_SOUNDS,
} from '../../extension/common/constants';
import { validateCustomSoundName } from '../../extension/common/custom-sound-name';

async function loadMeta(): Promise<CustomSoundMeta[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) return [];
  const result = await chrome.storage.local.get(STORAGE_KEY_CUSTOM_SOUNDS_META);
  return (result[STORAGE_KEY_CUSTOM_SOUNDS_META] as CustomSoundMeta[] | undefined) ?? [];
}

async function persistMeta(meta: CustomSoundMeta[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_SOUNDS_META]: meta });
}

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

  // Live reactivity via storage change listener
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !(STORAGE_KEY_CUSTOM_SOUNDS_META in changes)) return;
      const newVal = changes[STORAGE_KEY_CUSTOM_SOUNDS_META].newValue as
        | CustomSoundMeta[]
        | undefined;
      setCustomSounds(newVal ?? []);
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const canAddMore = customSounds.length < MAX_CUSTOM_SOUNDS;

  const saveCustomSound = useCallback(
    async (
      name: string,
      base64Wav: string,
      durationMs: number,
    ): Promise<CustomSoundId> => {
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

      await chrome.storage.local.set({ [storageKey]: base64Wav });
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

    await chrome.storage.local.remove(target.storageKey);
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
