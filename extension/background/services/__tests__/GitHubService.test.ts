import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubService } from '../GitHubService';
import {
  GitHubOutageError,
  GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE,
  ParserBreakageError,
  isGitHubWebSessionAuthError,
} from '@common/errors';
import { DEFAULT_COMPILED_PATTERNS } from '@common/default-patterns';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { IAvatarService } from '../../interfaces/IAvatarService';
import type { IPatternRegistryService } from '../../interfaces/IPatternRegistryService';

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

const LOGGED_OUT_SHELL_HTML =
  '<html><head><meta name="is_logged_out_page" content="true"/></head><body></body></html>';

function htmlOkResponse(html: string, url: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url,
    text: async () => html,
  } as Response;
}

function httpErrorResponse(status: number, url: string): Response {
  return {
    ok: false,
    status,
    statusText: status === 500 ? 'Internal Server Error' : 'Service Unavailable',
    url,
    headers: new Headers(),
  } as Response;
}

function createCollaborators(): {
  debug: IDebugService;
  avatar: IAvatarService;
  patterns: IPatternRegistryService;
} {
  const debug = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;

  const avatar = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    enrichPRsWithAvatars: vi.fn(async <T extends { id: string }>(prs: T[]) => prs),
  } as unknown as IAvatarService;

  const patterns = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getPatterns: vi.fn(() => DEFAULT_COMPILED_PATTERNS),
    refreshIfStale: vi.fn().mockResolvedValue(undefined),
  } as unknown as IPatternRegistryService;

  return { debug, avatar, patterns };
}

describe('GitHub session problems while loading PR lists', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces a logged out experience when GitHub returns the logged out HTML shell', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return Promise.resolve(htmlOkResponse(LOGGED_OUT_SHELL_HTML, url));
    });

    const { debug, avatar, patterns } = createCollaborators();
    const service = new GitHubService(debug, avatar, patterns);
    await service.initialize();

    let caught: unknown;
    try {
      await service.fetchAssignedPRs();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(isGitHubWebSessionAuthError(caught)).toBe(true);
    expect((caught as Error).message).toBe(GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE);
    expect(caught).not.toBeInstanceOf(ParserBreakageError);
    expect(caught).not.toBeInstanceOf(GitHubOutageError);
    expect(avatar.enrichPRsWithAvatars).not.toHaveBeenCalled();
  });
});

describe('GitHub infrastructure blips', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('treats transient 5xx responses as an outage signal rather than a broken parser', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return Promise.resolve(httpErrorResponse(503, url));
    });

    const { debug, avatar, patterns } = createCollaborators();
    const service = new GitHubService(debug, avatar, patterns);
    await service.initialize();

    const settled = service.fetchAssignedPRs().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3000);
    const err = await settled;

    expect(err).toBeInstanceOf(GitHubOutageError);
    expect((err as GitHubOutageError).httpStatus).toBe(503);
    expect(err).not.toBeInstanceOf(ParserBreakageError);

    expect(avatar.enrichPRsWithAvatars).not.toHaveBeenCalled();
  });
});
