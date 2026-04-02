import clsx from 'clsx';
import { createElement, useEffect, useRef, useState, type CSSProperties } from 'react';

const DEFAULT_STACK_LIFT_CLEAR_MS = 300;

export type TruncatedOneLineTooltipPlacement = 'top' | 'bottom';

export type TruncatedOneLineAs = 'h3' | 'span' | 'p';

export interface TruncatedOneLineWithTooltipProps {
  /** Full text shown inline and in the tooltip when truncated. */
  text: string;
  /** Visible element tag. */
  as?: TruncatedOneLineAs;
  /** Wrapper around text + tooltip (default fits flex rows). */
  wrapperClassName?: string;
  /** Base classes for the visible node; include `truncate`. */
  textClassName: string;
  /** Extra classes applied only when truncated (e.g. hover affordance). */
  truncatedTextClassName?: string;
  /** DaisyUI tooltip position when truncated. */
  tooltipPlacement: TruncatedOneLineTooltipPlacement;
  /** Inner bubble content around `text`. */
  tooltipBodyClassName: string;
  /**
   * `center` (default): DaisyUI anchors bubble and tail at 50% of this component’s width.
   * `start` / `end`: bubble only—inline style anchors the bubble to the left or right edge; the arrow keeps
   * Daisy’s default (centered on the trigger) so it doesn’t sit at the far edge.
   */
  tooltipHorizontalAnchor?: 'center' | 'start' | 'end';
  /**
   * When provided and text is truncated, defers clearing parent row z-index briefly after pointer leave
   * so DaisyUI tooltip hide animation can finish (list rows).
   */
  onStackLiftChange?: (lifted: boolean) => void;
  /** Delay before `onStackLiftChange(false)` after leave (default 300). */
  stackLiftClearMs?: number;
}

/** Inline positioning so we reliably override DaisyUI (utility classes often lose to component CSS for `.tooltip-content`). */
function tooltipContentPositionStyle(
  anchor: 'start' | 'end',
  placement: TruncatedOneLineTooltipPlacement,
): CSSProperties {
  if (placement === 'bottom') {
    return {
      top: 'var(--tt-off)',
      bottom: 'auto',
      left: anchor === 'start' ? 0 : 'auto',
      right: anchor === 'end' ? 0 : 'auto',
      transform: 'translateX(0) translateY(var(--tt-pos, -0.25rem))',
    };
  }
  return {
    bottom: 'var(--tt-off)',
    top: 'auto',
    left: anchor === 'start' ? 0 : 'auto',
    right: anchor === 'end' ? 0 : 'auto',
    transform: 'translateX(0) translateY(var(--tt-pos, 0.25rem))',
  };
}

/**
 * One line of text with ellipsis; when overflow is detected via ResizeObserver, shows DaisyUI tooltip with full text.
 */
export const TruncatedOneLineWithTooltip = ({
  text,
  as = 'span',
  wrapperClassName = 'min-w-0 flex-1',
  textClassName,
  truncatedTextClassName,
  tooltipPlacement,
  tooltipBodyClassName,
  tooltipHorizontalAnchor = 'center',
  onStackLiftChange,
  stackLiftClearMs = DEFAULT_STACK_LIFT_CLEAR_MS,
}: TruncatedOneLineWithTooltipProps) => {
  const textRef = useRef<HTMLElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const stackLiftClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStackLiftTimer = () => {
    if (stackLiftClearRef.current !== null) {
      clearTimeout(stackLiftClearRef.current);
      stackLiftClearRef.current = null;
    }
  };

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

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
    }, stackLiftClearMs);
  };

  const textNode = createElement(as, {
    ref: textRef,
    className: clsx(textClassName, isTruncated && truncatedTextClassName),
    children: text,
  });

  const tooltipContentStyle: CSSProperties | undefined =
    isTruncated && tooltipHorizontalAnchor !== 'center'
      ? tooltipContentPositionStyle(tooltipHorizontalAnchor, tooltipPlacement)
      : undefined;

  return (
    <div
      className={clsx(
        wrapperClassName,
        isTruncated && [
          'tooltip rounded-3xl tooltip-neutral',
          tooltipPlacement === 'bottom' ? 'tooltip-bottom' : 'tooltip-top',
        ]
      )}
      onMouseEnter={isTruncated ? handleTitleAreaEnter : undefined}
      onMouseLeave={isTruncated ? handleTitleAreaLeave : undefined}
    >
      {isTruncated && (
        <div
          className="tooltip-content z-9999 max-w-[min(20rem,calc(100vw-2rem))] p-0 rounded-3xl"
          style={tooltipContentStyle}
        >
          <div className={clsx('max-w-full wrap-anywhere', tooltipBodyClassName)}>
            {text}
          </div>
        </div>
      )}
      {/* Flex row: constrain width so inline spans get a real width for truncate/ellipsis (block h3 already worked). */}
      <div className="min-w-0 w-full overflow-hidden">{textNode}</div>
    </div>
  );
};
