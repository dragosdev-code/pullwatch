// Background service worker for GitHub PR Live Extension

// Configuration
const FETCH_INTERVAL = 1 * 60 * 1000; // 1 minute
const STORAGE_KEY = 'github_prs';
const LAST_FETCH_KEY = 'last_fetch_time';

class GitHubService {
  constructor() {
    this.cachedCSRFToken = null;
  }

  async getCSRFToken() {
    if (this.cachedCSRFToken) {
      return this.cachedCSRFToken;
    }

    try {
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

      // Use regex to extract CSRF token since DOMParser is not available in service workers
      const csrfMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
      const token = csrfMatch ? csrfMatch[1] : null;

      if (!token) {
        throw new Error('CSRF token not found. Make sure you are logged into GitHub.');
      }

      this.cachedCSRFToken = token;
      return token;
    } catch (error) {
      throw new Error(`Failed to get CSRF token: ${error.message}`);
    }
  }

  async fetchWithGraphQL(query) {
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

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(`GraphQL error: ${data.errors[0].message}`);
    }

    return data;
  }

  async fallbackToHTMLScraping() {
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

  parseHTMLForPRs(html) {
    const prs = [];

    try {
      // Use regex to find PR links since DOMParser is not available in service workers
      // Look for pull request links in the format /owner/repo/pull/number
      const prLinkRegex = /<a[^>]*href="([^"]*\/pull\/\d+)"[^>]*>([^<]*)<\/a>/gi;
      const matches = [...html.matchAll(prLinkRegex)];

      const seenUrls = new Set();

      for (const match of matches) {
        try {
          const relativeUrl = match[1];
          const title = match[2].trim();

          if (!title || !relativeUrl || seenUrls.has(relativeUrl)) continue;

          seenUrls.add(relativeUrl);

          const url = `https://github.com${relativeUrl}`;
          const urlParts = relativeUrl.split('/');
          const repository =
            urlParts.length >= 3 ? `${urlParts[1]}/${urlParts[2]}` : 'Unknown Repository';

          // Try to extract additional info with more regex patterns
          let author = 'Unknown Author';
          let updatedAt = new Date().toISOString();

          // Look for author information near this PR link
          const authorRegex = new RegExp(
            `href="${relativeUrl.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            )}"[^>]*>.*?opened by.*?<a[^>]*>([^<]+)<`,
            'i'
          );
          const authorMatch = html.match(authorRegex);
          if (authorMatch) {
            author = authorMatch[1].trim();
          }

          // Look for relative-time near this PR
          const timeRegex = new RegExp(
            `href="${relativeUrl.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            )}".*?<relative-time[^>]*datetime="([^"]+)"`,
            'i'
          );
          const timeMatch = html.match(timeRegex);
          if (timeMatch) {
            updatedAt = timeMatch[1];
          }

          const id = this.generateIdFromUrl(relativeUrl);

          prs.push({
            id,
            title,
            repository,
            author,
            updatedAt,
            url,
            hasUnread: true,
            isNew: false,
          });
        } catch (error) {
          console.warn('Failed to parse PR match:', error);
        }
      }

      // If we didn't find any PRs with the main regex, try a simpler approach
      if (prs.length === 0) {
        console.warn('No PRs found with detailed regex, trying simpler approach');
        const simplePRRegex = /\/[^\/]+\/[^\/]+\/pull\/\d+/g;
        const simpleMatches = html.match(simplePRRegex);

        if (simpleMatches) {
          const uniqueUrls = [...new Set(simpleMatches)];
          uniqueUrls.forEach((relativeUrl, index) => {
            const urlParts = relativeUrl.split('/');
            const repository =
              urlParts.length >= 3 ? `${urlParts[1]}/${urlParts[2]}` : 'Unknown Repository';

            prs.push({
              id: this.generateIdFromUrl(relativeUrl),
              title: `Pull Request #${urlParts[urlParts.length - 1]}`,
              repository,
              author: 'Unknown Author',
              updatedAt: new Date().toISOString(),
              url: `https://github.com${relativeUrl}`,
              hasUnread: true,
              isNew: false,
            });
          });
        }
      }
    } catch (error) {
      console.error('Failed to parse HTML with regex:', error);
    }

    return prs;
  }

  generateIdFromUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async getReviewRequestedPRs() {
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
        const prs = response.data.viewer.pullRequests.nodes
          .filter((pr) => {
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

    return this.fallbackToHTMLScraping();
  }

  clearCache() {
    this.cachedCSRFToken = null;
  }
}

const githubService = new GitHubService();

// Fetch PRs and update storage
async function fetchAndUpdatePRs() {
  try {
    console.log('Fetching PRs in background...');

    // Get current PRs from storage
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const currentPRs = result[STORAGE_KEY] || [];
    const currentPRIds = new Set(currentPRs.map((pr) => pr.id));

    // Fetch new PRs
    const newPRs = await githubService.getReviewRequestedPRs();

    // Find truly new PRs
    const newlyAddedPRs = newPRs.filter((pr) => !currentPRIds.has(pr.id));

    // Update storage
    await chrome.storage.local.set({
      [STORAGE_KEY]: newPRs,
      [LAST_FETCH_KEY]: Date.now(),
    });

    // Update badge
    await updateBadge(newPRs.length);

    // Show notifications for new PRs
    if (newlyAddedPRs.length > 0) {
      await showNewPRNotifications(newlyAddedPRs);
    }

    console.log(
      `Background fetch complete. Found ${newPRs.length} PRs, ${newlyAddedPRs.length} new.`
    );
  } catch (error) {
    console.error('Background fetch failed:', error);

    // Clear cache if auth error
    if (error.message.includes('authenticated')) {
      githubService.clearCache();
    }
  }
}

// Update extension badge
async function updateBadge(count) {
  try {
    if (count > 0) {
      await chrome.action.setBadgeText({ text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
  }
}

// Show notifications for new PRs
async function showNewPRNotifications(newPRs) {
  try {
    if (newPRs.length === 1) {
      // Single PR notification
      const pr = newPRs[0];
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon-48.png',
        title: 'New PR Review Request',
        message: `${pr.title}\n${pr.repository}`,
        contextMessage: `by ${pr.author}`,
        buttons: [{ title: 'View PR' }],
      });
    } else {
      // Multiple PRs notification
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon-48.png',
        title: 'New PR Review Requests',
        message: `${newPRs.length} new pull requests need your review`,
        contextMessage: 'Click to view all PRs',
      });
    }
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open the popup or GitHub PRs page
  chrome.tabs.create({
    url: 'https://github.com/pulls?q=is%3Apr+is%3Aopen+user-review-requested%3A%40me',
  });
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // View PR button clicked - for now just open GitHub PRs page
    chrome.tabs.create({
      url: 'https://github.com/pulls?q=is%3Apr+is%3Aopen+user-review-requested%3A%40me',
    });
  }
});

// Set up periodic fetching
chrome.alarms.create('fetchPRs', {
  delayInMinutes: 0, // Start immediately
  periodInMinutes: FETCH_INTERVAL / (1000 * 60), // Convert ms to minutes
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchPRs') {
    fetchAndUpdatePRs();
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started, initiating background fetch...');
  fetchAndUpdatePRs();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed, initiating background fetch...');
  fetchAndUpdatePRs();
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchPRs') {
    fetchAndUpdatePRs()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'getPRs') {
    chrome.storage.local.get([STORAGE_KEY, LAST_FETCH_KEY]).then((result) => {
      sendResponse({
        prs: result[STORAGE_KEY] || [],
        lastFetch: result[LAST_FETCH_KEY] || null,
      });
    });
    return true;
  }
});
