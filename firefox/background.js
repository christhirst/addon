// background.js — Background script that uses webRequest API to inject query parameters,
// headers, and perform SAML Ghost Redirects for automatic IDP selection.

let rules = [];

// --- Activity Log ---
// In-memory ring buffer of the last 20 redirect/header events for debugging.
const MAX_LOG_ENTRIES = 20;
let activityLog = [];

function logActivity(entry) {
  activityLog.push({
    timestamp: Date.now(),
    ...entry,
  });
  if (activityLog.length > MAX_LOG_ENTRIES) {
    activityLog = activityLog.slice(-MAX_LOG_ENTRIES);
  }
}

// --- Loop Detection ---
// Tracks recently redirected URLs to prevent infinite redirect loops.
// Each entry auto-expires after TTL_MS milliseconds.
const REDIRECT_TTL_MS = 5000;
const recentRedirects = new Map(); // key: redirected-to URL → value: expiry timestamp

function markRedirected(url) {
  recentRedirects.set(url, Date.now() + REDIRECT_TTL_MS);
}

function wasRecentlyRedirected(url) {
  const expiry = recentRedirects.get(url);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    recentRedirects.delete(url);
    return false;
  }
  return true;
}

// Periodic cleanup of expired entries (every 10s)
setInterval(() => {
  const now = Date.now();
  for (const [url, expiry] of recentRedirects) {
    if (now > expiry) recentRedirects.delete(url);
  }
}, 10000);

// --- Default SAML parameters to preserve ---
const DEFAULT_SAML_PARAMS = ['SAMLRequest', 'RelayState', 'SigAlg', 'Signature'];

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
    const activeRules = rules.filter(r => r.enabled && r.urlPattern && r.type !== 'header');

    for (const rule of activeRules) {
      if (urlMatches(url, rule.urlPattern)) {
        if (!rule.type || rule.type === 'parameter') {
          // --- Query Parameter Injection ---
          if (!rule.paramKey) continue;
          const newUrl = addParameterToUrl(url, rule.paramKey, rule.paramValue || '');
          if (newUrl !== url) {
            console.log(`[URL Param Injector] Redirecting ${url} → ${newUrl}`);
            logActivity({
              type: 'parameter',
              ruleLabel: rule.label || rule.urlPattern,
              from: url,
              to: newUrl,
            });
            return { redirectUrl: newUrl };
          }
        } else if (rule.type === 'saml_redirect') {
          // --- SAML Ghost Redirect ---
          try {
            const urlObj = new URL(url);
            const redirectTarget = rule.paramKey; // Target IDP URL
            const newUrlObj = new URL(redirectTarget);

            // Loop detection 1: check if host+path already matches target
            if (urlObj.host === newUrlObj.host && urlObj.pathname === newUrlObj.pathname) {
              continue; // Already at target, skip
            }

            // Loop detection 2: check TTL-based recent redirect tracker
            // Build a canonical check key from destination host+path
            const destKey = newUrlObj.host + newUrlObj.pathname;
            const srcKey = urlObj.host + urlObj.pathname;
            if (wasRecentlyRedirected(srcKey + '→' + destKey)) {
              continue; // Recently redirected this exact pair, skip
            }

            // Determine which params to preserve
            const preservedParamsStr = rule.paramValue || '';
            let paramsToPreserve;
            if (preservedParamsStr.trim()) {
              paramsToPreserve = preservedParamsStr.split(',').map(p => p.trim()).filter(Boolean);
            } else {
              // Use defaults if none specified
              paramsToPreserve = DEFAULT_SAML_PARAMS;
            }

            // Carry over parameters from source to destination
            for (const param of paramsToPreserve) {
              if (urlObj.searchParams.has(param)) {
                newUrlObj.searchParams.set(param, urlObj.searchParams.get(param));
              }
            }

            const newUrlStr = newUrlObj.toString();

            // Mark this redirect pair to prevent loops
            markRedirected(srcKey + '→' + destKey);

            console.log(`[URL Param Injector] SAML Ghost Redirect ${url} → ${newUrlStr}`);
            logActivity({
              type: 'saml_redirect',
              ruleLabel: rule.label || rule.urlPattern,
              from: url,
              to: newUrlStr,
            });
            return { redirectUrl: newUrlStr };
          } catch (err) {
            console.error(`[URL Param Injector] SAML Redirect failed for ${url}:`, err);
            logActivity({
              type: 'saml_redirect_error',
              ruleLabel: rule.label || rule.urlPattern,
              from: url,
              error: err.message,
            });
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
        logActivity({
          type: 'header',
          ruleLabel: rule.label || rule.urlPattern,
          from: url,
          header: `${rule.paramKey}: ${rule.paramValue || ''}`,
        });
      }
    }
    
    if (headersModified) {
      return { requestHeaders };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);

// Listen for messages from popup to reload rules or fetch activity log
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RULES_UPDATED') {
    loadRules().then(() => sendResponse({ ok: true }));
    return true; // keep message channel open for async response
  }

  if (message.type === 'GET_ACTIVITY_LOG') {
    sendResponse({ log: activityLog.slice().reverse() });
    return false;
  }

  if (message.type === 'CLEAR_ACTIVITY_LOG') {
    activityLog = [];
    sendResponse({ ok: true });
    return false;
  }
  
  if (message.type === 'LOG_ACTIVITY') {
    logActivity(message.entry);
    sendResponse({ ok: true });
    return false;
  }
});
