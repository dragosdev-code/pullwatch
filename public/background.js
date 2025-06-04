// Background service worker for GitHub PR Live Extension

// Configuration
const FETCH_INTERVAL = 1 * 60 * 1000; // 1 minute
const STORAGE_KEY = 'github_prs';
const LAST_FETCH_KEY = 'last_fetch_time';

class GitHubService {
  constructor() {
    this.baseURL = 'https://github.com';
    // Use the search endpoint for PRs where user is requested as reviewer
    this.reviewRequestsURL = `${this.baseURL}/pulls?q=is%3Aopen+is%3Apr+user-review-requested%3A%40me+`;
  }

  async fetchAssignedPRs() {
    try {
      console.log('Fetching from URL:', this.reviewRequestsURL);

      const response = await fetch(this.reviewRequestsURL, {
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; GitHub PR Extension)',
        },
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new Error(`GitHub request failed: ${response.status}`);
      }

      const html = await response.text();
      console.log('HTML received, length:', html.length);

      // More specific login detection - look for actual login page indicators
      const isLoginPage =
        html.includes('<title>Sign in to GitHub') ||
        html.includes('id="login"') ||
        html.includes('class="auth-form"') ||
        html.includes('name="login"') ||
        html.includes('You must be signed in to see this page') ||
        response.url.includes('/login') ||
        response.url.includes('/session') ||
        html.includes('action="/session"');

      // Look for positive indicators that we're logged in and on a search results page
      const isLoggedIn =
        html.includes('class="Header-link"') || // GitHub header with user menu
        html.includes('data-test-selector="avatar"') || // User avatar
        html.includes('aria-label="View profile and more"') || // User dropdown
        html.includes('href="/settings/profile"') || // Settings link
        html.includes('class="search-title"') || // Search results page
        html.includes('data-testid="results-list"') || // Search results
        html.includes('js-issue-row') || // Issue/PR rows
        html.includes('No results matched your search'); // Valid search page with no results

      console.log('Login page indicators:', isLoginPage);
      console.log('Logged in indicators:', isLoggedIn);

      if (isLoginPage && !isLoggedIn) {
        console.log('Detected login page - not logged in');
        throw new Error('Not logged in to GitHub');
      }

      // Check if we got a search results page
      if (
        !html.includes('pull request') &&
        !html.includes('No results matched') &&
        !html.includes('js-issue-row')
      ) {
        console.log('Unexpected page content - might not be search results');
        console.log(
          'Page title from HTML:',
          html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'No title found'
        );

        // Still try to parse it - might be a different page format
      }

      return this.parseAssignedPRsFromHTML(html);
    } catch (error) {
      console.error('Error fetching PRs:', error);
      throw error;
    }
  }

  parseAssignedPRsFromHTML(html) {
    const prs = [];

    // Debug: Check what we actually received
    console.log('HTML length:', html.length);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    console.log('Page title:', titleMatch?.[1] || 'No title found');

    // Selectors for GitHub search results page (adapted for regex)
    const prSelectors = [
      // GitHub search results selectors
      'js-issue-row', // Main search result row
      'Box-row', // Generic box row
      'issue-list-item', // Issue list item
      'data-hovercard-type="pull_request"', // PR-specific
    ];

    let prElements = [];

    // Try to find PR containers using various patterns
    for (const selector of prSelectors) {
      let pattern;
      if (selector === 'data-hovercard-type="pull_request"') {
        // Special case for hovercard attribute
        pattern = new RegExp(`<[^>]*${selector}[^>]*>(.*?)</[^>]*>`, 'gis');
      } else {
        // Regular class-based selectors - improved to capture full container
        if (selector === 'js-issue-row') {
          // For js-issue-row, match the full div container with proper nesting
          pattern = new RegExp(
            `<div[^>]*class="[^"]*${selector}[^"]*"[^>]*>.*?</div>(?=\\s*(?:<div[^>]*class="[^"]*${selector}|</div>|$))`,
            'gis'
          );
        } else {
          pattern = new RegExp(`<[^>]*class="[^"]*${selector}[^"]*"[^>]*>(.*?)</[^>]*>`, 'gis');
        }
      }

      const matches = [...html.matchAll(pattern)];
      console.log(`Selector "${selector}" found ${matches.length} elements`);

      if (matches.length > 0) {
        prElements = matches;
        break;
      }
    }

    // If no specific PR selectors work, try to find any links to PRs
    if (prElements.length === 0) {
      console.log('No PR containers found, looking for PR links...');
      const prLinkPattern = /<a[^>]*href="[^"]*\/pull\/\d+[^"]*"[^>]*>([^<]*)<\/a>/gi;
      const allLinks = [...html.matchAll(prLinkPattern)];
      console.log(`Found ${allLinks.length} PR links in total`);

      // Group links by finding their containing elements
      const containerPattern =
        /<(?:div|article|li|tr)[^>]*>.*?<a[^>]*href="([^"]*\/pull\/\d+)[^"]*"[^>]*>([^<]*)<\/a>.*?<\/(?:div|article|li|tr)>/gi;
      prElements = [...html.matchAll(containerPattern)];
      console.log(`Extracted ${prElements.length} unique PR containers`);
    }

    prElements.forEach((element, index) => {
      try {
        console.log(`Processing element ${index}`);
        const pr = this.extractPRDataFromElement(element, html);
        if (pr) {
          console.log(`Successfully extracted PR: ${pr.title}`);
          prs.push(pr);
        } else {
          console.log(`Failed to extract PR data from element ${index}`);
        }
      } catch (error) {
        console.log(`Error parsing PR element ${index}:`, error);
      }
    });

    console.log(`Total PRs extracted: ${prs.length}`);
    prs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return prs;
  }

  extractPRDataFromElement(element, fullHTML) {
    // element is either a regex match array or container HTML
    const containerHTML = typeof element === 'string' ? element : element[0];

    // DEBUG: Log the container HTML to see what we're working with (can be removed later)
    console.log('=== DEBUG: Container HTML ===');
    console.log(containerHTML.substring(0, 300) + '...');
    console.log('=== END DEBUG ===');

    // Try multiple strategies to find the PR link based on actual GitHub structure
    let url = null;
    let title = null;

    const githubCurrentPattern =
      /<a[^>]*class="[^"]*markdown-title[^"]*"[^>]*data-hovercard-type="pull_request"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
    let match = containerHTML.match(githubCurrentPattern);
    if (match) {
      console.log('Found PR via GitHub current pattern (markdown-title):', match[1], match[2]);
      url = match[1];
      title = match[2].trim();
    }

    if (!url || !title) {
      console.log('No title element found in container');
      console.log('Tried patterns:');
      console.log('1. GitHub current pattern (markdown-title)');
      return null;
    }

    // Get the URL and ensure it's absolute
    if (url.startsWith('/')) {
      url = `https://github.com${url}`;
    } else if (url && !url.startsWith('http')) {
      url = `https://github.com/${url}`;
    }

    if (!url || !url.includes('/pull/')) {
      console.log('No valid URL found');
      return null;
    }

    // Clean title of any HTML tags
    title = title.replace(/<[^>]*>/g, '').trim();

    // Extract PR number from URL
    const numberMatch = url.match(/\/pull\/(\d+)/);
    const number = numberMatch ? parseInt(numberMatch[1]) : null;

    // Extract repository name
    const repoMatch = url.match(/https:\/\/github\.com\/([^\/]+\/[^\/]+)/);
    const repoName = repoMatch ? repoMatch[1] : 'Unknown';

    console.log(`Extracted PR: ${title} - ${url}`);

    const author = { login: 'Unknown', avatarUrl: '' };

    if (author.login === 'Unknown') {
      const userLinkPattern =
        /<a[^>]*data-hovercard-type="user"[^>]*href="[^"]*author%3A([^"&]+)"[^>]*>([^<]*)<\/a>/i;
      const authorMatch = containerHTML.match(userLinkPattern);
      if (authorMatch) {
        console.log('Found author via user link pattern:', authorMatch[2]);
        author.login = authorMatch[2].trim();
        author.avatarUrl = `https://github.com/${authorMatch[1]}.png?size=40`;
      }
    }

    // Try to find time info with multiple selectors for search results
    let createdAt = new Date().toISOString();
    const timePatterns = [
      /<relative-time[^>]*datetime="([^"]*)"[^>]*>/i,
      /<time[^>]*datetime="([^"]*)"[^>]*>/i,
      /datetime="([^"]*)"[^>]*>/i,
    ];

    for (const pattern of timePatterns) {
      const timeMatch = containerHTML.match(pattern);
      if (timeMatch) {
        try {
          createdAt = new Date(timeMatch[1]).toISOString();
          break;
        } catch (e) {
          console.log('Could not parse datetime:', timeMatch[1]);
        }
      }
    }

    return {
      id: number || Date.now(), // Use PR number as ID, fallback to timestamp
      title,
      url,
      number,
      createdAt,
      updatedAt: createdAt,
      repository: repoName, // Return as string to match interface
      author: author.login, // Return as string to match interface
      hasUnread: true,
      isNew: false,
    };
  }

  formatTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}w ago`;
    }
  }

  async getReviewRequestedPRs() {
    return this.fetchAssignedPRs();
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

    console.log(`Current PRs in storage: ${currentPRs.length}`);
    console.log('Current PR IDs:', Array.from(currentPRIds));

    // Fetch new PRs
    const newPRs = await githubService.getReviewRequestedPRs();
    console.log(`Fetched PRs: ${newPRs.length}`);
    console.log(
      'Fetched PR IDs:',
      newPRs.map((pr) => pr.id)
    );

    // Find truly new PRs
    const newlyAddedPRs = newPRs.filter((pr) => !currentPRIds.has(pr.id));
    console.log(`New PRs detected: ${newlyAddedPRs.length}`);

    if (newlyAddedPRs.length > 0) {
      console.log(
        'New PRs:',
        newlyAddedPRs.map((pr) => ({ id: pr.id, title: pr.title }))
      );
    }

    // Update storage
    await chrome.storage.local.set({
      [STORAGE_KEY]: newPRs,
      [LAST_FETCH_KEY]: Date.now(),
    });

    // Update badge
    await updateBadge(newPRs.length);

    // Show notifications for new PRs (only if we have stored PRs before, to avoid notifications on first load)
    if (newlyAddedPRs.length > 0 && currentPRs.length > 0) {
      console.log('Attempting to show notifications for new PRs...');
      await showNewPRNotifications(newlyAddedPRs);
    } else if (newlyAddedPRs.length > 0 && currentPRs.length === 0) {
      console.log('Skipping notifications - this appears to be the first load');
    }

    console.log(
      `Background fetch complete. Found ${newPRs.length} PRs, ${newlyAddedPRs.length} new.`
    );
  } catch (error) {
    console.error('Background fetch failed:', error);
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

// Play notification sound using offscreen document
async function playNotificationSound() {
  try {
    console.log('Attempting to play notification sound...');

    // First try to ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send message to offscreen document to play sound
    try {
      console.log('Sending play sound message to offscreen document...');
      const response = await chrome.runtime.sendMessage({
        action: 'playNotificationSound',
      });
      console.log('Offscreen document sound response:', response);
      return;
    } catch (offscreenError) {
      console.error('Offscreen document sound failed:', offscreenError);
    }

    // Fallback: Try to send to popup if it's open
    try {
      console.log('Trying popup fallback...');
      chrome.runtime
        .sendMessage({
          action: 'playAudioInPopup',
        })
        .catch(() => {
          console.log('Popup not available for audio playback');
        });
    } catch (popupError) {
      console.error('Popup audio fallback failed:', popupError);
    }
  } catch (error) {
    console.error('All audio playback methods failed:', error);
  }
}

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')],
    });

    if (existingContexts.length > 0) {
      console.log('Offscreen document already exists');
      return;
    }

    // Create offscreen document
    console.log('Creating offscreen document for audio...');
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play notification sounds when popup is closed',
    });

    console.log('Offscreen document created successfully');

    // Wait a bit for the document to load
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error('Failed to create offscreen document:', error);
    throw error;
  }
}

// Show notifications for new PRs
async function showNewPRNotifications(newPRs) {
  try {
    console.log(`Showing notifications for ${newPRs.length} new PRs`);

    // Check notification permission
    const permission = await chrome.notifications.getPermissionLevel();
    console.log('Notification permission level:', permission);

    if (permission === 'denied') {
      console.warn('Notifications are denied. Cannot show PR notifications.');
      return;
    }

    if (newPRs.length === 1) {
      // Single PR notification
      const pr = newPRs[0];
      console.log('Creating single PR notification for:', pr.title);

      const notificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'https://github.com/favicon.ico',
        title: 'New PR Review Request',
        message: `${pr.title}\n${pr.repository}`,
        contextMessage: `by ${pr.author}`,
        requireInteraction: false, // macOS often works better without this
        silent: false, // Enable notification sound
        priority: 2, // High priority to ensure sound
      });

      console.log('Single PR notification created with ID:', notificationId);
    } else {
      // Multiple PRs notification
      console.log('Creating multiple PRs notification for:', newPRs.length, 'PRs');

      const notificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'https://github.com/favicon.ico',
        title: 'New PR Review Requests',
        message: `${newPRs.length} new pull requests need your review`,
        contextMessage: 'Click to view all PRs',
        requireInteraction: false, // macOS often works better without this
        silent: false, // Enable notification sound
        priority: 2, // High priority to ensure sound
      });

      console.log('Multiple PRs notification created with ID:', notificationId);
    }

    // Play fallback sound for macOS (since system notifications might be silent)
    if (navigator.platform.includes('Mac')) {
      console.log('macOS detected, playing fallback notification sound...');
      setTimeout(() => playNotificationSound(), 100); // Small delay to ensure notification is shown first
    }
  } catch (error) {
    console.error('Failed to show notification:', error);
    console.error('Error details:', error.message, error.stack);
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

// Handle messages from popup and offscreen document
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

  if (request.action === 'testNotification') {
    // Test notification to debug notification issues
    testNotification()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'testNotificationWithoutPopup') {
    // Test notification and sound without relying on popup
    testNotificationWithoutPopup()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'startTestInterval') {
    // Start test interval for notifications every 5 seconds
    startTestNotificationInterval();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'stopTestInterval') {
    // Stop test interval
    stopTestNotificationInterval();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'checkSoundSettings') {
    // Provide instructions for enabling notification sounds
    checkSoundSettings()
      .then((instructions) => {
        sendResponse({ success: true, instructions });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'offscreenReady') {
    console.log('Offscreen document is ready');
    sendResponse({ success: true });
    return true;
  }
});

// Test notification function
async function testNotification() {
  try {
    console.log('Testing notification...');
    console.log('Platform:', navigator.platform);
    console.log('User agent:', navigator.userAgent);

    // Check notification permission
    const permission = await chrome.notifications.getPermissionLevel();
    console.log('Test notification - Permission level:', permission);

    if (permission === 'denied') {
      throw new Error('Notifications are denied');
    }

    // Try a simpler notification first
    const notificationId = await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'https://github.com/favicon.ico',
      title: 'Test Notification',
      message: 'This is a test notification from PR Live Extension',
      contextMessage: 'If you see this, notifications are working!',
      requireInteraction: false, // Try without requireInteraction first
      silent: false, // Enable notification sound
      priority: 2, // High priority to ensure sound
    });

    console.log('Test notification created with ID:', notificationId);

    // Play fallback sound for macOS (since system notifications might be silent)
    if (navigator.platform.includes('Mac')) {
      console.log('macOS detected, playing fallback sound for test notification...');
      setTimeout(() => playNotificationSound(), 100); // Small delay to ensure notification is shown first
    }

    // Add a listener to check if notification was displayed
    chrome.notifications.onClosed.addListener((closedNotificationId, byUser) => {
      if (closedNotificationId === notificationId) {
        console.log('Test notification closed:', { id: closedNotificationId, byUser });
      }
    });

    chrome.notifications.onClicked.addListener((clickedNotificationId) => {
      if (clickedNotificationId === notificationId) {
        console.log('Test notification clicked:', clickedNotificationId);
      }
    });

    // Wait a bit and check if notification still exists
    setTimeout(async () => {
      try {
        const exists = await new Promise((resolve) => {
          chrome.notifications.getAll((notifications) => {
            resolve(notificationId in notifications);
          });
        });
        console.log('Test notification still exists after 2 seconds:', exists);
      } catch (e) {
        console.log('Error checking notification existence:', e);
      }
    }, 2000);

    return notificationId;
  } catch (error) {
    console.error('Test notification failed:', error);
    throw error;
  }
}

// Test notification without popup dependency
async function testNotificationWithoutPopup() {
  try {
    console.log('Testing notification without popup dependency...');

    // Create notification
    const notificationId = await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'https://github.com/favicon.ico',
      title: 'Test Notification (No Popup)',
      message: 'Testing sound with offscreen document',
      contextMessage: 'This should work even with popup closed',
      requireInteraction: false,
      silent: false,
      priority: 2,
    });

    console.log('Test notification (no popup) created with ID:', notificationId);

    // Play sound using offscreen document (not popup)
    console.log('Playing sound using offscreen document...');
    await playNotificationSound();

    return notificationId;
  } catch (error) {
    console.error('Test notification without popup failed:', error);
    throw error;
  }
}

// Test interval for notifications
let testNotificationInterval = null;
let testNotificationCount = 0;

function startTestNotificationInterval() {
  // Clear any existing interval
  if (testNotificationInterval) {
    clearInterval(testNotificationInterval);
  }

  testNotificationCount = 0;
  console.log('Starting test notification interval (every 5 seconds)...');

  testNotificationInterval = setInterval(async () => {
    testNotificationCount++;
    console.log(`Test notification interval #${testNotificationCount}`);

    try {
      await testNotificationWithoutPopup();
    } catch (error) {
      console.error('Test interval notification failed:', error);
    }
  }, 5000); // 5 seconds

  console.log('Test notification interval started');
}

function stopTestNotificationInterval() {
  if (testNotificationInterval) {
    clearInterval(testNotificationInterval);
    testNotificationInterval = null;
    console.log(`Test notification interval stopped after ${testNotificationCount} notifications`);
  } else {
    console.log('No test notification interval was running');
  }
}

// Check sound settings and provide instructions
async function checkSoundSettings() {
  const platform = navigator.platform;
  const isMac = platform.includes('Mac');

  if (isMac) {
    return {
      platform: 'macOS',
      instructions: [
        'To enable notification sounds on macOS:',
        '1. Open System Preferences → Notifications & Focus',
        '2. Find "Google Chrome" in the list',
        '3. Make sure "Play sound for notifications" is checked',
        '4. Set notification style to "Alerts" (not "Banners")',
        '5. In Chrome, go to chrome://settings/content/notifications',
        '6. Make sure "Sites can ask to send notifications" is enabled',
        '7. Check that GitHub.com is not in the blocked list',
      ],
    };
  } else {
    return {
      platform: 'Other',
      instructions: [
        'Notification sounds should work by default on your platform.',
        "If you don't hear sounds, check your system notification settings.",
      ],
    };
  }
}
