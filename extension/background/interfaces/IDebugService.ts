import type { IService } from './IService';

/**
 * Interface for the debug service that handles all logging operations.
 */
export interface IDebugService extends IService {
  /**
   * Logs a debug message.
   */
  log(message: string, ...args: unknown[]): void;

  /**
   * Logs an error message.
   */
  error(message: string, ...args: unknown[]): void;

  /**
   * Logs a warning message.
   */
  warn(message: string, ...args: unknown[]): void;
}
