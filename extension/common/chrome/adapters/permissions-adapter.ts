import type { PermissionsSpec } from '../chrome-types';

export interface PermissionsAdapter {
  contains(permissions: PermissionsSpec): Promise<boolean>;
  request(permissions: PermissionsSpec): Promise<boolean>;
}

export function makePermissionsAdapter(): PermissionsAdapter {
  return {
    contains: (p) => chrome.permissions.contains(p),
    request: (p) => chrome.permissions.request(p),
  };
}
