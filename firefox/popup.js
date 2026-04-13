// popup.js — UI logic for managing URL parameter injection rules

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM refs
const rulesSection = $('#rules-section');
const formSection = $('#form-section');
const formTitle = $('#form-title');
const ruleForm = $('#rule-form');
const inputUrl = $('#input-url');
const inputKey = $('#input-key');
const inputValue = $('#input-value');
const btnAdd = $('#btn-add');
const btnCancel = $('#btn-cancel');
const rulesList = $('#rules-list');
const rulesCount = $('#rules-count');
const emptyState = $('#empty-state');
const toast = $('#toast');

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
    card.className = `rule-card${rule.enabled ? '' : ' disabled'}`;
    card.innerHTML = `
      <div class="rule-card-top">
        <span class="rule-url">${escapeHtml(rule.urlPattern)}</span>
        <div class="rule-card-actions">
          <label class="toggle" title="${rule.enabled ? 'Disable' : 'Enable'} rule">
            <input type="checkbox" data-index="${index}" ${rule.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <button class="icon-btn" data-action="edit" data-index="${index}" title="Edit rule">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn danger" data-action="delete" data-index="${index}" title="Delete rule">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rule-param">
        <span class="arrow">→</span>
        <span class="badge">${escapeHtml(rule.paramKey)}=${escapeHtml(rule.paramValue || '')}</span>
      </div>
    `;
    rulesList.appendChild(card);
  });
}

// ===== Event Handlers =====

// Add Rule button
btnAdd.addEventListener('click', () => {
  editingIndex = -1;
  formTitle.textContent = 'Add Rule';
  ruleForm.reset();
  showForm();
});

// Cancel button
btnCancel.addEventListener('click', () => {
  hideForm();
});

// Form submit
ruleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const urlPattern = inputUrl.value.trim();
  let paramKey = inputKey.value.trim();
  let paramValue = inputValue.value.trim();

  // If user typed "key=value" in the key field, auto-split
  if (paramKey.includes('=') && !paramValue) {
    const parts = paramKey.split('=');
    paramKey = parts[0];
    paramValue = parts.slice(1).join('=');
  }

  if (!urlPattern || !paramKey) return;

  const ruleData = {
    urlPattern,
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
    inputUrl.value = rule.urlPattern;
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

// ===== Helpers =====

function showForm() {
  formSection.classList.remove('hidden');
  rulesSection.classList.add('hidden');
  inputUrl.focus();
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
