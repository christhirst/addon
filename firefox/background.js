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
    // Exclude header rules
    const activeRules = rules.filter(r => r.enabled && r.urlPattern && r.paramKey && r.type !== 'header');

    for (const rule of activeRules) {
      if (urlMatches(url, rule.urlPattern)) {
        if (!rule.type || rule.type === 'parameter') {
          const newUrl = addParameterToUrl(url, rule.paramKey, rule.paramValue || '');
          if (newUrl !== url) {
            console.log(`[URL Param Injector] Redirecting ${url} → ${newUrl}`);
            return { redirectUrl: newUrl };
          }
        } else if (rule.type === 'saml_redirect') {
          try {
            const urlObj = new URL(url);
            const redirectTarget = rule.paramKey;
            const newUrlObj = new URL(redirectTarget);
            
            // Prevent loop: check if we are already at the target path and host
            if (urlObj.host === newUrlObj.host && urlObj.pathname === newUrlObj.pathname) {
              continue; // Skip this rule
            }
            
            // Parse preserved parameters from comma-separated string
            const preservedParamsStr = rule.paramValue || '';
            const paramsToPreserve = preservedParamsStr.split(',').map(p => p.trim()).filter(Boolean);
            
            // Preserve parameters
            for (const param of paramsToPreserve) {
              if (urlObj.searchParams.has(param)) {
                newUrlObj.searchParams.set(param, urlObj.searchParams.get(param));
              }
            }
            
            const newUrlStr = newUrlObj.toString();
            console.log(`[URL Param Injector] SAML Ghost Redirect ${url} → ${newUrlStr}`);
            return { redirectUrl: newUrlStr };
          } catch (err) {
            console.error(`[URL Param Injector] SAML Redirect failed for ${url}:`, err);
          }
        }
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// Listen for webRequest to inject headers
browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const { url, requestHeaders } = details;
    const activeRules = rules.filter(r => r.enabled && r.urlPattern && r.paramKey && r.type === 'header');

    let headersModified = false;
    for (const rule of activeRules) {
      if (urlMatches(url, rule.urlPattern)) {
        // Check if header already exists
        const headerIndex = requestHeaders.findIndex(
          (h) => h.name.toLowerCase() === rule.paramKey.toLowerCase()
        );
        if (headerIndex >= 0) {
          requestHeaders[headerIndex].value = rule.paramValue || '';
        } else {
          requestHeaders.push({ name: rule.paramKey, value: rule.paramValue || '' });
        }
        headersModified = true;
        console.log(`[URL Param Injector] Injected Header ${rule.paramKey}=${rule.paramValue || ''} for ${url}`);
      }
    }
    
    if (headersModified) {
      return { requestHeaders };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);

// Listen for messages from popup to reload rules
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RULES_UPDATED') {
    loadRules().then(() => sendResponse({ ok: true }));
    return true; // keep message channel open for async response
  }
});
