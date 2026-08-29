// scripts/controller.js
// Centralised settings management for chatbot-specific features

const URL_TO_CHATBOT = {
    'claude.ai': 'claudeEnabled',
    'chat.openai.com': 'chatgptEnabled',
    'chatgpt.com': 'chatgptEnabled',
    'gemini.google.com': 'geminiEnabled',
    'claudeusercontent.com': 'claudeEnabled',
    'claudemcpcontent.com': 'claudeEnabled',
    'perplexity.ai': 'perplexityEnabled',
    'www.perplexity.ai': 'perplexityEnabled',
    'chat.deepseek.com': 'deepseekEnabled',
    'www.deepseek.com': 'deepseekEnabled',
    'deepseek.com': 'deepseekEnabled',
    'copilot.microsoft.com': 'copilotEnabled',
    'github.com': 'githubEnabled',
    'marketplace.visualstudio.com': 'vsMarketplaceEnabled',
    'notebook.google.com': 'notebooklmEnabled',
    'notebooklm.google.com': 'notebooklmEnabled',
    'aistudio.google.com': 'aistudioEnabled',
    'qwen.ai': 'qwenEnabled',
    'chat.qwen.ai': 'qwenEnabled',
    'arena.ai': 'arenaEnabled',
    'www.arena.ai': 'arenaEnabled',
    'trello.com': 'trelloEnabled',
    'www.trello.com': 'trelloEnabled',
    'notion.so': 'notionEnabled',
    'www.notion.so': 'notionEnabled',
    'app.notion.so': 'notionEnabled',
    'notion.site': 'notionEnabled',
    'mail.google.com': 'gmailEnabled',
    'translate.google.com': 'googleTranslateEnabled',
    'docs.google.com': 'googleWorkspaceEnabled',
    'web.whatsapp.com': 'whatsappEnabled',
    'web.telegram.org': 'telegramEnabled',
    'www.youtube.com': 'youtubeEnabled',
    'm.youtube.com': 'youtubeEnabled'
};

const SUFFIX_TO_CHATBOT = [
    { suffix: '.claudeusercontent.com', key: 'claudeEnabled' },
    { suffix: '.claudemcpcontent.com', key: 'claudeEnabled' },
    { suffix: '.notion.site', key: 'notionEnabled' }
];

const EXTENSION_ENABLED_KEY = 'extensionEnabled';
const UNIQUE_KEYS = [EXTENSION_ENABLED_KEY, ...new Set(Object.values(URL_TO_CHATBOT))];
const DEFAULT_STATE = true;

const state = {
    ready: false,
    values: {},
    queue: [],
    listeners: new Set()
};

function hostnameFromUrl(url) {
    const match = String(url || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i);
    return match ? match[1].toLowerCase() : '';
}

function hasAncestorHost(expectedHostname) {
    const hostname = window.location.hostname;
    if (hostname) return false;
    const expected = String(expectedHostname || '').toLowerCase();

    try {
        const referrer = (typeof document !== 'undefined' && document.referrer) ? document.referrer : '';
        if (hostnameFromUrl(referrer) === expected) return true;
    } catch (_) {}

    try {
        const origins = Array.from(window.location.ancestorOrigins || []);
        return origins.some(origin => hostnameFromUrl(origin) === expected);
    } catch (_) {
        return false;
    }
}

function hasGoogleWorkspaceAncestor() {
    return hasAncestorHost('docs.google.com');
}

function hasClaudeAncestor() {
    return hasAncestorHost('claude.ai');
}

function resolveChatbotKey() {
    const hostname = window.location.hostname;
    if (URL_TO_CHATBOT[hostname]) return URL_TO_CHATBOT[hostname];
    const suffixMatch = SUFFIX_TO_CHATBOT.find(({ suffix }) => hostname.endsWith(suffix));
    if (suffixMatch) return suffixMatch.key;
    if (hasClaudeAncestor()) return 'claudeEnabled';
    if (hasGoogleWorkspaceAncestor()) return 'googleWorkspaceEnabled';
    return null;
}

function normalizeEnabled(value) {
    return value === undefined ? DEFAULT_STATE : Boolean(value);
}

function snapshot() {
    const key = resolveChatbotKey();
    const globalEnabled = normalizeEnabled(state.values[EXTENSION_ENABLED_KEY]);
    const platformEnabled = key ? normalizeEnabled(state.values[key]) : DEFAULT_STATE;
    const enabled = globalEnabled && platformEnabled;
    return { key, enabled, globalEnabled };
}

function notifyListeners() {
    const current = snapshot();
    state.listeners.forEach(listener => {
        try {
            listener(current);
        } catch (err) {
            console.error('chatbotConfig listener failed', err);
        }
    });
}

function flushQueue() {
    if (!state.ready) return;
    const current = snapshot();
    while (state.queue.length) {
        const cb = state.queue.shift();
        try {
            cb(current.enabled);
        } catch (err) {
            console.error('chatbotConfig queued callback failed', err);
        }
    }
}

function primeSettings() {
    chrome.storage.sync.get(UNIQUE_KEYS, result => {
        state.values = result || {};
        state.ready = true;
        flushQueue();
        notifyListeners();
    });
}

function ensureStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        let touched = false;
        for (const [key, diff] of Object.entries(changes)) {
            if (!UNIQUE_KEYS.includes(key)) continue;
            state.values[key] = diff.newValue;
            touched = true;
        }

        if (touched) {
            flushQueue();
            notifyListeners();
        }
    });
}

function isEnabled(callback) {
    if (state.ready) {
        callback(snapshot().enabled);
    } else {
        state.queue.push(callback);
    }
}

function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    state.listeners.add(listener);
    if (state.ready) {
        try {
            listener(snapshot());
        } catch (err) {
            console.error('chatbotConfig listener failed', err);
        }
    }
    return () => state.listeners.delete(listener);
}

function getCurrentPlatformInfo() {
    return {
        type: 'rastchin:platform-info',
        storageKey: resolveChatbotKey(),
        hostname: window.location.hostname
    };
}

function ensureRuntimeMessageListener() {
    if (!chrome.runtime?.onMessage?.addListener) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'rastchin:get-platform') return false;
        sendResponse(getCurrentPlatformInfo());
        return false;
    });
}

primeSettings();
ensureStorageListener();
ensureRuntimeMessageListener();

window.chatbotConfig = {
    isEnabled,
    subscribe,
    getCurrentChatbot: resolveChatbotKey,
    getCurrentPlatformInfo
};
