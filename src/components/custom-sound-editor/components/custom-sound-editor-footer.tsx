interface CustomSoundEditorFooterProps {
  onClose: () => void;
  onSave: () => void;
  canSave: boolean;
  isSaving: boolean;
}

export const CustomSoundEditorFooter = ({
  onClose,
  onSave,
  canSave,
  isSaving,
}: CustomSoundEditorFooterProps) => (
  <div className="px-5 py-3 border-t border-base-200 bg-base-100 flex justify-end gap-2 shrink-0">
    <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
      Cancel
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={!canSave}
      className="btn btn-sm btn-primary"
    >
      {isSaving ? <span className="loading loading-spinner loading-sm" /> : 'Save Sound'}
    </button>
  </div>
);
