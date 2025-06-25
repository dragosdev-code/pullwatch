import { useMutation } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';

/**
 * Hook to send test notification.
 */
export function useTestNotification() {
  return useMutation({
    mutationFn: () => chromeExtensionService.sendTestNotification(),
    onError: (error) => {
      console.error('Failed to send test notification:', error);
    },
  });
}
