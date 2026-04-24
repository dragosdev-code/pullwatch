import { chromeExtensionService } from '@common/chrome-extension-service';

/**
 * Checks if we're running in a Chrome extension context.
 * Used to fall back to mock data when developing outside the extension.
 */
export const isExtensionContext = (): boolean => chromeExtensionService.isExtensionContext();
