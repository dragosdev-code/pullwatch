export type PopupSizePresetId = 'compact' | 'cozy' | 'comfortable';

export interface PopupSizePreset {
  id: PopupSizePresetId;
  label: string;
  description: string;
  width: number;
  height: number;
}

export const POPUP_SIZE_PRESETS: readonly PopupSizePreset[] = [
  { id: 'compact', label: 'Compact', description: '380 × 400', width: 380, height: 400 },
  { id: 'cozy', label: 'Cozy', description: '418 × 440', width: 418, height: 440 },
  { id: 'comfortable', label: 'Comfortable', description: '456 × 480', width: 456, height: 480 },
] as const;

export const DEFAULT_POPUP_SIZE_ID: PopupSizePresetId = 'compact';

export const POPUP_SIZE_STORAGE_KEY = 'pr-extension-popup-size';
export const POPUP_WIDTH_CSS_VAR = '--pw-popup-width';
export const POPUP_HEIGHT_CSS_VAR = '--pw-popup-height';

export const getPopupSizePreset = (id: string | null | undefined): PopupSizePreset => {
  const match = POPUP_SIZE_PRESETS.find((preset) => preset.id === id);
  return match ?? POPUP_SIZE_PRESETS.find((p) => p.id === DEFAULT_POPUP_SIZE_ID)!;
};
