import type { IPatternRegistryService } from '../interfaces/IPatternRegistryService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PatternRegistry, CompiledPatterns } from '@common/pattern-types';
import {
  compilePatterns,
  DEFAULT_PATTERNS,
  DEFAULT_COMPILED_PATTERNS,
} from '@common/default-patterns';
import {
  STORAGE_KEY_PATTERN_REGISTRY,
  REMOTE_PATTERNS_URL,
  PATTERN_REFRESH_TTL_MS,
  REMOTE_FETCH_TIMEOUT_MS,
  REMOTE_PATTERNS_MAX_BYTES,
} from '@common/constants';
import {
  validateRemoteConfig,
  validateStoredPatternData,
  type StoredPatternData,
} from '@common/pattern-registry-schema';
import { chromeExtensionService } from '@common/chrome-extension-service';

type RemoteConfigReadResult<T> = { success: true; data: T } | { success: false };

function getExtensionVersion(): string {
  try {
    return chromeExtensionService.runtime.getManifest().version;
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

      const rawResult = await this.readRemoteConfigJson(response);
      if (!rawResult.success) return;
      const raw = rawResult.data;

      const validated = validateRemoteConfig(raw);
      if (!validated.success) {
        this.debugService.warn(`[PatternRegistry] Remote config rejected: ${validated.message}`);
        return;
      }
      const config = validated.data;

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
        this.debugService.error(
          '[PatternRegistry] Remote patterns failed to compile — keeping current'
        );
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

  private async readRemoteConfigJson(response: Response): Promise<RemoteConfigReadResult<unknown>> {
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      const declaredBytes = Number(contentLength);
      if (Number.isFinite(declaredBytes) && declaredBytes > REMOTE_PATTERNS_MAX_BYTES) {
        this.debugService.warn(
          `[PatternRegistry] Remote config rejected: payload declares ${declaredBytes} bytes, above ${REMOTE_PATTERNS_MAX_BYTES} byte limit`
        );
        return { success: false };
      }
    }

    const textResult = await this.readRemoteConfigText(response);
    if (!textResult.success) return textResult;

    return { success: true, data: JSON.parse(textResult.data) };
  }

  private async readRemoteConfigText(response: Response): Promise<RemoteConfigReadResult<string>> {
    if (!response.body) {
      const data = await response.text();
      const byteLength = new TextEncoder().encode(data).byteLength;
      if (byteLength > REMOTE_PATTERNS_MAX_BYTES) {
        this.debugService.warn(
          `[PatternRegistry] Remote config rejected: payload read ${byteLength} bytes, above ${REMOTE_PATTERNS_MAX_BYTES} byte limit`
        );
        return { success: false };
      }
      return { success: true, data };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let data = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        receivedBytes += value.byteLength;
        if (receivedBytes > REMOTE_PATTERNS_MAX_BYTES) {
          await reader.cancel();
          this.debugService.warn(
            `[PatternRegistry] Remote config rejected: payload exceeded ${REMOTE_PATTERNS_MAX_BYTES} byte limit while streaming`
          );
          return { success: false };
        }

        data += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }

    data += decoder.decode();
    return { success: true, data };
  }

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
    const raw = await chromeExtensionService.storage.local.get(STORAGE_KEY_PATTERN_REGISTRY);
    const stored = raw[STORAGE_KEY_PATTERN_REGISTRY];
    if (!stored) return null;

    // Validate the full wrapper — not just patterns — because corrupted
    // version/timestamp would poison staleness and version comparisons.
    const result = validateStoredPatternData(stored);
    if (!result.success) {
      this.debugService.warn(`[PatternRegistry] Stored data rejected: ${result.message}`);
      return null;
    }
    return result.data;
  }

  private async persistToStorage(patterns: PatternRegistry, version: number): Promise<void> {
    const data: StoredPatternData = { patterns, version, timestamp: Date.now() };
    await chromeExtensionService.storage.local.set({ [STORAGE_KEY_PATTERN_REGISTRY]: data });
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PatternRegistry] Disposed');
  }
}
