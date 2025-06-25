import { DebugService } from '../services/DebugService';
import { PermissionService } from '../services/PermissionService';
import { StorageService } from '../services/StorageService';
import { AlarmService } from '../services/AlarmService';
import { PRService } from '../services/PRService';
import { NotificationService } from '../services/NotificationService';
import { BadgeService } from '../services/BadgeService';
import { GitHubService } from '../services/GitHubService';
import { SoundService } from '../services/SoundService';
import { EventService } from '../services/EventService';

/**
 * Service container responsible for dependency injection and service lifecycle management.
 * Implements the dependency injection pattern to provide loose coupling between services.
 */
export class ServiceContainer {
  private services = new Map<string, unknown>();
  private initialized = false;

  /**
   * Registers and initializes all services with their dependencies.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize core services first (no dependencies)
    this.registerService('debugService', new DebugService());
    this.registerService(
      'permissionService',
      new PermissionService(this.getService('debugService'))
    );
    this.registerService('storageService', new StorageService(this.getService('debugService')));

    // Initialize infrastructure services
    this.registerService('alarmService', new AlarmService(this.getService('debugService')));
    this.registerService('badgeService', new BadgeService(this.getService('debugService')));
    this.registerService('soundService', new SoundService(this.getService('debugService')));
    this.registerService('eventService', new EventService(this.getService('debugService'), this));

    // Initialize business logic services
    this.registerService(
      'gitHubService',
      new GitHubService(this.getService('debugService'), this.getService('storageService'))
    );

    this.registerService(
      'notificationService',
      new NotificationService(
        this.getService('debugService'),
        this.getService('storageService'),
        this.getService('soundService')
      )
    );

    this.registerService(
      'prService',
      new PRService(
        this.getService('debugService'),
        this.getService('storageService'),
        this.getService('gitHubService'),
        this.getService('notificationService'),
        this.getService('badgeService')
      )
    );

    // Initialize all services
    await this.initializeAllServices();
    this.initialized = true;
  }

  /**
   * Registers a service with the container.
   */
  private registerService<T>(key: string, service: T): void {
    this.services.set(key, service);
  }

  /**
   * Retrieves a service from the container.
   */
  getService<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service '${key}' not found in container`);
    }
    return service as T;
  }

  /**
   * Gets all registered services.
   */
  getAllServices(): Map<string, unknown> {
    return new Map(this.services);
  }

  /**
   * Initializes all services that have an initialize method.
   */
  private async initializeAllServices(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [key, service] of this.services) {
      if (service && typeof service.initialize === 'function') {
        initPromises.push(
          service.initialize().catch((error: unknown) => {
            console.error(`Failed to initialize service '${key}':`, error);
            throw error;
          })
        );
      }
    }

    await Promise.all(initPromises);
  }

  /**
   * Disposes all services that have a dispose method.
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = [];

    for (const [key, service] of this.services) {
      if (service && typeof service.dispose === 'function') {
        disposePromises.push(
          service.dispose().catch((error: unknown) => {
            console.error(`Failed to dispose service '${key}':`, error);
          })
        );
      }
    }

    await Promise.all(disposePromises);
    this.services.clear();
    this.initialized = false;
  }
}
