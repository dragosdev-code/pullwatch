import type { LinkOpenBehavior } from '@src/hooks/use-link-behavior';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../ui/segmented-control/segmented-control';

interface LinkBehaviorFieldProps {
  value: LinkOpenBehavior;
  onChange: (value: LinkOpenBehavior) => void;
}

const OPTIONS: readonly SegmentedOption<LinkOpenBehavior>[] = [
  { value: 'foreground', label: 'Foreground', description: 'Switch to new tab, close popup' },
  { value: 'background', label: 'Background', description: 'Open silently, keep popup open' },
];

export const LinkBehaviorField = ({ value, onChange }: LinkBehaviorFieldProps) => (
  <SegmentedControl<LinkOpenBehavior>
    label="Link opening behavior"
    hint="Choose how PR links open when clicked"
    options={OPTIONS}
    value={value}
    onChange={onChange}
  />
);
