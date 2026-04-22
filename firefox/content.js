/**
 * content.js
 * Injected into all pages. Checks if the current URL matches any "auto_click" rule.
 * If it does, waits for the target element to appear in the DOM and clicks it.
 */

// Helper: Convert a pattern to a RegExp (matches logic in background.js)
function patternToRegex(pattern) {
  pattern = pattern.trim();
  if (pattern.includes('*') || pattern.includes('|')) {
    pattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\|/g, '');
    return new RegExp(pattern);
  }
  if (/^https?:\/\//.test(pattern)) {
    pattern = pattern.replace(/\./g, '\\.');
    return new RegExp(`^${pattern}`);
  }
  pattern = pattern.replace(/\./g, '\\.');
  return new RegExp(pattern);
}

// Helper: Check if URL matches pattern
function urlMatches(url, pattern) {
  try {
    const regex = patternToRegex(pattern);
    return regex.test(url);
  } catch (err) {
    console.error(`[URL Param Injector] Invalid pattern "${pattern}":`, err);
    return false;
  }
}

// Try to click an element given its CSS selector
// Retries with a MutationObserver up to 10 seconds if not immediately found.
function clickWhenReady(selector, ruleLabel) {
  // Check if it's already there
  let el = document.querySelector(selector);
  if (el) {
    doClick(el, selector, ruleLabel);
    return;
  }

  // Not found yet, set up observer
  const observer = new MutationObserver((mutations, obs) => {
    el = document.querySelector(selector);
    if (el) {
      obs.disconnect();
      clearTimeout(timeoutId);
      doClick(el, selector, ruleLabel);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Give up after 10 seconds
  const timeoutId = setTimeout(() => {
    observer.disconnect();
    console.warn(`[URL Param Injector] Auto Click timeout: Element "${selector}" not found after 10s.`);
  }, 10000);
}

function doClick(element, selector, ruleLabel) {
  console.log(`[URL Param Injector] Auto clicking element: ${selector}`);
  element.click();
  
  // Log the activity to the background script
  browser.runtime.sendMessage({
    type: 'LOG_ACTIVITY',
    entry: {
      type: 'auto_click',
      ruleLabel: ruleLabel,
      from: window.location.href,
      to: selector // Use 'to' to store the selector that was clicked
    }
  }).catch(err => {
    // Ignore errors if background isn't ready
  });
}

// Main logic
async function init() {
  try {
    const result = await browser.storage.local.get('rules');
    const rules = result.rules || [];
    
    // Find matching auto_click rules for this page
    const currentUrl = window.location.href;
    const activeRules = rules.filter(r => r.enabled && r.type === 'auto_click' && r.urlPattern && r.paramKey);

    for (const rule of activeRules) {
      if (urlMatches(currentUrl, rule.urlPattern)) {
        // paramKey stores the CSS selector
        clickWhenReady(rule.paramKey, rule.label || rule.urlPattern);
      }
    }
  } catch (err) {
    console.error('[URL Param Injector] content script error:', err);
  }
}

// Run when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
