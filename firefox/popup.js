// popup.js — UI logic for managing URL parameter injection rules

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM refs
const rulesSection = $('#rules-section');
const formSection = $('#form-section');
const formTitle = $('#form-title');
const ruleForm = $('#rule-form');
const inputLabel = $('#input-label');
const inputUrl = $('#input-url');
const inputType = $('#input-type');
const inputKey = $('#input-key');
const inputValue = $('#input-value');
const labelUrl = $('#label-url');
const hintUrl = $('#hint-url');
const labelKey = $('#label-key');
const groupValue = $('#group-value');
const labelValue = $('#label-value');
const samlHelp = $('#saml-help');
const btnAdd = $('#btn-add');
const btnCancel = $('#btn-cancel');
const btnExport = $('#btn-export');
const btnImport = $('#btn-import');
const importFile = $('#import-file');
const rulesList = $('#rules-list');
const rulesCount = $('#rules-count');
const emptyState = $('#empty-state');
const toast = $('#toast');

// Activity log refs
const activityToggle = $('#activity-toggle');
const activityPanel = $('#activity-panel');
const activityChevron = $('#activity-chevron');
const activityList = $('#activity-list');
const activityCount = $('#activity-count');
const activityBadge = $('#activity-badge');
const btnClearLog = $('#btn-clear-log');

let rules = [];
let editingIndex = -1; // -1 = adding new, >= 0 = editing existing

// ===== Load & Save =====

async function loadRules() {
  const result = await browser.storage.local.get('rules');
  rules = result.rules || [];
  renderRules();
}

async function saveRules() {
  await browser.storage.local.set({ rules });
  // Notify background to reload rules
  browser.runtime.sendMessage({ type: 'RULES_UPDATED' });
}

// ===== Render =====

function renderRules() {
  rulesList.innerHTML = '';
  rulesCount.textContent = `${rules.length} rule${rules.length !== 1 ? 's' : ''}`;

  if (rules.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  rules.forEach((rule, index) => {
    const card = document.createElement('div');
    const isSaml = rule.type === 'saml_redirect';
    const isHeader = rule.type === 'header';
    card.className = `rule-card${rule.enabled ? '' : ' disabled'}${isSaml ? ' saml' : ''}`;

    // Top section with URL and actions
    const topDiv = document.createElement('div');
    topDiv.className = 'rule-card-top';

    // Label + URL
    const infoDiv = document.createElement('div');
    infoDiv.className = 'rule-info';

    if (rule.label) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'rule-label';
      labelSpan.textContent = rule.label;
      infoDiv.appendChild(labelSpan);
    }

    const urlSpan = document.createElement('span');
    urlSpan.className = 'rule-url';
    urlSpan.textContent = rule.urlPattern;
    infoDiv.appendChild(urlSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'rule-card-actions';

    // Toggle checkbox
    const label = document.createElement('label');
    label.className = 'toggle';
    label.title = rule.enabled ? 'Disable rule' : 'Enable rule';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.index = index;
    checkbox.checked = rule.enabled;

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.appendChild(checkbox);
    label.appendChild(slider);

    // Edit button with SVG
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.dataset.action = 'edit';
    editBtn.dataset.index = index;
    editBtn.title = 'Edit rule';
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

    // Delete button with SVG
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.dataset.index = index;
    deleteBtn.title = 'Delete rule';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    actionsDiv.appendChild(label);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    topDiv.appendChild(infoDiv);
    topDiv.appendChild(actionsDiv);

    // Param / redirect info section
    const paramDiv = document.createElement('div');
    paramDiv.className = 'rule-param';

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge type-badge';
    if (isHeader) {
      typeBadge.textContent = 'HDR';
      typeBadge.classList.add('badge-header');
    } else if (isSaml) {
      typeBadge.textContent = 'SAML';
      typeBadge.classList.add('badge-saml');
    } else {
      typeBadge.textContent = 'PRM';
      typeBadge.classList.add('badge-param');
    }

    const valueBadge = document.createElement('span');
    valueBadge.className = 'badge';
    if (isSaml) {
      // Show truncated target URL
      try {
        const targetUrl = new URL(rule.paramKey);
        valueBadge.textContent = targetUrl.host + targetUrl.pathname;
      } catch {
        valueBadge.textContent = rule.paramKey;
      }
      valueBadge.title = rule.paramKey;
    } else {
      valueBadge.textContent = `${rule.paramKey}=${rule.paramValue || ''}`;
    }

    paramDiv.appendChild(arrow);
    paramDiv.appendChild(typeBadge);
    paramDiv.appendChild(valueBadge);

    // For SAML, show preserved params
    if (isSaml && rule.paramValue) {
      const preservedDiv = document.createElement('div');
      preservedDiv.className = 'rule-preserved';
      preservedDiv.textContent = `Preserves: ${rule.paramValue}`;
      card.appendChild(topDiv);
      card.appendChild(paramDiv);
      card.appendChild(preservedDiv);
    } else {
      card.appendChild(topDiv);
      card.appendChild(paramDiv);
    }

    rulesList.appendChild(card);
  });
}

// ===== Event Handlers =====

// Add Rule button
btnAdd.addEventListener('click', () => {
  editingIndex = -1;
  formTitle.textContent = 'Add Rule';
  ruleForm.reset();
  inputType.dispatchEvent(new Event('change'));
  showForm();
});

// Type change listener — update form fields based on selected type
inputType.addEventListener('change', () => {
  const type = inputType.value;
  
  if (type === 'saml_redirect') {
    labelUrl.textContent = 'Broker URL Pattern';
    inputUrl.placeholder = 'e.g. broker.company.com/auth/realms/master/protocol/saml';
    hintUrl.textContent = 'The identity broker page URL to intercept.';
    labelKey.textContent = 'Target IDP URL';
    inputKey.placeholder = 'e.g. https://broker.company.com/auth/realms/master/broker/my-idp/endpoint';
    labelValue.textContent = 'Preserved Parameters';
    inputValue.placeholder = 'SAMLRequest,RelayState (leave blank for defaults)';
    groupValue.classList.remove('hidden');
    inputValue.required = false;
    samlHelp.classList.remove('hidden');
  } else if (type === 'header') {
    labelUrl.textContent = 'URL Pattern';
    inputUrl.placeholder = 'e.g. api.example.com';
    hintUrl.textContent = 'Requests whose URL contains this string will be matched.';
    labelKey.textContent = 'Header Name';
    inputKey.placeholder = 'e.g. X-Custom-Header';
    labelValue.textContent = 'Header Value';
    inputValue.placeholder = 'e.g. my-value';
    groupValue.classList.remove('hidden');
    inputValue.required = false;
    samlHelp.classList.add('hidden');
  } else {
    // parameter
    labelUrl.textContent = 'URL Pattern';
    inputUrl.placeholder = 'e.g. example.com/api';
    hintUrl.textContent = 'Requests whose URL contains this string will be matched.';
    labelKey.textContent = 'Key';
    inputKey.placeholder = 'e.g. api_key';
    labelValue.textContent = 'Value';
    inputValue.placeholder = 'e.g. abc123';
    groupValue.classList.remove('hidden');
    inputValue.required = false;
    samlHelp.classList.add('hidden');
  }
});

// Cancel button
btnCancel.addEventListener('click', () => {
  hideForm();
});

// Form submit
ruleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const ruleLabel = inputLabel.value.trim();
  const urlPattern = inputUrl.value.trim();
  const type = inputType.value;
  let paramKey = inputKey.value.trim();
  let paramValue = inputValue.value.trim();

  // If user typed "key=value" in the key field, auto-split (only for parameter type)
  if (type === 'parameter' && paramKey.includes('=') && !paramValue) {
    const parts = paramKey.split('=');
    paramKey = parts[0];
    paramValue = parts.slice(1).join('=');
  }

  if (!urlPattern || !paramKey) return;

  const ruleData = {
    label: ruleLabel,
    urlPattern,
    type,
    paramKey,
    paramValue,
    enabled: true,
  };

  if (editingIndex >= 0) {
    // Preserve enabled state when editing
    ruleData.enabled = rules[editingIndex].enabled;
    rules[editingIndex] = ruleData;
    showToast('Rule updated', 'success');
  } else {
    rules.push(ruleData);
    showToast('Rule added', 'success');
  }

  await saveRules();
  renderRules();
  hideForm();
});

// Rule list click delegation
rulesList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const index = parseInt(btn.dataset.index, 10);
  const action = btn.dataset.action;

  if (action === 'edit') {
    editingIndex = index;
    const rule = rules[index];
    inputLabel.value = rule.label || '';
    inputUrl.value = rule.urlPattern;
    inputType.value = rule.type || 'parameter';
    inputType.dispatchEvent(new Event('change'));
    inputKey.value = rule.paramKey;
    inputValue.value = rule.paramValue || '';
    formTitle.textContent = 'Edit Rule';
    showForm();
  }

  if (action === 'delete') {
    rules.splice(index, 1);
    await saveRules();
    renderRules();
    showToast('Rule deleted', 'success');
  }
});

// Toggle enabled/disabled
rulesList.addEventListener('change', async (e) => {
  if (e.target.type === 'checkbox' && e.target.dataset.index !== undefined) {
    const index = parseInt(e.target.dataset.index, 10);
    rules[index].enabled = e.target.checked;
    await saveRules();
    renderRules();
    showToast(e.target.checked ? 'Rule enabled' : 'Rule disabled', 'success');
  }
});

// ===== Import / Export =====

btnExport.addEventListener('click', () => {
  const data = JSON.stringify(rules, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `url-param-injector-rules-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${rules.length} rule(s)`, 'success');
});

btnImport.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);

    if (!Array.isArray(imported)) {
      showToast('Invalid config file: expected an array of rules', 'error');
      return;
    }

    // Validate each rule has required fields
    const valid = imported.filter(r => r.urlPattern && r.paramKey);
    if (valid.length === 0) {
      showToast('No valid rules found in file', 'error');
      return;
    }

    // Ensure each rule has defaults
    const normalized = valid.map(r => ({
      label: r.label || '',
      urlPattern: r.urlPattern,
      type: r.type || 'parameter',
      paramKey: r.paramKey,
      paramValue: r.paramValue || '',
      enabled: r.enabled !== undefined ? r.enabled : true,
    }));

    // Merge: add only rules that don't already exist (by urlPattern + paramKey)
    const existingKeys = new Set(rules.map(r => `${r.urlPattern}|${r.paramKey}`));
    let added = 0;
    for (const rule of normalized) {
      const key = `${rule.urlPattern}|${rule.paramKey}`;
      if (!existingKeys.has(key)) {
        rules.push(rule);
        existingKeys.add(key);
        added++;
      }
    }

    await saveRules();
    renderRules();
    showToast(`Imported ${added} new rule(s) (${normalized.length - added} duplicates skipped)`, 'success');
  } catch (err) {
    console.error('[Import] Failed:', err);
    showToast('Failed to import: invalid JSON file', 'error');
  }

  // Reset file input so the same file can be re-imported
  importFile.value = '';
});

// ===== Activity Log =====

let activityOpen = false;

activityToggle.addEventListener('click', () => {
  activityOpen = !activityOpen;
  if (activityOpen) {
    activityPanel.classList.remove('hidden');
    activityChevron.style.transform = 'rotate(180deg)';
    fetchActivityLog();
  } else {
    activityPanel.classList.add('hidden');
    activityChevron.style.transform = '';
  }
});

btnClearLog.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'CLEAR_ACTIVITY_LOG' });
  renderActivityLog([]);
  showToast('Activity log cleared', 'success');
});

async function fetchActivityLog() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_ACTIVITY_LOG' });
    renderActivityLog(response.log || []);
  } catch (err) {
    console.error('[Activity Log] Failed to fetch:', err);
  }
}

function renderActivityLog(log) {
  activityList.innerHTML = '';
  activityCount.textContent = `${log.length} event${log.length !== 1 ? 's' : ''}`;

  // Update badge
  if (log.length > 0) {
    activityBadge.textContent = log.length;
    activityBadge.classList.remove('hidden');
  } else {
    activityBadge.classList.add('hidden');
  }

  if (log.length === 0) {
    const emptyP = document.createElement('p');
    emptyP.className = 'activity-empty';
    emptyP.textContent = 'No recent activity.';
    activityList.appendChild(emptyP);
    return;
  }

  log.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'activity-item';

    const time = document.createElement('span');
    time.className = 'activity-time';
    const d = new Date(entry.timestamp);
    time.textContent = d.toLocaleTimeString();

    const typeSpan = document.createElement('span');
    typeSpan.className = 'activity-type';
    if (entry.type === 'saml_redirect') {
      typeSpan.textContent = 'SAML';
      typeSpan.classList.add('activity-type-saml');
    } else if (entry.type === 'header') {
      typeSpan.textContent = 'HDR';
      typeSpan.classList.add('activity-type-header');
    } else if (entry.type === 'saml_redirect_error') {
      typeSpan.textContent = 'ERR';
      typeSpan.classList.add('activity-type-error');
    } else {
      typeSpan.textContent = 'PRM';
      typeSpan.classList.add('activity-type-param');
    }

    const details = document.createElement('div');
    details.className = 'activity-details';

    if (entry.ruleLabel) {
      const ruleSpan = document.createElement('span');
      ruleSpan.className = 'activity-rule';
      ruleSpan.textContent = entry.ruleLabel;
      details.appendChild(ruleSpan);
    }

    if (entry.from) {
      const fromSpan = document.createElement('span');
      fromSpan.className = 'activity-url';
      try {
        const u = new URL(entry.from);
        fromSpan.textContent = u.host + u.pathname.slice(0, 40);
      } catch {
        fromSpan.textContent = entry.from.slice(0, 50);
      }
      fromSpan.title = entry.from;
      details.appendChild(fromSpan);
    }

    if (entry.to) {
      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'activity-arrow';
      arrowSpan.textContent = '→';
      details.appendChild(arrowSpan);

      const toSpan = document.createElement('span');
      toSpan.className = 'activity-url';
      try {
        const u = new URL(entry.to);
        toSpan.textContent = u.host + u.pathname.slice(0, 40);
      } catch {
        toSpan.textContent = entry.to.slice(0, 50);
      }
      toSpan.title = entry.to;
      details.appendChild(toSpan);
    }

    if (entry.error) {
      const errSpan = document.createElement('span');
      errSpan.className = 'activity-error';
      errSpan.textContent = entry.error;
      details.appendChild(errSpan);
    }

    item.appendChild(time);
    item.appendChild(typeSpan);
    item.appendChild(details);
    activityList.appendChild(item);
  });
}

// ===== Helpers =====

function showForm() {
  formSection.classList.remove('hidden');
  rulesSection.classList.add('hidden');
  inputLabel.focus();
}

function hideForm() {
  formSection.classList.add('hidden');
  rulesSection.classList.remove('hidden');
  editingIndex = -1;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let toastTimeout;
function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  // Force reflow for animation restart
  void toast.offsetHeight;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

// ===== Init =====
loadRules();
// Auto-refresh activity badge on open
fetchActivityLog();
