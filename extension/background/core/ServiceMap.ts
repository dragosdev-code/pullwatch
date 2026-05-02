import type { IAlarmService } from '../interfaces/IAlarmService';
import type { IAvatarService } from '../interfaces/IAvatarService';
import type { IBadgeService } from '../interfaces/IBadgeService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IDevTestService } from '../interfaces/IDevTestService';
import type { IEventService } from '../interfaces/IEventService';
import type { IGitHubService } from '../interfaces/IGitHubService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IPermissionService } from '../interfaces/IPermissionService';
import type { IPRService } from '../interfaces/IPRService';
import type { IRateLimitService } from '../interfaces/IRateLimitService';
import type { ISoundService } from '../interfaces/ISoundService';
import type { IPatternRegistryService } from '../interfaces/IPatternRegistryService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IHealthStatusService } from '../interfaces/IHealthStatusService';
import type { IGitHubStatusClient } from '../interfaces/IGitHubStatusClient';
import type { AlarmSeqClock } from '../domain/pr-list-trust';

/**
 * Typed registry mapping service keys to their interface types.
 * Provides compile-time safety for ServiceContainer.getService() calls.
 */
export interface ServiceMap {
  debugService: IDebugService;
  permissionService: IPermissionService;
  storageService: IStorageService;
  alarmService: IAlarmService;
  avatarService: IAvatarService;
  badgeService: IBadgeService;
  soundService: ISoundService;
  eventService: IEventService;
  healthStatusService: IHealthStatusService;
  gitHubStatusClient: IGitHubStatusClient;
  patternRegistryService: IPatternRegistryService;
  gitHubService: IGitHubService;
  rateLimitService: IRateLimitService;
  notificationService: INotificationService;
  prService: IPRService;
  devTestService: IDevTestService;
  // WHY [shared instance]: EventService advances seq on alarm completion; PRService reads it for
  // PrTombstoneStore's window math. Container-registered so both paths see the same in-memory
  // reference (state is in chrome.storage so multiple instances would also work, but one wiring
  // point keeps the dependency edge explicit).
  alarmSeqClock: AlarmSeqClock;
}
