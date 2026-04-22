import { animated, useTransition } from '@react-spring/web';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { CustomSoundMeta } from '../../../../../../extension/common/types';
import type { SoundDefinition } from '../../../../../../extension/common/sound-config';
import { usePrefersReducedMotion } from '../../../../../hooks/use-prefers-reduced-motion';
import { SETTINGS_SPRING_SOFT } from '../../../shared/animation/settings-motion';
import { SoundOption } from './sound-option';
import { ConfirmDeleteRow } from './confirm-delete-row';

export interface CustomSoundOptionRowProps {
  meta: CustomSoundMeta;
  definition: SoundDefinition;
  isSelected: boolean;
  /** When true, row shows confirm/cancel like CustomSoundEditor saved list (taller padding than editor). */
  isConfirming: boolean;
  onSelect: () => void;
  onRequestDelete: (e: React.MouseEvent) => void;
  onConfirmDelete: (e: React.MouseEvent) => void;
  onCancelDelete: (e: React.MouseEvent) => void;
  previewPlaybackInterruptKey?: number;
}

/**
 * Custom sound row with a crossfade between the normal row and the delete-confirm panel.
 *
 * Layout: CSS grid with a single named area so the normal row and the confirm row render
 * into the same cell. Both children exist in the DOM simultaneously during the swap — which
 * keeps the list's vertical rhythm stable while the outgoing side fades and the incoming side
 * fades in with a slight vertical settle. The grid auto-sizes to the taller child, but both
 * children share the exact same markup skeleton so the height stays constant.
 */
export const CustomSoundOptionRow = ({
  meta,
  definition,
  isSelected,
  isConfirming,
  onSelect,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  previewPlaybackInterruptKey,
}: CustomSoundOptionRowProps) => {
  const prefersReducedMotion = usePrefersReducedMotion();

  const transitions = useTransition(isConfirming, {
    from: { opacity: 0, y: 6 },
    enter: { opacity: 1, y: 0 },
    leave: { opacity: 0, y: 0 },
    config: SETTINGS_SPRING_SOFT,
    immediate: prefersReducedMotion,
  });

  return (
    <div className="grid" style={{ gridTemplateAreas: '"card"' }}>
      {transitions((style, confirming) => (
        <animated.div
          style={{
            gridArea: 'card',
            opacity: style.opacity,
            transform: style.y.to((y) => `translateY(${y}px)`),
          }}
        >
          {confirming ? (
            <ConfirmDeleteRow
              name={meta.name}
              onConfirm={onConfirmDelete}
              onCancel={onCancelDelete}
            />
          ) : (
            <SoundOption
              definition={definition}
              isSelected={isSelected}
              onSelect={onSelect}
              previewPlaybackInterruptKey={previewPlaybackInterruptKey}
              trailingActions={
                <button
                  type="button"
                  onClick={onRequestDelete}
                  className="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error hover:bg-error/10"
                  aria-label={`Delete ${meta.name}`}
                >
                  <XMarkIcon className="size-2.5" strokeWidth={2} />
                </button>
              }
            />
          )}
        </animated.div>
      ))}
    </div>
  );
};
