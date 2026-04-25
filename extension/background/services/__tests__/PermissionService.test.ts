import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionService } from '../PermissionService';
import type { IDebugService } from '../../interfaces/IDebugService';
import {
  PERMISSION_ALARMS,
  PERMISSION_NOTIFICATIONS,
  PERMISSION_STORAGE,
  PERMISSION_OFFSCREEN,
} from '@common/constants';

const permMocks = vi.hoisted(() => ({
  contains: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    permissions: {
      contains: (spec: unknown) => permMocks.contains(spec),
      request: (spec: unknown) => permMocks.request(spec),
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

describe('Extension permissions on install and startup', () => {
  beforeEach(() => {
    permMocks.contains.mockReset();
    permMocks.request.mockReset();
  });

  it('requests required permissions when the browser reports they are missing', async () => {
    permMocks.contains.mockResolvedValue(false);
    permMocks.request.mockResolvedValue(true);

    const service = new PermissionService(createDebugService());
    await service.initialize();

    const granted = await service.requestMissingPermissions();

    expect(granted).toBe(true);
    expect(permMocks.request).toHaveBeenCalledTimes(1);
    expect(permMocks.request).toHaveBeenCalledWith({
      permissions: [
        PERMISSION_ALARMS,
        PERMISSION_NOTIFICATIONS,
        PERMISSION_STORAGE,
        PERMISSION_OFFSCREEN,
      ],
    });
  });

  it('does not request permissions if they are already granted', async () => {
    permMocks.contains.mockResolvedValue(true);

    const service = new PermissionService(createDebugService());
    await service.initialize();

    const granted = await service.requestMissingPermissions();

    expect(granted).toBe(true);
    expect(permMocks.request).not.toHaveBeenCalled();
  });
});
