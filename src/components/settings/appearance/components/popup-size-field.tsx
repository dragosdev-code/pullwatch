import { useMemo } from 'react';
import { usePopupSize } from '../../../../hooks/use-popup-size';
import type { PopupSizePresetId } from '../../../../constants/popup-sizes';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../ui/segmented-control/segmented-control';

export const PopupSizeField = () => {
  const { presetId, presets, setPreset } = usePopupSize();

  const options = useMemo<readonly SegmentedOption<PopupSizePresetId>[]>(
    () =>
      presets.map((preset) => ({
        value: preset.id,
        label: preset.label,
        description: preset.description,
      })),
    [presets]
  );

  return (
    <SegmentedControl<PopupSizePresetId>
      label="Popup size"
      hint="Resize the extension popup shell"
      options={options}
      value={presetId}
      onChange={setPreset}
    />
  );
};
