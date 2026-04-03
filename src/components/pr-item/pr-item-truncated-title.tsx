import clsx from 'clsx';
import { TruncatedOneLineWithTooltip } from '../ui/truncated-one-line-with-tooltip';

interface PrItemTruncatedTitleProps {
  /** Full PR title text (shown in the row and, when truncated, in the tooltip). */
  title: string;
  /** First list item uses `tooltip-bottom` so the bubble stays inside the popup; others use `tooltip-top`. */
  isFirst: boolean;
  /** Muted styling when the PR is in a reviewed section. */
  isReviewed: boolean;
  /**
   * Notifies the parent `PRItem` to keep `z-10` on the row while `true`. Used so the tooltip exit animation is not
   * clipped by the previous row after `hover:z-10` would otherwise end as soon as the pointer leaves this area.
   */
  onStackLiftChange?: (lifted: boolean) => void;
}

/**
 * PR title for the list header: one line with ellipsis when space is tight.
 *
 * Delegates to {@link TruncatedOneLineWithTooltip} with PR-specific styling and stack-lift behavior.
 */
export const PrItemTruncatedTitle = ({
  title,
  isFirst,
  isReviewed,
  onStackLiftChange,
}: PrItemTruncatedTitleProps) => (
  <TruncatedOneLineWithTooltip
    text={title}
    as="h3"
    tooltipPlacement={isFirst ? 'bottom' : 'top'}
    onStackLiftChange={onStackLiftChange}
    textClassName={clsx(
      'text-sm font-medium truncate transition-all duration-150',
      isReviewed ? 'text-base-content/60' : 'text-base-content'
    )}
    truncatedTextClassName="hover:text-base-content hover:underline"
    tooltipBodyClassName="font-semibold text-xs px-3 py-2 rounded-3xl whitespace-normal leading-relaxed text-left"
  />
);
