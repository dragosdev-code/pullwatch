import type { IPatternRegistryService } from '../interfaces/IPatternRegistryService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PatternRegistry, CompiledPatterns } from '../../common/pattern-types';
import { compilePatterns, DEFAULT_PATTERNS, DEFAULT_COMPILED_PATTERNS } from '../../common/default-patterns';
import {
  STORAGE_KEY_PATTERN_REGISTRY,
  REMOTE_PATTERNS_URL,
  PATTERN_REFRESH_TTL_MS,
  REMOTE_FETCH_TIMEOUT_MS,
} from '../../common/constants';

interface StoredPatternData {
  patterns: PatternRegistry;
  version: number;
  timestamp: number;
}

interface RemotePatternConfig {
  version: number;
  minExtensionVersion: string;
  updatedAt?: string;
  patterns: PatternRegistry;
}

function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.0.0';
  }
}

function isVersionAtLeast(current: string, minimum: string): boolean {
  const c = current.split('.').map(Number);
  const m = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, m.length); i++) {
    const cv = c[i] ?? 0;
    const mv = m[i] ?? 0;
    if (cv > mv) return true;
    if (cv < mv) return false;
  }
  return true;
}

/**
 * Manages the parser pattern lifecycle: loads from chrome.storage.local on
 * startup, compiles regex strings into RegExp objects with safe fallback to
 * bundled defaults, and periodically fetches remote updates from the config host.
 */
export class PatternRegistryService implements IPatternRegistryService {
  private debugService: IDebugService;
  private compiledPatterns: CompiledPatterns;
  private registryVersion = 0;
  private lastFetchTimestamp = 0;
  private fetchInProgress: Promise<void> | null = null;

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
          this.lastFetchTimestamp = cached.timestamp;
          this.debugService.log(
            `[PatternRegistry] Loaded cached patterns v${cached.version} from storage`
          );
          this.fetchRemotePatterns().catch(() => {});
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
    this.lastFetchTimestamp = 0;
    await this.persistToStorage(DEFAULT_PATTERNS, 0);
    this.debugService.log('[PatternRegistry] Initialized with bundled default patterns');
    this.fetchRemotePatterns().catch(() => {});
  }

  getPatterns(): CompiledPatterns {
    return this.compiledPatterns;
  }

  async refreshIfStale(): Promise<void> {
    if (Date.now() - this.lastFetchTimestamp < PATTERN_REFRESH_TTL_MS) return;
    await this.fetchRemotePatterns();
  }

  // ── Remote config fetching ─────────────────────────────────────────

  private async fetchRemotePatterns(): Promise<void> {
    if (this.fetchInProgress) return this.fetchInProgress;
    this.fetchInProgress = this.doFetchRemote().finally(() => {
      this.fetchInProgress = null;
    });
    return this.fetchInProgress;
  }

  private async doFetchRemote(): Promise<void> {
    try {
      const response = await fetch(REMOTE_PATTERNS_URL, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.debugService.warn(
          `[PatternRegistry] Remote fetch failed: ${response.status} ${response.statusText}`
        );
        return;
      }

      const config: RemotePatternConfig = await response.json();

      if (!config.version || !config.patterns) {
        this.debugService.warn('[PatternRegistry] Remote config missing required fields');
        return;
      }

      if (config.version <= this.registryVersion) {
        this.debugService.log(
          `[PatternRegistry] Remote v${config.version} is not newer than local v${this.registryVersion} — skipping`
        );
        this.lastFetchTimestamp = Date.now();
        return;
      }

      if (
        config.minExtensionVersion &&
        !isVersionAtLeast(getExtensionVersion(), config.minExtensionVersion)
      ) {
        this.debugService.warn(
          `[PatternRegistry] Extension v${getExtensionVersion()} does not meet minimum v${config.minExtensionVersion} — skipping`
        );
        return;
      }

      const compiled = this.safeCompile(config.patterns);
      if (!compiled) {
        this.debugService.error('[PatternRegistry] Remote patterns failed to compile — keeping current');
        return;
      }

      this.compiledPatterns = compiled;
      this.registryVersion = config.version;
      this.lastFetchTimestamp = Date.now();
      await this.persistToStorage(config.patterns, config.version);
      this.debugService.log(`[PatternRegistry] Updated to remote patterns v${config.version}`);
    } catch (error: unknown) {
      this.debugService.warn(
        '[PatternRegistry] Remote fetch error (falling back to cached/defaults):',
        error instanceof Error ? error.message : error
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

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
