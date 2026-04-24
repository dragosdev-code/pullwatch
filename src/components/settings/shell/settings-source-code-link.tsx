import type { MouseEvent } from 'react';
import clsx from 'clsx';
import { CodeBracketSquareIcon } from '@heroicons/react/24/outline';
import { EXTENSION_SOURCE_REPOSITORY_URL } from '../../../constants/extension-repository';
import type { LinkOpenBehavior } from '../../../hooks/use-link-behavior';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { isExtensionContext } from '../../../utils/is-extension-context';

const SOURCE_TOOLTIP = "View Pullwatch's source code on GitHub";

interface SettingsSourceCodeLinkProps {
  linkBehavior: LinkOpenBehavior;
}

export const SettingsSourceCodeLink = ({ linkBehavior }: SettingsSourceCodeLinkProps) => {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (linkBehavior === 'background' && isExtensionContext()) {
      e.preventDefault();
      void chromeExtensionService.tabs.create({ url: EXTENSION_SOURCE_REPOSITORY_URL, active: false });
    }
  };

  return (
    <a
      href={EXTENSION_SOURCE_REPOSITORY_URL}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      className={clsx(
        'tooltip tooltip-left tooltip-neutral group shrink-0',
        'p-1.5 rounded-lg text-base-content/50 outline-none',
        'transition-[transform,color,background-color] duration-200 ease-out',
        'hover:bg-base-300 hover:text-primary',
        'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100',
        'motion-reduce:transition-none'
      )}
      aria-label={SOURCE_TOOLTIP}
    >
      <div className="tooltip-content z-9999 max-w-56 px-0 py-0 text-left shadow-lg">
        <div className="rounded-md px-2.5 py-1.5 text-[11px] font-normal leading-snug whitespace-normal text-neutral-content">
          {SOURCE_TOOLTIP}
        </div>
      </div>
      <CodeBracketSquareIcon
        className={clsx(
          'size-4 transition-transform duration-200 ease-out',
          'group-hover:scale-110 group-hover:-translate-y-px group-hover:rotate-3',
          'motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:rotate-0'
        )}
        strokeWidth={2}
        aria-hidden
      />
    </a>
  );
};
