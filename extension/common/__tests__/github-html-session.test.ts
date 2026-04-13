import { describe, expect, it } from 'vitest';
import {
  isGitHubLoggedOutHtmlShell,
  parseGitHubMetaUserLoginContent,
} from '../github-html-session';

describe('parseGitHubMetaUserLoginContent', () => {
  it('returns undefined when meta is missing', () => {
    expect(parseGitHubMetaUserLoginContent('<html></html>')).toBeUndefined();
  });

  it('returns empty string when content is empty', () => {
    expect(
      parseGitHubMetaUserLoginContent('<meta name="user-login" content="">')
    ).toBe('');
  });

  it('returns the login when present', () => {
    expect(
      parseGitHubMetaUserLoginContent('<meta name="user-login" content="octocat" />')
    ).toBe('octocat');
  });

  it('returns the login when GitHub lists content before name', () => {
    expect(
      parseGitHubMetaUserLoginContent('<meta content="octocat" name="user-login" />')
    ).toBe('octocat');
  });
});

describe('isGitHubLoggedOutHtmlShell', () => {
  it('returns false when user-login is non-empty (signed-in 404-style shell)', () => {
    const html = `
      <meta name="user-login" content="octocat">
      <title>Page not found · GitHub</title>
    `;
    expect(isGitHubLoggedOutHtmlShell(html, 'https://github.com/foo')).toBe(false);
  });

  it('returns true for logged-out 404 marketing shell (empty user-login + is_logged_out_page)', () => {
    const html = `
      <meta name="user-login" content="">
      <meta name="is_logged_out_page" content="true">
      <title>Page not found · GitHub · GitHub</title>
    `;
    expect(isGitHubLoggedOutHtmlShell(html, 'https://github.com/pulls')).toBe(true);
  });

  it('returns true when is_logged_out_page lists content before name', () => {
    const html = `
      <meta name="user-login" content="">
      <meta content="true" name="is_logged_out_page">
      <title>Page not found · GitHub · GitHub</title>
    `;
    expect(isGitHubLoggedOutHtmlShell(html, 'https://github.com/pulls')).toBe(true);
  });

  it('returns true when user-login meta is explicitly empty', () => {
    expect(
      isGitHubLoggedOutHtmlShell('<meta name="user-login" content="">', 'https://github.com/x')
    ).toBe(true);
  });

  it('returns true for classic sign-in title when metas are absent', () => {
    expect(
      isGitHubLoggedOutHtmlShell('<html><title>Sign in to GitHub</title></html>', 'https://github.com/')
    ).toBe(true);
  });

  it('returns false when user-login is present (content-first) even if HTML contains name="login"', () => {
    const html = `
      <meta content="octocat" name="user-login" />
      <div>name="login"</div>
    `;
    expect(isGitHubLoggedOutHtmlShell(html, 'https://github.com/pulls?q=test')).toBe(false);
  });
});
