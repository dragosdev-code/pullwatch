import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

/**
 * How long the parent row stays `z-index` lifted after the pointer leaves this wrapper, so DaisyUI’s tooltip
 * hide (~75ms delay + ~200ms opacity/transform) finishes before the row drops behind the one above.
 */
const TITLE_TOOLTIP_STACK_LIFT_MS = 300;

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
 * Truncation is detected with a `ResizeObserver` on the heading (`scrollWidth` vs `clientWidth`). When truncated,
 * enables a DaisyUI `tooltip` with the full title; the tooltip is absolutely positioned and can overlap the row above.
 *
 * Parent rows use `isolate` and `hover:z-10` so stacked author avatars and cross-row tooltips stack predictably.
 * On pointer leave, `hover:z-10` would drop immediately while the tooltip still fades out; the optional
 * `onStackLiftChange` callback keeps the row elevated for {@link TITLE_TOOLTIP_STACK_LIFT_MS}ms after `mouseleave`
 * so that hide transition can finish cleanly.
 */
export const PrItemTruncatedTitle = ({
  title,
  isFirst,
  isReviewed,
  onStackLiftChange,
}: PrItemTruncatedTitleProps) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const stackLiftClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStackLiftTimer = () => {
    if (stackLiftClearRef.current !== null) {
      clearTimeout(stackLiftClearRef.current);
      stackLiftClearRef.current = null;
    }
  };

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title]);

  useEffect(() => {
    if (!isTruncated) {
      clearStackLiftTimer();
      onStackLiftChange?.(false);
    }
  }, [isTruncated, onStackLiftChange]);

  useEffect(
    () => () => {
      clearStackLiftTimer();
    },
    []
  );

  const handleTitleAreaEnter = () => {
    if (!onStackLiftChange || !isTruncated) return;
    clearStackLiftTimer();
    onStackLiftChange(true);
  };

  const handleTitleAreaLeave = () => {
    if (!onStackLiftChange || !isTruncated) return;
    clearStackLiftTimer();
    stackLiftClearRef.current = setTimeout(() => {
      stackLiftClearRef.current = null;
      onStackLiftChange(false);
    }, TITLE_TOOLTIP_STACK_LIFT_MS);
  };

  return (
    <div
      className={clsx(
        'min-w-0 flex-1',
        isTruncated && [
          'tooltip rounded-3xl tooltip-neutral',
          isFirst ? 'tooltip-bottom' : 'tooltip-top',
        ]
      )}
      onMouseEnter={isTruncated ? handleTitleAreaEnter : undefined}
      onMouseLeave={isTruncated ? handleTitleAreaLeave : undefined}
    >
      {isTruncated && (
        <div className="tooltip-content z-[9999] p-0 rounded-3xl">
          <div className="font-semibold text-xs px-3 py-2 rounded-3xl whitespace-normal leading-relaxed text-left">
            {title}
          </div>
        </div>
      )}
      <h3
        ref={titleRef}
        className={clsx(
          'text-sm font-medium truncate transition-all duration-150',
          isReviewed ? 'text-base-content/60' : 'text-base-content',
          isTruncated && 'hover:text-base-content hover:underline'
        )}
      >
        {title}
      </h3>
    </div>
  );
};
