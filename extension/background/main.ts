import { BackgroundManager } from './services/BackgroundManager';
import { ServiceContainer } from './core/ServiceContainer';

/**
 * Main entry point for the background script.
 * Initializes the service container and background manager.
 */
async function initialize(): Promise<void> {
  try {
    const serviceContainer = new ServiceContainer();
    const backgroundManager = new BackgroundManager(serviceContainer);
    await backgroundManager.initialize();
  } catch (error) {
    console.error('[Main] Failed to initialize background script:', error);
  }
}

// Initialize the background script
initialize();
