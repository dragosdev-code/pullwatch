import { useCallback } from 'react';
import { useLinkBehavior } from '../../../hooks/use-link-behavior';
import { chromeExtensionService } from '@common/chrome-extension-service';

export const usePrLinkClick = ({
  url,
  prId,
  onPrLinkActivated,
}: {
  url: string;
  prId: string;
  onPrLinkActivated?: (prId: string) => void;
}) => {
  const { behavior: linkBehavior } = useLinkBehavior();

  return useCallback(
    (event: React.MouseEvent) => {
      onPrLinkActivated?.(prId);
      if (linkBehavior === 'background') {
        event.preventDefault();
        void chromeExtensionService.tabs.create({ url, active: false });
      }
    },
    [linkBehavior, onPrLinkActivated, prId, url]
  );
};
