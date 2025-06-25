/**
 * Interface for the debug service that handles all logging operations.
 */
export interface IDebugService {
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

  /**
   * Initializes the debug service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the debug service.
   */
  dispose(): Promise<void>;
}
