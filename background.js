// background.js — Service worker that manages declarativeNetRequest rules
// Uses queryTransform to append parameters to matching URLs.
// queryTransform + addOrReplaceParams is idempotent: if the redirect produces
// the same URL (param already present), Chrome detects the loop and stops.

const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
  'font', 'object', 'xmlhttprequest', 'ping', 'media',
  'websocket', 'webtransport', 'webbundle', 'other'
];

/**
 * Convert a user-entered URL pattern into a declarativeNetRequest urlFilter.
 * 
 * Examples of user input → urlFilter:
 *   "https://google.com"       → "|https://google.com*"
 *   "google.com"               → "||google.com*"
 *   "example.com/api/v1"       → "||example.com/api/v1*"
 *   "*://example.com/*"        → "*://example.com/*"
 */
function toUrlFilter(pattern) {
  pattern = pattern.trim();

  // If user already uses wildcards or dnr syntax, pass through
  if (pattern.includes('*') || pattern.startsWith('|')) {
    return pattern;
  }

  // If starts with http:// or https://, anchor to start of URL
  if (/^https?:\/\//.test(pattern)) {
    return `|${pattern}*`;
  }

  // Otherwise treat as domain (possibly with path), use domain anchor
  return `||${pattern}*`;
}

/**
 * Rebuild all declarativeNetRequest redirect rules from the stored rule list.
 */
async function rebuildRules() {
  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  const { rules = [] } = await chrome.storage.sync.get('rules');
  const activeRules = rules.filter(r => r.enabled && r.urlPattern && r.paramKey);

  const addRules = activeRules.map((rule, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [
              { key: rule.paramKey, value: rule.paramValue || '' }
            ]
          }
        }
      }
    },
    condition: {
      urlFilter: toUrlFilter(rule.urlPattern),
      resourceTypes: ALL_RESOURCE_TYPES,
    },
  }));

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: addRules,
    });
    console.log(`[URL Param Injector] Applied ${addRules.length} rule(s) from ${rules.length} config entries.`);

    // Log the generated rules for debugging
    const current = await chrome.declarativeNetRequest.getDynamicRules();
    console.log('[URL Param Injector] Active rules:', JSON.stringify(current, null, 2));
  } catch (err) {
    console.error('[URL Param Injector] Failed to apply rules:', err);
  }
}

// Rebuild rules on extension install / update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[URL Param Injector] Extension installed/updated.');
  rebuildRules();
});

// Rebuild rules on service worker startup
rebuildRules();

// Listen for messages from popup to rebuild rules
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RULES_UPDATED') {
    rebuildRules().then(() => sendResponse({ ok: true }));
    return true; // keep message channel open for async response
  }
});
