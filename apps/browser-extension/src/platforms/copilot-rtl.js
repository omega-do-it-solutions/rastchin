// scripts/copilot-rtl.js
(() => {
    const recipe = {
        version: 1,
        storageKey: 'copilotEnabled',
        inlineIsolate: true,
        hosts: ['copilot.microsoft.com'],
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: [
            'cib-message',
            'cib-chat-turn',
            '[data-message-id]',
            '[data-content="ai-message"]',
            '[data-content="user-message"]',
            '[data-content*="message"]',
            '[data-testid*="message"]',
            '[class*="cib-message"]',
            '[class*="cib-chat-turn"]',
            '[class*="chat-turn"]',
            '[class*="ai-message"]',
            '[class*="message-item"]',
            '[role="article"]',
            'main [data-message-id]',
            'main [data-content*="message"]',
            'main [class*="cib-message"]',
            'main [class*="ai-message"]',
            'main [role="article"]',
            'span.font-ligatures-none'
        ],
        textSelectors: [
            'p',
            'div',
            'span',
            'li',
            'blockquote',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol'
        ],
        codeGuardSelectors: [
            'code',
            'pre',
            '[class*="code"]',
            '[class*="Code"]',
            '[class*="hljs"]',
            '.monaco-editor',
            '.cm-editor',
            '.ace_editor'
        ],
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => `
            ${codeGuard},
            [class*="language-"] {
                direction: ltr !important;
                text-align: left !important;
            }

            [dir="rtl"] ul,
            [dir="rtl"] ol {
                padding-right: 2rem;
                padding-left: 0;
            }

            [dir="rtl"] button,
            [dir="rtl"] a,
            [dir="rtl"] li {
                text-align: right;
            }
        `
    };

    RastChinRecipe.runPlatformRecipe(recipe);
})();
