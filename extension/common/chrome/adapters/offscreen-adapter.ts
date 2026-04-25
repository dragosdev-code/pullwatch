import type { OffscreenCreateParameters } from '../chrome-types';

export interface OffscreenAdapter {
  isAvailable(): boolean;
  createDocument(parameters: OffscreenCreateParameters): Promise<void>;
  closeDocument(): Promise<void>;
}

export function makeOffscreenAdapter(): OffscreenAdapter {
  return {
    isAvailable: () => typeof chrome.offscreen !== 'undefined',
    createDocument: (params) => chrome.offscreen.createDocument(params),
    closeDocument: () => chrome.offscreen.closeDocument(),
  };
}
