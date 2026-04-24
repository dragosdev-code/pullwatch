import { ArrowTopRightOnSquareIcon, CheckIcon, Square2StackIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { chromeExtensionService } from '@common/chrome-extension-service';
import type { ScraperUrl } from '../../../../extension/common/types';

export const ScraperUrlPanel = () => {
  const [urls, setUrls] = useState<ScraperUrl[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    chromeExtensionService
      .devTestGetScraperUrls()
      .then(setUrls)
      .catch(() => {});
  }, []);

  const handleCopy = async (url: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleOpen = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-1">
      <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
        {urls.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-1.5 bg-base-200 rounded px-2 py-1">
            <span className="text-[10px] text-base-content/80 truncate flex-1 min-w-0">
              {entry.label}
            </span>

            <button
              className="btn btn-ghost btn-xs px-1"
              title="Copy URL"
              onClick={() => handleCopy(entry.url, idx)}
            >
              {copiedIdx === idx ? (
                <CheckIcon className="w-3 h-3 text-success" />
              ) : (
                <Square2StackIcon className="w-3 h-3 text-base-content/50" />
              )}
            </button>

            <button
              className="btn btn-ghost btn-xs px-1"
              title="Open in browser"
              onClick={() => handleOpen(entry.url)}
            >
              <ArrowTopRightOnSquareIcon className="w-3 h-3 text-base-content/50" />
            </button>
          </div>
        ))}

        {urls.length === 0 && (
          <p className="text-[10px] text-base-content/40 italic">Loading scraper URLs...</p>
        )}
      </div>
    </div>
  );
};
