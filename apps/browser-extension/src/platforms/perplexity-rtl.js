// scripts/perplexity-rtl.js
(() => {
    const recipe = {
        version: 1,
        storageKey: 'perplexityEnabled',
        inlineIsolate: true,
        hosts: ['perplexity.ai', 'www.perplexity.ai'],
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: [
            'main article',
            'main section',
            'main div[class*="answer"]',
            'main div[class*="response"]',
            'main div[class*="markdown"]',
            'main div[class*="prose"]',
            'main div[class*="content"]',
            '[data-testid*="answer"]',
            '[data-testid*="message"]',
            '[data-message-id]',
            '[class*="conversation"] article',
            '[class*="conversation"] section',
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
            '[data-testid*="code"]',
            '[data-language]',
            '.monaco-editor',
            '.cm-editor',
            '[class*="hljs"]'
        ],
        // Preserve the old Perplexity behavior: the bespoke script used the
        // engine default (`plaintext`), while recipe-runner defaults to isolate.
        rtlStyle: { unicodeBidi: 'plaintext' },
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

            [dir="rtl"] table {
                direction: rtl;
            }

            [role="textbox"],
            [contenteditable]:not([contenteditable="false"]),
            [role="textbox"] *,
            [contenteditable]:not([contenteditable="false"]) * {
                font-family: "Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }
        `
    };

    RastChinRecipe.runPlatformRecipe(recipe);
})();
