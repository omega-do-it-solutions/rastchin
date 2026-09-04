// src/ui/shared/platform-registry.js
// Single source of truth for the supported-platform catalog used by extension
// UI pages (side panel today; popup can converge on it next). Loaded as
// a plain <script> global — UI pages are not ES modules, mirroring the
// isolated-world global pattern of the core scripts.
//
// Field notes:
// - storageKey: the chrome.storage.sync boolean (default true / undefined=true)
//   that content scripts honor via src/core/controller.js.
// - hosts: hostname rules for active-tab detection. Strings match exact hosts.
//   A rule may carry a path prefix. Use a leading '*.'
//   only for manifest-backed wildcard subdomains such as '*.notion.site'.
// - category ids map to the options-page groups: ai = ابزارهای هوش مصنوعی,
//   work = ابزارهای کاری, comm = ارتباطات, video = ویدیو.
'use strict';

window.RASTCHIN_PLATFORMS = [
    { id: 'chatgpt', name: 'ChatGPT', storageKey: 'chatgptEnabled', hosts: ['chatgpt.com', 'chat.openai.com'], url: 'https://chatgpt.com', icon: 'ChatGPT.svg', category: 'ai' },
    { id: 'metaAi', name: 'Meta AI', storageKey: 'metaAiEnabled', hosts: ['meta.ai', 'www.meta.ai'], url: 'https://www.meta.ai', icon: 'MetaAI.svg', category: 'ai' },
    { id: 'claude', name: 'Claude', storageKey: 'claudeEnabled', hosts: ['claude.ai'], url: 'https://claude.ai', icon: 'Claude.svg', category: 'ai' },
    { id: 'gemini', name: 'Gemini', storageKey: 'geminiEnabled', hosts: ['gemini.google.com'], url: 'https://gemini.google.com', icon: 'Gemini.svg', category: 'ai' },
    { id: 'copilot', name: 'Copilot', storageKey: 'copilotEnabled', hosts: ['copilot.microsoft.com'], url: 'https://copilot.microsoft.com', icon: 'Copilot.svg', category: 'ai' },
    { id: 'perplexity', name: 'Perplexity', storageKey: 'perplexityEnabled', hosts: ['perplexity.ai', 'www.perplexity.ai'], url: 'https://perplexity.ai', icon: 'Perplexity.svg', category: 'ai' },
    { id: 'notebooklm', name: 'NotebookLM', storageKey: 'notebooklmEnabled', hosts: ['notebook.google.com', 'notebooklm.google.com'], url: 'https://notebook.google.com', icon: 'NotebookLM.svg', category: 'ai' },
    { id: 'deepseek', name: 'DeepSeek', storageKey: 'deepseekEnabled', hosts: ['chat.deepseek.com', 'www.deepseek.com', 'deepseek.com'], url: 'https://chat.deepseek.com', icon: 'Deepseek.svg', category: 'ai' },
    { id: 'aistudio', name: 'AI Studio', storageKey: 'aistudioEnabled', hosts: ['aistudio.google.com'], url: 'https://aistudio.google.com', icon: 'AIStudio.svg', category: 'ai' },
    { id: 'qwen', name: 'Qwen', storageKey: 'qwenEnabled', hosts: ['qwen.ai', 'chat.qwen.ai'], url: 'https://chat.qwen.ai', icon: 'Qwen.svg', category: 'ai' },
    { id: 'arena', name: 'Arena', storageKey: 'arenaEnabled', hosts: ['arena.ai', 'www.arena.ai'], url: 'https://arena.ai', icon: 'Arena.svg', category: 'ai' },
    { id: 'trello', name: 'Trello', storageKey: 'trelloEnabled', hosts: ['trello.com', 'www.trello.com'], url: 'https://trello.com', icon: 'Trello.svg', category: 'work' },
    { id: 'notion', name: 'Notion', storageKey: 'notionEnabled', hosts: ['notion.so', 'www.notion.so', 'app.notion.so', 'app.notion.com', '*.notion.site'], url: 'https://www.notion.so', icon: 'Notion.svg', category: 'work' },
    { id: 'linear', name: 'Linear', storageKey: 'linearEnabled', hosts: ['linear.app'], url: 'https://linear.app', icon: 'Linear.svg', category: 'work' },
    { id: 'github', name: 'GitHub', storageKey: 'githubEnabled', hosts: ['github.com'], url: 'https://github.com', icon: 'GitHub.svg', category: 'work' },
    { id: 'vsMarketplace', name: 'VS Marketplace', storageKey: 'vsMarketplaceEnabled', hosts: ['marketplace.visualstudio.com'], url: 'https://marketplace.visualstudio.com/vscode', icon: 'VisualStudioMarketplace.svg', category: 'work' },
    { id: 'gmail', name: 'Gmail', storageKey: 'gmailEnabled', hosts: ['mail.google.com'], url: 'https://mail.google.com', icon: 'Gmail.svg', category: 'comm' },
    { id: 'googleTranslate', name: 'Google Translate', storageKey: 'googleTranslateEnabled', hosts: ['translate.google.com'], url: 'https://translate.google.com', icon: 'GoogleTranslate.svg', category: 'comm' },
    { id: 'whatsapp', name: 'WhatsApp', storageKey: 'whatsappEnabled', hosts: ['web.whatsapp.com'], url: 'https://web.whatsapp.com', icon: 'WhatsApp.svg', category: 'comm' },
    { id: 'telegram', name: 'Telegram', storageKey: 'telegramEnabled', hosts: ['web.telegram.org'], url: 'https://web.telegram.org', icon: 'Telegram.svg', category: 'comm' },
    { id: 'googleWorkspace', name: 'Google Docs/Sheets', storageKey: 'googleWorkspaceEnabled', hosts: ['docs.google.com/document', 'docs.google.com/spreadsheets'], url: 'https://docs.google.com', icon: 'GoogleWorkspace.svg', category: 'work' },
    { id: 'youtube', name: 'YouTube', storageKey: 'youtubeEnabled', hosts: ['www.youtube.com', 'm.youtube.com'], url: 'https://www.youtube.com', icon: 'YouTube.svg', category: 'video' }
];

window.RASTCHIN_PLATFORM_CATEGORIES = [
    { id: 'ai', label: 'ابزارهای هوش مصنوعی' },
    { id: 'work', label: 'ابزارهای کاری' },
    { id: 'comm', label: 'ارتباطات' },
    { id: 'video', label: 'ویدیو' }
];

// Exact-host rules by default, plus optional manifest-backed wildcard
// subdomains and path prefixes after the first '/'.
window.rastchinMatchPlatformFromUrl = function rastchinMatchPlatformFromUrl(urlString) {
    if (!urlString) return null;

    let parsed;
    let hostname = '';
    try {
        parsed = new URL(urlString);
        hostname = parsed.hostname.toLowerCase();
    } catch (_) {
        return null;
    }

    for (const platform of window.RASTCHIN_PLATFORMS) {
        const matches = platform.hosts.some(rule => {
            const normalizedRule = rule.toLowerCase();
            const wildcardSubdomain = normalizedRule.startsWith('*.');
            const normalizedMatch = wildcardSubdomain ? normalizedRule.slice(2) : normalizedRule;
            const [domain, ...pathParts] = normalizedMatch.split('/');
            const pathPrefix = pathParts.length ? `/${pathParts.join('/')}` : '';
            const hostMatches = wildcardSubdomain ? hostname.endsWith(`.${domain}`) : hostname === domain;
            if (!hostMatches) return false;
            return !pathPrefix || parsed.pathname.toLowerCase().startsWith(pathPrefix);
        });
        if (matches) return platform;
    }

    return null;
};
