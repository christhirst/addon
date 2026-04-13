// background.js — Background script that uses webRequest API to inject query parameters
// Matches URLs against user-defined patterns and appends parameters to requests.

let rules = [];

/**
 * Convert a user-entered URL pattern into a regex for matching.
 * 
 * Examples of user input → regex:
 *   "https://google.com"       → matches https://google.com*
 *   "google.com"               → matches any google.com URL
 *   "example.com/api/v1"       → matches example.com/api/v1*
 *   "*://example.com/*"        → already a pattern, use as wildcard match
 */
function patternToRegex(pattern) {
  pattern = pattern.trim();

  // If user uses wildcard pattern, convert to regex
  if (pattern.includes('*') || pattern.includes('|')) {
    // Convert simple wildcards to regex
    pattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\|/g, '');
    return new RegExp(pattern);
  }

  // If starts with http:// or https://, match from start of URL
  if (/^https?:\/\//.test(pattern)) {
    pattern = pattern.replace(/\./g, '\\.');
    return new RegExp(`^${pattern}`);
  }

  // Otherwise treat as domain (possibly with path), match anywhere
  pattern = pattern.replace(/\./g, '\\.');
  return new RegExp(pattern);
}

/**
 * Check if a URL matches the given pattern rule.
 */
function urlMatches(url, pattern) {
  try {
    const regex = patternToRegex(pattern);
    return regex.test(url);
  } catch (err) {
    console.error(`[URL Param Injector] Invalid pattern "${pattern}":`, err);
    return false;
  }
}

/**
 * Append or replace a query parameter in a URL.
 */
function addParameterToUrl(url, key, value) {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set(key, value);
    return urlObj.toString();
  } catch (err) {
    console.error(`[URL Param Injector] Failed to modify URL "${url}":`, err);
    return url;
  }
}

/**
 * Load rules from storage.
 */
async function loadRules() {
  const result = await browser.storage.local.get('rules');
  rules = result.rules || [];
  console.log(`[URL Param Injector] Loaded ${rules.length} rule(s)`);
}

// Load rules on startup
loadRules();

// Listen for webRequest and modify URLs
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url } = details;
    const activeRules = rules.filter(r => r.enabled && r.urlPattern && r.paramKey);

    for (const rule of activeRules) {
      if (urlMatches(url, rule.urlPattern)) {
        const newUrl = addParameterToUrl(url, rule.paramKey, rule.paramValue || '');
        if (newUrl !== url) {
          console.log(`[URL Param Injector] Redirecting ${url} → ${newUrl}`);
          return { redirectUrl: newUrl };
        }
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// Listen for messages from popup to reload rules
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RULES_UPDATED') {
    loadRules().then(() => sendResponse({ ok: true }));
    return true; // keep message channel open for async response
  }
});
