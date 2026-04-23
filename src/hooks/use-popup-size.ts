import { useSyncedStorageValue } from './use-synced-storage-value';
import {
  DEFAULT_POPUP_SIZE_ID,
  POPUP_HEIGHT_CSS_VAR,
  POPUP_SIZE_PRESETS,
  POPUP_SIZE_STORAGE_KEY,
  POPUP_WIDTH_CSS_VAR,
  getPopupSizePreset,
  type PopupSizePresetId,
} from '../constants/popup-sizes';

const applyPresetToDocument = (id: PopupSizePresetId) => {
  if (typeof document === 'undefined') return;
  const preset = getPopupSizePreset(id);
  const root = document.documentElement;
  root.style.setProperty(POPUP_WIDTH_CSS_VAR, `${preset.width}px`);
  root.style.setProperty(POPUP_HEIGHT_CSS_VAR, `${preset.height}px`);
};

const validate = (raw: unknown): PopupSizePresetId =>
  getPopupSizePreset(typeof raw === 'string' ? raw : null).id;

export const usePopupSize = () => {
  const [presetId, setPreset] = useSyncedStorageValue<PopupSizePresetId>({
    key: POPUP_SIZE_STORAGE_KEY,
    defaultValue: DEFAULT_POPUP_SIZE_ID,
    validate,
    onApply: applyPresetToDocument,
  });
  return { presetId, presets: POPUP_SIZE_PRESETS, setPreset };
};
