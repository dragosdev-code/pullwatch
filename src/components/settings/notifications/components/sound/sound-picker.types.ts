import type { NotificationSound } from '@common/types';

export interface SoundPickerProps {
  /** Currently selected sound */
  value: NotificationSound;
  /** Called when user confirms selection */
  onChange: (sound: NotificationSound) => void;
  /** Called when modal should close */
  onClose: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when user clicks the "Custom" row to open the editor */
  onOpenCustomEditor?: () => void;
}
