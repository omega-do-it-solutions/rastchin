const storage = chrome.storage.sync;
const EXTENSION_KEY = 'extensionEnabled';
const SIDE_PANEL_PAGE = 'src/ui/side-panel/side-panel.html';
const WHATS_NEW_PAGE = 'src/ui/whats-new/whats-new.html';
const FEEDBACK_URL = 'https://github.com/omega-do-it-solutions/rastchin/issues/new?template=feature_request.yml';
const REPORT_URL = 'https://github.com/omega-do-it-solutions/rastchin/issues/new?template=bug_report.yml';
const PLATFORM_STORAGE_KEYS = {
  claude: 'claudeEnabled',
  chatgpt: 'chatgptEnabled',
  gemini: 'geminiEnabled',
  copilot: 'copilotEnabled',
  github: 'githubEnabled',
  vsMarketplace: 'vsMarketplaceEnabled',
  deepseek: 'deepseekEnabled',
  perplexity: 'perplexityEnabled',
  notebooklm: 'notebooklmEnabled',
  aistudio: 'aistudioEnabled',
  qwen: 'qwenEnabled',
  arena: 'arenaEnabled',
  trello: 'trelloEnabled',
  notion: 'notionEnabled',
  googleWorkspace: 'googleWorkspaceEnabled',
  gmail: 'gmailEnabled',
  googleTranslate: 'googleTranslateEnabled',
  whatsapp: 'whatsappEnabled',
  telegram: 'telegramEnabled',
  youtube: 'youtubeEnabled'
};
const PLATFORM_HOST_MAP = {
  claude: ['claude.ai'],
  chatgpt: ['chatgpt.com', 'chat.openai.com'],
  gemini: ['gemini.google.com'],
  copilot: ['copilot.microsoft.com'],
  github: ['github.com'],
  vsMarketplace: ['marketplace.visualstudio.com'],
  deepseek: ['deepseek.com'],
  perplexity: ['perplexity.ai'],
  notebooklm: ['notebook.google.com', 'notebooklm.google.com'],
  aistudio: ['aistudio.google.com'],
  qwen: ['qwen.ai', 'chat.qwen.ai'],
  arena: ['arena.ai'],
  trello: ['trello.com'],
  notion: ['notion.so', 'notion.site'],
  googleWorkspace: ['docs.google.com/document', 'docs.google.com/spreadsheets'],
  gmail: ['mail.google.com'],
  googleTranslate: ['translate.google.com'],
  whatsapp: ['web.whatsapp.com'],
  telegram: ['web.telegram.org'],
  youtube: ['youtube.com']
};
const PLATFORM_KEYS = Object.values(PLATFORM_STORAGE_KEYS);

const popupState = {
  platform: null,
  values: {}
};

function normalizeEnabled(value) {
  return value === undefined ? true : Boolean(value);
}

function updateVisualState(enabled) {
  const toggle = document.getElementById('extensionToggle');
  const statusText = document.getElementById('extensionStatusText');
  const mode = document.getElementById('extensionMode');

  if (toggle && toggle.checked !== enabled) {
    toggle.checked = enabled;
  }

  if (statusText) {
    statusText.dataset.enabled = String(enabled);
  }

  if (mode) {
    mode.dataset.enabled = String(enabled);
    mode.textContent = enabled ? 'فعال' : 'غیرفعال';
  }
}

function isPlatformEnabled(platform) {
  const key = PLATFORM_STORAGE_KEYS[platform];
  return key ? normalizeEnabled(popupState.values[key]) : false;
}

function isCurrentSiteEnabled() {
  if (!popupState.platform) return normalizeEnabled(popupState.values[EXTENSION_KEY]);
  return normalizeEnabled(popupState.values[EXTENSION_KEY]) && isPlatformEnabled(popupState.platform);
}

function updateMetrics() {
  const total = document.getElementById('totalPlatformCount');
  const active = document.getElementById('activePlatformCount');
  const globallyEnabled = normalizeEnabled(popupState.values[EXTENSION_KEY]);
  const activeCount = globallyEnabled
    ? PLATFORM_KEYS.filter(key => normalizeEnabled(popupState.values[key])).length
    : 0;

  if (total) total.textContent = String(PLATFORM_KEYS.length);
  if (active) active.textContent = String(activeCount);
}

function renderStoredState() {
  updateVisualState(isCurrentSiteEnabled());
  updateMetrics();
}

function wireToggle() {
  const toggle = document.getElementById('extensionToggle');
  if (!toggle) return;

  toggle.addEventListener('change', event => {
    const enabled = Boolean(event.target.checked);
    const key = popupState.platform
      ? PLATFORM_STORAGE_KEYS[popupState.platform]
      : EXTENSION_KEY;
    if (!key) return;

    const changes = { [key]: enabled };
    // The legacy global switch is still honoured by content scripts. If it was
    // previously disabled, turning on the current site must also reopen that gate.
    if (popupState.platform && enabled && !normalizeEnabled(popupState.values[EXTENSION_KEY])) {
      changes[EXTENSION_KEY] = true;
    }

    Object.assign(popupState.values, changes);
    storage.set(changes);
    renderStoredState();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    let touched = false;
    for (const [key, change] of Object.entries(changes)) {
      if (key !== EXTENSION_KEY && !PLATFORM_KEYS.includes(key)) continue;
      popupState.values[key] = change.newValue;
      touched = true;
    }
    if (touched) renderStoredState();
  });
}

function openInternalPage(pagePath) {
  chrome.tabs.create({ url: chrome.runtime.getURL(pagePath) });
}

function wireActions() {
  const reportBtn = document.getElementById('reportBug');
  const manageBtn = document.getElementById('managePlatforms');
  const whatsNewBtn = document.getElementById('whatsNewButton');
  const feedbackBtn = document.getElementById('feedbackButton');
  const versionBadge = document.getElementById('extensionVersion');

  reportBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: REPORT_URL });
  });

  manageBtn?.addEventListener('click', () => {
    openInternalPage(SIDE_PANEL_PAGE);
  });

  whatsNewBtn?.addEventListener('click', () => openInternalPage(WHATS_NEW_PAGE));
  feedbackBtn?.addEventListener('click', () => chrome.tabs.create({ url: FEEDBACK_URL }));

  // The version badge doubles as a shortcut to the changelog.
  versionBadge?.addEventListener('click', () => openInternalPage(WHATS_NEW_PAGE));
  versionBadge?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openInternalPage(WHATS_NEW_PAGE);
    }
  });
}

function updateVersion() {
  const versionElement = document.getElementById('extensionVersion');
  if (versionElement) {
    const version = chrome.runtime.getManifest().version;
    versionElement.textContent = `v${version}`;
  }
}

function detectPlatformFromUrl(urlString) {
  if (!urlString) return null;

  let parsed;
  let hostname = '';
  try {
    parsed = new URL(urlString);
    hostname = parsed.hostname.toLowerCase();
  } catch (err) {
    return null;
  }

  for (const [platform, hosts] of Object.entries(PLATFORM_HOST_MAP)) {
    const matches = hosts.some(rule => {
      const normalizedRule = rule.toLowerCase();
      const [domain, ...pathParts] = normalizedRule.split('/');
      const pathPrefix = pathParts.length ? `/${pathParts.join('/')}` : '';
      const hostMatches = hostname === domain || hostname.endsWith(`.${domain}`);
      if (!hostMatches) return false;
      return !pathPrefix || parsed.pathname.toLowerCase().startsWith(pathPrefix);
    });
    if (matches) return platform;
  }

  return null;
}

function applyPlatformSpotlight(platform) {
  const container = document.querySelector('.platforms');
  if (!container) return;

  container.classList.remove('platforms--has-active');
  container.querySelectorAll('.platform.platform--active').forEach(element => {
    element.classList.remove('platform--active');
  });

  if (!platform) return;

  const activePlatform = container.querySelector(`.platform[data-platform="${platform}"]`);
  if (!activePlatform) return;

  container.classList.add('platforms--has-active');
  activePlatform.classList.add('platform--active');
}

function initPopupState() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (chrome.runtime.lastError) return;

    const activeTab = tabs?.[0];
    const platform = detectPlatformFromUrl(activeTab?.url);
    popupState.platform = platform;
    applyPlatformSpotlight(platform);

    storage.get([EXTENSION_KEY, ...PLATFORM_KEYS], result => {
      popupState.values = result || {};
      renderStoredState();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireToggle();
  wireActions();
  updateVersion();
  initPopupState();
});
