import clsx from 'clsx';
import type { ReactNode } from 'react';
import { MIN_REFRESH_INTERVAL_MS } from '../../../../extension/common/constants';
import { TOOLTIP_DELAY_GUARD_CLASSES } from '../constants';

interface RefreshTooltipFrameProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  tooltipOpen: boolean;
  policyId: string;
  refreshDisabled: boolean;
  shortAriaLabel: string;
  tooltipLines: string[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onHostFocus?: () => void;
  onHostBlur?: (e: React.FocusEvent) => void;
  children: ReactNode;
}

export const RefreshTooltipFrame = ({
  containerRef,
  tooltipOpen,
  policyId,
  refreshDisabled,
  shortAriaLabel,
  tooltipLines,
  onMouseEnter,
  onMouseLeave,
  onHostFocus,
  onHostBlur,
  children,
}: RefreshTooltipFrameProps) => {
  return (
    <div
      ref={containerRef}
      className={clsx(
        'tooltip tooltip-left tooltip-neutral shrink-0 self-center rounded-full outline-none',
        TOOLTIP_DELAY_GUARD_CLASSES,
        tooltipOpen && 'tooltip-open',
        refreshDisabled &&
          'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100'
      )}
      tabIndex={refreshDisabled ? 0 : -1}
      aria-label={refreshDisabled ? shortAriaLabel : undefined}
      aria-describedby={`refresh-policy-${policyId}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onHostFocus}
      onBlur={onHostBlur}
    >
      <div className="tooltip-content z-9999 max-w-48 px-0 py-0 text-left shadow-lg">
        <div className="rounded-md px-2.5 py-1.5 text-[11px] font-normal leading-snug whitespace-normal text-neutral-content">
          {tooltipLines.map((line, i) => (
            <p key={i} className={clsx(i > 0 && 'mt-1 opacity-90')}>
              {line}
            </p>
          ))}
        </div>
      </div>

      {children}

      <span className="sr-only" id={`refresh-policy-${policyId}`}>
        Minimum interval between manual refreshes is {MIN_REFRESH_INTERVAL_MS / 1000} seconds.
      </span>
    </div>
  );
};
