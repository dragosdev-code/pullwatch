import { DebugService } from '../services/DebugService';
import { PermissionService } from '../services/PermissionService';
import { StorageService } from '../services/StorageService';
import { AlarmService } from '../services/AlarmService';
import { PRService } from '../services/PRService';
import { NotificationService } from '../services/NotificationService';
import { BadgeService } from '../services/BadgeService';
import { AvatarService } from '../services/AvatarService';
import { GitHubService } from '../services/GitHubService';
import { SoundService } from '../services/SoundService';
import { EventService } from '../services/EventService';
import { DevTestService } from '../services/DevTestService';
import { PatternRegistryService } from '../services/PatternRegistryService';
import { RateLimitService } from '../services/RateLimitService';
import { HealthStatusService } from '../services/HealthStatusService';
import { GitHubStatusClient } from '@common/github-status-client';
import { AlarmSeqClock } from '../domain/pr-list-trust';
import { GITHUB_BASE_URL } from '@common/constants';
import type { IService } from '../interfaces/IService';
import type { ServiceMap } from './ServiceMap';

/**
 * Service container responsible for dependency injection and service lifecycle management.
 * Implements the dependency injection pattern to provide loose coupling between services.
 */
export class ServiceContainer {
  private services = new Map<keyof ServiceMap, IService>();
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
    this.registerService('healthStatusService', new HealthStatusService());
    this.registerService(
      'gitHubStatusClient',
      new GitHubStatusClient(this.getService('debugService'))
    );
    this.registerService('alarmSeqClock', new AlarmSeqClock(this.getService('storageService')));
    this.registerService('eventService', new EventService(this.getService('debugService'), this));

    // Initialize business logic services
    this.registerService(
      'avatarService',
      new AvatarService(this.getService('debugService'), GITHUB_BASE_URL)
    );
    this.registerService(
      'patternRegistryService',
      new PatternRegistryService(this.getService('debugService'))
    );
    this.registerService(
      'gitHubService',
      new GitHubService(
        this.getService('debugService'),
        this.getService('avatarService'),
        this.getService('patternRegistryService'),
      )
    );
    this.registerService('rateLimitService', new RateLimitService(this.getService('debugService')));

    this.registerService(
      'notificationService',
      new NotificationService({
        debugService: this.getService('debugService'),
        storageService: this.getService('storageService'),
        soundService: this.getService('soundService'),
      })
    );

    this.registerService(
      'prService',
      new PRService({
        debugService: this.getService('debugService'),
        storageService: this.getService('storageService'),
        gitHubService: this.getService('gitHubService'),
        notificationService: this.getService('notificationService'),
        badgeService: this.getService('badgeService'),
        rateLimitService: this.getService('rateLimitService'),
        healthStatusService: this.getService('healthStatusService'),
        gitHubStatusClient: this.getService('gitHubStatusClient'),
        alarmSeqClock: this.getService('alarmSeqClock'),
      })
    );

    // Dev/Test services
    this.registerService(
      'devTestService',
      new DevTestService({
        debugService: this.getService('debugService'),
        notificationService: this.getService('notificationService'),
        alarmService: this.getService('alarmService'),
        storageService: this.getService('storageService'),
        soundService: this.getService('soundService'),
      })
    );

    // Initialize all services
    await this.initializeAllServices();
    this.initialized = true;
  }

  /**
   * Registers a service with the container.
   */
  private registerService<K extends keyof ServiceMap>(key: K, service: ServiceMap[K]): void {
    this.services.set(key, service);
  }

  /**
   * Retrieves a service from the container.
   */
  getService<K extends keyof ServiceMap>(key: K): ServiceMap[K] {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service '${key}' not found in container`);
    }
    return service as ServiceMap[K];
  }

  /**
   * Initializes all registered services.
   */
  private async initializeAllServices(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [key, service] of this.services) {
      initPromises.push(
        service.initialize().catch((error: unknown) => {
          console.error(`Failed to initialize service '${key}':`, error);
          throw error;
        })
      );
    }

    await Promise.all(initPromises);
  }

  /**
   * Disposes all registered services.
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = [];

    for (const [key, service] of this.services) {
      disposePromises.push(
        service.dispose().catch((error: unknown) => {
          console.error(`Failed to dispose service '${key}':`, error);
        })
      );
    }

    await Promise.all(disposePromises);
    this.services.clear();
    this.initialized = false;
  }
}
