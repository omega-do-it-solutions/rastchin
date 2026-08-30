// scripts/deepseek-rtl.js
(() => {
    const IS_RTL = /\p{Script=Arabic}/u;

    const MESSAGE_SELECTORS = [
        '[data-message-id]',
        '[data-role="message"]',
        '[data-role="assistant"]',
        '[data-role="user"]',
        '[class*="ds-message"]',
        '[class*="ds-markdown"]',
        '[class*="markdown"]',
        '[class*="chat"]',
        'article',
        'section'
    ];

    const TEXTUAL_DESCENDANTS = [
        'p',
        'div',
        'span',
        'li',
        'ul',
        'ol',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6'
    ];

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '[class*="code"]',
        '[class*="Code"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.monaco-editor',
        '.cm-editor'
    ];
    const CODE_GUARD = CODE_GUARD_SELECTORS.join(', ');
    const TEXTUAL_SELECTOR = TEXTUAL_DESCENDANTS.join(', ');

    const recipe = {
        version: 1,
        hosts: ['chat.deepseek.com', 'www.deepseek.com', 'deepseek.com'],
        storageKey: 'deepseekEnabled',
        inlineIsolate: true,
        messageSelectors: MESSAGE_SELECTORS,
        textSelectors: TEXTUAL_DESCENDANTS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        rtlRegex: IS_RTL,
        rtlStyle: { unicodeBidi: '' },
        isCodeLike: el => el instanceof HTMLElement && !!el.closest(CODE_GUARD),
        applyToMessage: (el, engine) => {
            if (!el || !(el instanceof HTMLElement) || !el.isConnected) return true;
            const text = engine.collectDirectionText(el);
            if (!engine.needsRTL(text)) {
                engine.restoreSubtree(el);
                return true;
            }

            engine.applyRTL(el);

            el.querySelectorAll(TEXTUAL_SELECTOR).forEach(child => {
                if (child.closest(CODE_GUARD)) return;
                engine.applyRTL(child);
            });

            return true;
        },
        globalCss: codeGuard => `
            ${codeGuard} {
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
