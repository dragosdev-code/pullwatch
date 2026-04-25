import type { IService } from './IService';
import type { CompiledPatterns } from '@common/pattern-types';

/**
 * Interface for the service that manages parser pattern lifecycle:
 * loading from cache, compiling, and (in future phases) fetching remote updates.
 */
export interface IPatternRegistryService extends IService {
  /**
   * Returns the currently active compiled patterns.
   * Always safe to call after initialize() — guaranteed to return a usable set.
   */
  getPatterns(): CompiledPatterns;

  /**
   * Refreshes patterns if the local cache is stale.
   * Phase 2: no-op. Phase 3+: fetches remote config when TTL expires.
   */
  refreshIfStale(): Promise<void>;
}
