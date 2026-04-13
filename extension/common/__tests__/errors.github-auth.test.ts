import { describe, expect, it } from 'vitest';
import { isGitHubWebSessionAuthError } from '../errors';

describe('isGitHubWebSessionAuthError', () => {
  it('returns true for GitHubService-style NotLoggedIn', () => {
    expect(isGitHubWebSessionAuthError(new Error('NotLoggedIn: User is not logged in to GitHub.'))).toBe(
      true
    );
  });

  it('returns true for GitHubService-style AuthenticationError prefix', () => {
    expect(
      isGitHubWebSessionAuthError(
        new Error('AuthenticationError: Not logged in or insufficient permissions on GitHub.')
      )
    ).toBe(true);
  });

  it('returns true when the message contains not logged in (case-insensitive)', () => {
    expect(isGitHubWebSessionAuthError(new Error('Something: Not logged in or insufficient'))).toBe(true);
    expect(isGitHubWebSessionAuthError(new Error('prefix: User is not logged in to GitHub.'))).toBe(true);
  });

  it('returns true when GitHubService wrapped the auth error in a network/parsing envelope', () => {
    expect(
      isGitHubWebSessionAuthError(
        new Error(
          'Network or parsing error while fetching PRs: NotLoggedIn: User is not logged in to GitHub.'
        )
      )
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isGitHubWebSessionAuthError(new Error('GitHub temporarily unavailable'))).toBe(false);
    expect(isGitHubWebSessionAuthError(new Error('Rate limited (429) during test'))).toBe(false);
    expect(
      isGitHubWebSessionAuthError(
        new Error('Network or parsing error while fetching PRs: GitHub assigned PR fetch request failed: 404')
      )
    ).toBe(false);
    expect(isGitHubWebSessionAuthError(null)).toBe(false);
    expect(isGitHubWebSessionAuthError('string')).toBe(false);
  });
});
