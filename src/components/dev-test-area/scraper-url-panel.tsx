import { useEffect, useState } from 'react';
import { chromeExtensionService } from '../../services/chrome-extension-service';
import type { ScraperUrl } from '../../../extension/common/types';

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
                <svg className="w-3 h-3 text-success" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="w-3 h-3 text-base-content/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>

            <button
              className="btn btn-ghost btn-xs px-1"
              title="Open in browser"
              onClick={() => handleOpen(entry.url)}
            >
              <svg
                className="w-3 h-3 text-base-content/50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
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
