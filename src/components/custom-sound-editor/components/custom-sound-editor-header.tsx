import { ChevronIcon } from '../../ui/icons';

interface CustomSoundEditorHeaderProps {
  onClose: () => void;
}

export const CustomSoundEditorHeader = ({ onClose }: CustomSoundEditorHeaderProps) => (
  <div className="px-5 py-4 border-b border-base-200 flex items-center gap-3 shrink-0">
    <button
      type="button"
      onClick={onClose}
      className="btn btn-ghost btn-sm btn-circle"
      aria-label="Close"
    >
      <ChevronIcon className="size-4 rotate-90" />
    </button>
    <div>
      <h3 className="font-semibold text-base-content">Custom Sound</h3>
      <p className="text-xs text-base-content/60">Upload and trim your own notification sound</p>
    </div>
  </div>
);
