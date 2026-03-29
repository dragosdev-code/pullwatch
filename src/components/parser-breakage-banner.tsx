import { useParserBreakage } from '../hooks/use-parser-breakage';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export const ParserBreakageBanner = () => {
  const isBroken = useParserBreakage();

  if (!isBroken) return null;

  return (
    <div className="px-4 py-2.5 bg-warning/10 border-b border-warning/30 flex items-start gap-2.5">
      <ArrowPathIcon className="w-4 h-4 text-warning shrink-0 mt-px animate-spin" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-warning leading-snug">
          GitHub updated their UI &mdash; we&apos;re syncing our parsers.
        </p>
        <p className="text-[10px] text-warning/70 leading-snug mt-0.5">
          Data below may be slightly stale. This usually resolves within the hour.
        </p>
      </div>
    </div>
  );
};
