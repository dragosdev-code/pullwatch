import type { RefObject } from 'react';

interface CustomSoundUploadAreaProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (file: File | undefined) => void;
}

export const CustomSoundUploadArea = ({
  fileInputRef,
  onFileChange,
}: CustomSoundUploadAreaProps) => (
  <div className="space-y-2">
    <input
      ref={fileInputRef}
      type="file"
      accept="audio/*"
      onChange={(e) => onFileChange(e.target.files?.[0])}
      className="file-input file-input-bordered file-input-sm w-full"
    />
    <p className="text-xs text-base-content/50 text-center">
      MP3, WAV, OGG &mdash; max 10MB
    </p>
  </div>
);
