import type { PullRequest } from '../components/types';

interface GitHubGraphQLResponse {
  data?: {
    viewer?: {
      pullRequests?: {
        nodes: Array<{
          id: string;
          title: string;
          url: string;
          updatedAt: string;
          repository: {
            nameWithOwner: string;
          };
          author: {
            login: string;
          };
          reviewRequests?: {
            nodes: Array<{
              requestedReviewer?: {
                login?: string;
              };
            }>;
          };
        }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export class GitHubService {
  private cachedCSRFToken: string | null = null;

  private async getCSRFToken(): Promise<string> {
    if (this.cachedCSRFToken) {
      return this.cachedCSRFToken;
    }

    try {
      // First, fetch the GitHub pulls page to get the CSRF token
      const response = await fetch('https://github.com/pulls', {
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GitHub page for CSRF token');
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const csrfMeta = doc.querySelector('meta[name="csrf-token"]');
      const token = csrfMeta?.getAttribute('content');

      if (!token) {
        throw new Error('CSRF token not found. Make sure you are logged into GitHub.');
      }

      this.cachedCSRFToken = token;
      return token;
    } catch (error) {
      throw new Error(
        `Failed to get CSRF token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fetchWithGraphQL(query: string): Promise<GitHubGraphQLResponse> {
    const csrfToken = await this.getCSRFToken();

    const response = await fetch('https://github.com/_graphql', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Accept: 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Not authenticated. Please log into GitHub first.');
      }
      throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const data: GitHubGraphQLResponse = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(`GraphQL error: ${data.errors[0].message}`);
    }

    return data;
  }

  private async fallbackToHTMLScraping(): Promise<PullRequest[]> {
    try {
      const response = await fetch(
        'https://github.com/pulls?q=is%3Apr+is%3Aopen+user-review-requested%3A%40me',
        {
          credentials: 'include',
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch PRs page: ${response.status}`);
      }

      const html = await response.text();
      return this.parseHTMLForPRs(html);
    } catch (error) {
      console.error('HTML scraping fallback failed:', error);
      return [];
    }
  }

  private parseHTMLForPRs(html: string): PullRequest[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const prs: PullRequest[] = [];

    // Look for PR items in various possible selectors
    const prSelectors = [
      '.js-issue-row',
      '[data-hovercard-type="pull_request"]',
      '.Box-row',
      '.js-navigation-container .js-issue-row',
    ];

    let prElements: NodeListOf<Element> | null = null;
    for (const selector of prSelectors) {
      prElements = doc.querySelectorAll(selector);
      if (prElements.length > 0) break;
    }

    if (!prElements || prElements.length === 0) {
      console.warn('No PR elements found in HTML');
      return [];
    }

    prElements.forEach((element, index) => {
      try {
        // Extract title and URL
        const titleLink = element.querySelector(
          'a[data-hovercard-type="pull_request"], .Link--primary, .js-navigation-open'
        );
        const title = titleLink?.textContent?.trim();
        const relativeUrl = titleLink?.getAttribute('href');

        if (!title || !relativeUrl) return;

        const url = `https://github.com${relativeUrl}`;

        // Extract repository from URL
        const urlParts = relativeUrl.split('/');
        const repository =
          urlParts.length >= 3 ? `${urlParts[1]}/${urlParts[2]}` : 'Unknown Repository';

        // Extract author
        const authorElement = element.querySelector('.opened-by a, [data-hovercard-type="user"]');
        const author = authorElement?.textContent?.trim() || 'Unknown Author';

        // Extract update time
        const timeElement = element.querySelector('relative-time, time');
        const updatedAt = timeElement?.getAttribute('datetime') || new Date().toISOString();

        // Simple hash for ID
        const id = this.generateIdFromUrl(relativeUrl);

        prs.push({
          id,
          title,
          repository,
          author,
          updatedAt,
          url,
          hasUnread: true, // Assume all scraped PRs are unread
          isNew: false,
        });
      } catch (error) {
        console.warn(`Failed to parse PR element ${index}:`, error);
      }
    });

    return prs;
  }

  private generateIdFromUrl(url: string): number {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async getReviewRequestedPRs(): Promise<PullRequest[]> {
    try {
      // Try GraphQL first
      const query = `
        query {
          viewer {
            pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
              nodes {
                id
                title
                url
                updatedAt
                repository {
                  nameWithOwner
                }
                author {
                  login
                }
                reviewRequests(first: 10) {
                  nodes {
                    requestedReviewer {
                      ... on User {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.fetchWithGraphQL(query);

      if (response.data?.viewer?.pullRequests?.nodes) {
        const prs: PullRequest[] = response.data.viewer.pullRequests.nodes
          .filter((pr) => {
            // Filter for PRs where current user is requested for review
            return pr.reviewRequests?.nodes.some((request) => request.requestedReviewer?.login);
          })
          .map((pr) => ({
            id: this.generateIdFromUrl(pr.url),
            title: pr.title,
            repository: pr.repository.nameWithOwner,
            author: pr.author.login,
            updatedAt: pr.updatedAt,
            url: pr.url,
            hasUnread: true,
            isNew: false,
          }));

        return prs;
      }
    } catch (error) {
      console.warn('GraphQL approach failed, falling back to HTML scraping:', error);
    }

    // Fallback to HTML scraping
    return this.fallbackToHTMLScraping();
  }

  // Clear cached token (useful if authentication changes)
  clearCache(): void {
    this.cachedCSRFToken = null;
  }
}

export const githubService = new GitHubService();
