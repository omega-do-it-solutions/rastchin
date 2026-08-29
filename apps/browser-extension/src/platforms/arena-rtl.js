// scripts/arena-rtl.js
(() => {
    const recipe = {
        version: 1,
        storageKey: 'arenaEnabled',
        inlineIsolate: true,
        hosts: ['arena.ai', 'www.arena.ai'],
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: [
            'div.bg-surface-primary',
            'div.bg-surface-raised',
            '.prose',
            '[data-testid="message"]',
            '[data-message-id]',
            '[data-role="message"]',
            '[data-role="assistant"]',
            '[data-role="user"]',
            '[class*="message"]',
            '[class*="markdown"]',
            'article',
            'section'
        ],
        textSelectors: [
            'p',
            'div',
            'span',
            'li',
            'ul',
            'ol',
            'blockquote',
            'figcaption',
            'strong',
            'em',
            'td',
            'th',
            'tr',
            'table',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6'
        ],
        codeGuardSelectors: [
            'code',
            'pre',
            '[class*="code"]',
            '[class*="Code"]',
            '[data-language]',
            '[class*="syntax"]',
            '[class*="hljs"]',
            '.monaco-editor',
            '.cm-editor'
        ],
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => `
            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
            }

            [dir="rtl"] ul,
            [dir="rtl"] ol {
                padding-right: 1.6rem;
                padding-left: 0;
            }

            [dir="rtl"] table {
                direction: rtl;
            }

            [dir="rtl"] input,
            [dir="rtl"] textarea {
                text-align: right;
            }
        `
    };

    RastChinRecipe.runPlatformRecipe(recipe);
})();
