/**
 * Interface for the permission service that handles Chrome extension permissions.
 */
export interface IPermissionService {
  /**
   * Checks if all required permissions are granted.
   */
  checkAllPermissions(): Promise<boolean>;

  /**
   * Checks if a specific permission is granted.
   */
  checkPermission(permission: string): Promise<boolean>;

  /**
   * Requests missing permissions from the user.
   */
  requestPermissions(permissions: string[]): Promise<boolean>;

  /**
   * Gets the status of all required permissions.
   */
  getPermissionStatus(): Promise<Record<string, boolean>>;

  /**
   * Initializes the permission service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the permission service.
   */
  dispose(): Promise<void>;
}
