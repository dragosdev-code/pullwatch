import type { IDebugService } from '../interfaces/IDebugService';
import { initializeDebugTools } from '../../debug/debugLogger';

/**
 * DebugService handles all debug logging operations.
 * Centralizes logging functionality and provides consistent logging across all services.
 */
export class DebugService implements IDebugService {
  private initialized = false;

  /**
   * Initializes the debug service and debug tools.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      initializeDebugTools();
      this.initialized = true;
      this.log('[DebugService] Debug service initialized');
    } catch (error) {
      console.error('[DebugService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Logs a debug message with timestamp.
   */
  log(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, ...args);
  }

  /**
   * Logs an error message with timestamp.
   */
  error(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${message}`, ...args);
  }

  /**
   * Logs a warning message with timestamp.
   */
  warn(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ${message}`, ...args);
  }

  /**
   * Disposes the debug service.
   */
  async dispose(): Promise<void> {
    this.log('[DebugService] Debug service disposed');
    this.initialized = false;
  }
}
