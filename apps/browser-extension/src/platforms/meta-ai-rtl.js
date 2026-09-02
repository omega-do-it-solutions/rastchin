// Meta AI chat and generated-document Persian direction support.
(() => {
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
    const LETTER_REGEX = /\p{L}/u;
    const RTL_CLASS = 'rastchin-meta-ai-rtl';

    // Meta AI is a React application whose generated prose can appear in normal
    // chat turns, semantic articles, or its document editor. These selectors are
    // discovery boundaries only; the leaf walker below never flips their layout.
    const MESSAGE_SELECTORS = [
        '[data-message-id]',
        '[data-testid*="assistant"]',
        '[data-testid*="response"]',
        '[data-testid*="message"]',
        '[data-testid*="document"]',
        '[role="article"]',
        '[role="document"]',
        'main article',
        'main [class*="markdown"]',
        'main [class*="prose"]',
        'main p',
        'main li',
        'main blockquote',
        'main h1',
        'main h2',
        'main h3',
        'main h4',
        'main h5',
        'main h6',
        'main td',
        'main th'
    ];

    const CONTENT_BLOCK_SELECTORS = [
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'figcaption',
        'dd',
        'dt',
        'td',
        'th'
    ];
    const CONTENT_BLOCK_SELECTOR = CONTENT_BLOCK_SELECTORS.join(', ');

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '[data-language]',
        '[data-testid*="code"]',
        '[class*="code-block"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.cm-editor',
        '.monaco-editor',
        '.ace_editor'
    ];

    const UI_GUARD_SELECTORS = [
        ...CODE_GUARD_SELECTORS,
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="navigation"]',
        'nav',
        'aside',
        '[data-testid*="composer"]',
        '[data-testid*="prompt"]',
        '[aria-label*="message"][contenteditable]',
        'input',
        'textarea',
        'select',
        '[aria-hidden="true"]'
    ];
    const UI_GUARD_SELECTOR = UI_GUARD_SELECTORS.join(', ');

    function directTextOf(element) {
        if (!element?.childNodes) return '';
        let text = '';
        element.childNodes.forEach?.(node => {
            if (node?.nodeType === 3) text += node.textContent || '';
        });
        return text.replace(/\s+/g, ' ').trim();
    }

    // Match dir=auto: a Persian-first mixed paragraph should align RTL, while an
    // English-first paragraph that later mentions a Persian term remains native.
    function needsMetaAiRTL(text, engine) {
        if (!text) return false;
        const stripped = typeof engine?.stripLtrTokens === 'function'
            ? engine.stripLtrTokens(text)
            : String(text);
        const rtlRegex = engine?.rtlRegex || /\p{Script=Arabic}/u;
        for (const char of stripped) {
            if (!LETTER_REGEX.test(char)) continue;
            return rtlRegex.test(char);
        }
        return false;
    }

    function isGuarded(element) {
        if (!element || typeof element.closest !== 'function') return true;
        try {
            return Boolean(element.closest(UI_GUARD_SELECTOR));
        } catch (_) {
            return true;
        }
    }

    function collectTargets(root, engine) {
        const targets = new Set();
        const add = element => {
            if (element && !isGuarded(element)) targets.add(element);
        };

        if (root.matches?.(CONTENT_BLOCK_SELECTOR)) add(root);
        root.querySelectorAll?.(CONTENT_BLOCK_SELECTOR).forEach(add);

        // Some Meta AI turns use a bare div for the visible text. Keep this
        // fallback direct-text-only so nested React/layout wrappers are untouched.
        const fallbackElements = [];
        if (root.matches?.('div')) fallbackElements.push(root);
        root.querySelectorAll?.('div').forEach(element => fallbackElements.push(element));
        fallbackElements.forEach(element => {
            const text = directTextOf(element);
            if (!text || isGuarded(element)) return;
            if (engine.needsRTL(text) || engine.styledElements?.has(element)) {
                targets.add(element);
            }
        });

        return targets;
    }

    function applyMetaAiContent(root, engine) {
        if (!root || root.nodeType !== 1 || !root.isConnected) return true;
        collectTargets(root, engine).forEach(target => {
            const text = engine.collectDirectionText(target).trim();
            if (engine.needsRTL(text)) engine.applyRTL(target);
            else engine.restoreElement(target);
        });
        return true;
    }

    const recipe = {
        version: 1,
        storageKey: 'metaAiEnabled',
        // Do not wrap live React/editor text nodes. Block-level dir plus
        // unicode-bidi:isolate is sufficient and remains framework-safe.
        inlineIsolate: false,
        streamingSelector: '[data-is-streaming="true"], [data-message-status="in_progress"], [aria-busy="true"]',
        hosts: ['meta.ai', 'www.meta.ai'],
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: MESSAGE_SELECTORS,
        textSelectors: CONTENT_BLOCK_SELECTORS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        excludeSelectors: UI_GUARD_SELECTORS.filter(selector => !CODE_GUARD_SELECTORS.includes(selector)),
        applyToMessage: applyMetaAiContent,
        needsRTL: needsMetaAiRTL,
        rtlClass: RTL_CLASS,
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => `
            ${codeGuard},
            ${codeGuard} * {
                direction: ltr !important;
                text-align: left !important;
                font-family: ${MONO_FONT_STACK} !important;
            }

            html body .${RTL_CLASS}[dir="rtl"] {
                direction: rtl !important;
                text-align: right !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }

            .${RTL_CLASS}[dir="rtl"] :is(strong, em, b, i, a, span) {
                font-family: ${CONTENT_FONT_STACK};
            }

            .${RTL_CLASS}[dir="rtl"] :is(ul, ol),
            ul:has(> .${RTL_CLASS}[dir="rtl"]),
            ol:has(> .${RTL_CLASS}[dir="rtl"]) {
                padding-inline-start: 2rem;
            }

            table:has(.${RTL_CLASS}[dir="rtl"]) {
                direction: ltr;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__META_AI_RTL_TEST__ === 'function') {
        window.__META_AI_RTL_TEST__({
            recipe,
            messageSelectors: MESSAGE_SELECTORS,
            contentBlockSelectors: CONTENT_BLOCK_SELECTORS,
            codeGuardSelectors: CODE_GUARD_SELECTORS,
            uiGuardSelectors: UI_GUARD_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
