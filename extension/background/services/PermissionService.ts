import type { IPermissionService } from '../interfaces/IPermissionService';
import type { IDebugService } from '../interfaces/IDebugService';
import {
  PERMISSION_ALARMS,
  PERMISSION_NOTIFICATIONS,
  PERMISSION_STORAGE,
  PERMISSION_OFFSCREEN,
} from '../../common/constants';

/**
 * PermissionService handles Chrome extension permission validation and requests.
 * Manages required permissions for the extension to function properly.
 */
export class PermissionService implements IPermissionService {
  private debugService: IDebugService;
  private initialized = false;

  private readonly requiredPermissions = [
    PERMISSION_ALARMS,
    PERMISSION_NOTIFICATIONS,
    PERMISSION_STORAGE,
    PERMISSION_OFFSCREEN,
  ] as const;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  /**
   * Initializes the permission service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[PermissionService] Permission service initialized');
  }

  /**
   * Checks if all required permissions are granted.
   */
  async checkAllPermissions(): Promise<boolean> {
    try {
      const permissionStatus = await this.getPermissionStatus();
      const allGranted = Object.values(permissionStatus).every((granted) => granted);

      this.debugService.log('[PermissionService] Permission status:', permissionStatus);

      if (!allGranted) {
        this.debugService.warn(
          '[PermissionService] Some required permissions are missing:',
          permissionStatus
        );
      }

      return allGranted;
    } catch (error) {
      this.debugService.error('[PermissionService] Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Checks if a specific permission is granted.
   */
  async checkPermission(permission: (typeof this.requiredPermissions)[number]): Promise<boolean> {
    try {
      const result = await chrome.permissions.contains({ permissions: [permission] });
      this.debugService.log(`[PermissionService] Permission '${permission}' status:`, result);
      return result;
    } catch (error) {
      this.debugService.error(
        `[PermissionService] Error checking permission '${permission}':`,
        error
      );
      return false;
    }
  }

  /**
   * Requests missing permissions from the user.
   */
  async requestPermissions(
    permissions: (typeof this.requiredPermissions)[number][]
  ): Promise<boolean> {
    try {
      this.debugService.log('[PermissionService] Requesting permissions:', permissions);

      const granted = await chrome.permissions.request({ permissions });

      if (granted) {
        this.debugService.log('[PermissionService] Permissions granted:', permissions);
      } else {
        this.debugService.warn('[PermissionService] Permissions denied:', permissions);
      }

      return granted;
    } catch (error) {
      this.debugService.error('[PermissionService] Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Gets the status of all required permissions.
   */
  async getPermissionStatus(): Promise<Record<string, boolean>> {
    const permissionStatus: Record<string, boolean> = {};

    try {
      for (const permission of this.requiredPermissions) {
        permissionStatus[permission] = await this.checkPermission(permission);
      }
    } catch (error) {
      this.debugService.error('[PermissionService] Error getting permission status:', error);
      // Initialize with false values if error occurs
      for (const permission of this.requiredPermissions) {
        permissionStatus[permission] = false;
      }
    }

    return permissionStatus;
  }

  /**
   * Requests all missing required permissions.
   */
  async requestMissingPermissions(): Promise<boolean> {
    try {
      const permissionStatus = await this.getPermissionStatus();
      const missingPermissions = this.requiredPermissions.filter(
        (permission) => !permissionStatus[permission]
      );

      if (missingPermissions.length === 0) {
        this.debugService.log('[PermissionService] All required permissions are already granted');
        return true;
      }

      this.debugService.log('[PermissionService] Missing permissions:', missingPermissions);
      return await this.requestPermissions(missingPermissions);
    } catch (error) {
      this.debugService.error('[PermissionService] Error requesting missing permissions:', error);
      return false;
    }
  }

  /**
   * Gets the list of required permissions.
   */
  getRequiredPermissions(): readonly string[] {
    return this.requiredPermissions;
  }

  /**
   * Disposes the permission service.
   */
  async dispose(): Promise<void> {
    this.debugService.log('[PermissionService] Permission service disposed');
    this.initialized = false;
  }
}
