import { useParserBreakage } from '../hooks/use-parser-breakage';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export const ParserBreakageBanner = () => {
  const isBroken = useParserBreakage();

  if (!isBroken) return null;

  return (
    <div className="px-4 py-2.5 bg-base-200 border-b border-base-300 border-l-[3px] border-l-warning flex items-start gap-2.5">
      <ArrowPathIcon className="w-4 h-4 text-warning shrink-0 mt-px animate-spin" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-base-content leading-snug">
          GitHub updated their UI. We&apos;re syncing our parsers.
        </p>
        <p className="text-[10px] text-base-content/70 leading-snug mt-0.5">
          Data below may be slightly stale. This usually resolves within the hour.
        </p>
      </div>
    </div>
  );
};
