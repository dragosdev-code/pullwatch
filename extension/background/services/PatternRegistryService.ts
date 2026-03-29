import type { IPatternRegistryService } from '../interfaces/IPatternRegistryService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PatternRegistry, CompiledPatterns } from '../../common/pattern-types';
import { compilePatterns, DEFAULT_PATTERNS, DEFAULT_COMPILED_PATTERNS } from '../../common/default-patterns';
import { STORAGE_KEY_PATTERN_REGISTRY } from '../../common/constants';

interface StoredPatternData {
  patterns: PatternRegistry;
  version: number;
  timestamp: number;
}

/**
 * Manages the parser pattern lifecycle: loads from chrome.storage.local,
 * compiles regex strings into RegExp objects with safe fallback to bundled
 * defaults, and persists the active set.
 *
 * Phase 3+ will add remote fetching via fetchRemotePatterns().
 */
export class PatternRegistryService implements IPatternRegistryService {
  private debugService: IDebugService;
  private compiledPatterns: CompiledPatterns;
  private registryVersion = 0;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
    this.compiledPatterns = DEFAULT_COMPILED_PATTERNS;
  }

  async initialize(): Promise<void> {
    try {
      const cached = await this.loadFromStorage();
      if (cached) {
        const compiled = this.safeCompile(cached.patterns);
        if (compiled) {
          this.compiledPatterns = compiled;
          this.registryVersion = cached.version;
          this.debugService.log(
            `[PatternRegistry] Loaded cached patterns v${cached.version} from storage`
          );
          return;
        }
        this.debugService.warn(
          '[PatternRegistry] Cached patterns failed to compile — falling back to bundled defaults'
        );
      }
    } catch (error: unknown) {
      this.debugService.warn(
        '[PatternRegistry] Error loading cached patterns:',
        error instanceof Error ? error.message : error
      );
    }

    this.compiledPatterns = DEFAULT_COMPILED_PATTERNS;
    this.registryVersion = 0;
    await this.persistToStorage(DEFAULT_PATTERNS, 0);
    this.debugService.log('[PatternRegistry] Initialized with bundled default patterns');
  }

  getPatterns(): CompiledPatterns {
    return this.compiledPatterns;
  }

  async refreshIfStale(): Promise<void> {
    // TODO (Phase 3): Check staleness against a TTL, then call fetchRemotePatterns().
    // For now this is a no-op — patterns only change when the cache is
    // externally updated or the extension is reloaded.
  }

  // ── Future hook for remote config ──────────────────────────────────
  // private async fetchRemotePatterns(): Promise<void> {
  //   TODO (Phase 3): fetch JSON from the config host, validate version
  //   compatibility, safeCompile, persist, and swap this.compiledPatterns.
  // }

  /**
   * Attempts to compile a PatternRegistry. Returns null (instead of
   * throwing) when any regex string is malformed, allowing the caller
   * to fall back to the bundled defaults.
   */
  private safeCompile(registry: PatternRegistry): CompiledPatterns | null {
    try {
      return compilePatterns(registry);
    } catch (error: unknown) {
      this.debugService.error(
        '[PatternRegistry] Compilation failed:',
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  private async loadFromStorage(): Promise<StoredPatternData | null> {
    const result = await chrome.storage.local.get(STORAGE_KEY_PATTERN_REGISTRY);
    const stored = result[STORAGE_KEY_PATTERN_REGISTRY] as StoredPatternData | undefined;
    if (!stored?.patterns) return null;
    return stored;
  }

  private async persistToStorage(patterns: PatternRegistry, version: number): Promise<void> {
    const data: StoredPatternData = { patterns, version, timestamp: Date.now() };
    await chrome.storage.local.set({ [STORAGE_KEY_PATTERN_REGISTRY]: data });
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PatternRegistry] Disposed');
  }
}
