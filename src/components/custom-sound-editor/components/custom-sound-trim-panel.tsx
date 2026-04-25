import { MAX_CUSTOM_SOUND_DURATION_S } from '@common/constants';
import { PlayIcon, PauseIcon } from '../../ui/icons';
import { TruncatedOneLineWithTooltip } from '../../ui/truncated-one-line-with-tooltip';
import { WaveformScroller } from './waveform-scroller';

interface CustomSoundTrimPanelProps {
  fileName: string;
  peaks: number[];
  startS: number;
  endS: number;
  duration: number;
  selectedDuration: number;
  isPlaying: boolean;
  onTogglePreview: () => void;
  onChangeFile: () => void;
  setStartS: (v: number) => void;
  setEndS: (v: number) => void;
}

export const CustomSoundTrimPanel = ({
  fileName,
  peaks,
  startS,
  endS,
  duration,
  selectedDuration,
  isPlaying,
  onTogglePreview,
  onChangeFile,
  setStartS,
  setEndS,
}: CustomSoundTrimPanelProps) => (
  <div className="space-y-2 min-w-0">
    <div className="flex items-center justify-between gap-2 min-w-0 w-full">
      <TruncatedOneLineWithTooltip
        text={fileName}
        as="span"
        tooltipPlacement="bottom"
        tooltipHorizontalAnchor="start"
        textClassName="block w-full min-w-0 text-xs text-base-content/60 truncate"
        tooltipBodyClassName="text-center text-xs px-3 py-2 rounded-3xl whitespace-normal leading-relaxed"
      />
      <button type="button" onClick={onChangeFile} className="btn btn-ghost btn-xs shrink-0">
        Change file
      </button>
    </div>

    <WaveformScroller
      peaks={peaks}
      startS={startS}
      endS={endS}
      duration={duration}
      setStartS={setStartS}
      setEndS={setEndS}
    />

    <p className="text-[11px] text-base-content/50 text-center leading-snug">
      <span className="font-medium text-base-content/70">Edges:</span> trim start/end
      <span className="mx-1">&middot;</span>
      <span className="font-medium text-base-content/70">Center:</span> move selection
    </p>

    <div className="flex items-center justify-between text-xs text-base-content/60">
      <span>Start: {startS.toFixed(1)}s</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePreview}
          className={`btn btn-sm btn-ghost gap-1.5 ${isPlaying ? 'btn-active' : ''}`}
        >
          {isPlaying ? (
            <>
              <PauseIcon className="size-3.5" />
              Stop
            </>
          ) : (
            <>
              <PlayIcon className="size-3.5" />
              Preview
            </>
          )}
        </button>
        <span className="badge badge-sm badge-primary">{selectedDuration.toFixed(1)}s</span>
      </div>
      <span>End: {endS.toFixed(1)}s</span>
    </div>
    <p className="text-xs text-base-content/40 text-center">
      Drag handles or region to trim &middot; max {MAX_CUSTOM_SOUND_DURATION_S}s &middot;{' '}
      {duration.toFixed(1)}s total
    </p>
  </div>
);
