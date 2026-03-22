import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

interface PrItemTruncatedTitleProps {
  title: string;
  isFirst: boolean;
  isReviewed: boolean;
}

export const PrItemTruncatedTitle = ({ title, isFirst, isReviewed }: PrItemTruncatedTitleProps) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title]);

  return (
    <div
      className={clsx(
        'min-w-0 flex-1',
        isTruncated && [
          'tooltip rounded-3xl tooltip-neutral',
          isFirst ? 'tooltip-bottom' : 'tooltip-top',
        ]
      )}
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
