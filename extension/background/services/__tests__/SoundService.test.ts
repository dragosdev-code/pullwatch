import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundService } from '../SoundService';
import { OFFSCREEN_CREATE_TIMEOUT_MS } from '@common/constants';
import type { IDebugService } from '../../interfaces/IDebugService';

const chromeMocks = vi.hoisted(() => ({
  isOffscreenAvailable: vi.fn(() => true),
  hasGetContexts: vi.fn(() => true),
  getContexts: vi.fn(async (_filter?: unknown) => []),
  getURL: vi.fn((path: string) => `chrome-extension://pullwatch/${path}`),
  createDocument: vi.fn<(_params?: unknown) => Promise<void>>(),
  closeDocument: vi.fn(async () => {}),
}));

vi.mock('@common/chrome-extension-service', () => ({
  ExtensionContextType: {
    OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
  },
  chromeExtensionService: {
    offscreen: {
      isAvailable: () => chromeMocks.isOffscreenAvailable(),
      createDocument: (params: unknown) => chromeMocks.createDocument(params),
      closeDocument: () => chromeMocks.closeDocument(),
    },
    runtime: {
      hasGetContexts: () => chromeMocks.hasGetContexts(),
      getContexts: (filter: unknown) => chromeMocks.getContexts(filter),
      getURL: (path: string) => chromeMocks.getURL(path),
    },
  },
}));

function createDebugService(): IDebugService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;
}

describe('SoundService offscreen creation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    chromeMocks.isOffscreenAvailable.mockReturnValue(true);
    chromeMocks.hasGetContexts.mockReturnValue(true);
    chromeMocks.getContexts.mockResolvedValue([]);
    chromeMocks.getURL.mockImplementation((path: string) => `chrome-extension://pullwatch/${path}`);
    chromeMocks.createDocument.mockReset();
    chromeMocks.closeDocument.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('times out a hung offscreen creation and releases the creation lock for the next attempt', async () => {
    chromeMocks.createDocument
      .mockImplementationOnce(() => new Promise<void>(() => {}))
      .mockResolvedValueOnce(undefined);

    const service = new SoundService(createDebugService());

    const firstAttempt = service.ensureOffscreenDocument().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(OFFSCREEN_CREATE_TIMEOUT_MS);
    const error = await firstAttempt;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Offscreen document creation timed out');
    expect(chromeMocks.createDocument).toHaveBeenCalledTimes(1);

    await service.ensureOffscreenDocument();

    expect(chromeMocks.createDocument).toHaveBeenCalledTimes(2);
  });
});
