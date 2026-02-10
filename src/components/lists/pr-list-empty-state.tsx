import React from 'react';

interface PRListEmptyStateProps {
  message: string;
  subMessage?: string;
  hasEverLoaded: boolean;
}

export const PRListEmptyState: React.FC<PRListEmptyStateProps> = ({
  message,
  subMessage,
  hasEverLoaded,
}) => {
  return (
    <div className="h-full flex items-center justify-center">
      {hasEverLoaded ? (
        <p className="text-gray-500 text-sm italic">{message}</p>
      ) : (
        <div className="text-center">
          <p className="text-gray-500 text-sm italic mb-2">
            Click the refresh button to load your PRs
          </p>
          {subMessage && <div className="text-gray-400 text-xs">{subMessage}</div>}
        </div>
      )}
    </div>
  );
};
