// scripts/gemini-rtl.js
(() => {
    const IS_RTL = /\p{Script=Arabic}/u;
    const IS_LTR = /\p{Script=Latin}/u;
    const STRONG_LETTER = /\p{L}/u;

    const MESSAGE_SELECTORS = [
        '[data-test-id="luminous-collapsed-bubble"]',
        '[id^="model-response-message-content"]',
        '[id^="model-user-message-content"]'
    ];

    const UI_EXCLUDE_SELECTORS = [
        '[data-test-id="overflow-container"]',
        '[data-test-id="overflow-container"] *',
        '[data-test-id="all-conversations"]',
        '[data-test-id="all-conversations"] *',
        '[data-test-id="conversation"]',
        '[data-test-id="chats-expandable-section"]',
        '[data-test-id="chats-expandable-section"] *',
        '[data-test-id="notebooks-expandable-section"]',
        '[data-test-id="notebooks-expandable-section"] *',
        '[data-test-id="new-chat-button"]',
        '[data-test-id="search-chats-button"]',
        '[data-test-id="videos-side-nav-entry-button"]',
        '[data-test-id="my-stuff-side-nav-entry-button"]',
        'conversations-list',
        'conversations-list *',
        'project-sidenav-list',
        'project-sidenav-list *',
        'mat-nav-list[gem-sidenav-list]',
        'mat-nav-list[gem-sidenav-list] *',
        '.gds-sidenav-list',
        '.gds-sidenav-list *',
        'input',
        'textarea',
        '[contenteditable="true"]',
        '[contenteditable=""]',
        '[contenteditable]:not([contenteditable="false"])'
    ];

    const TEXTUAL_DESCENDANTS = [
        'p',
        'ul',
        'ol',
        'li',
        'blockquote',
        'figcaption',
        'strong',
        'em',
        'td',
        'th',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        '.query-text-line',
        '.query-text'
    ];
    const TEXTUAL_SELECTOR = TEXTUAL_DESCENDANTS.join(', ');

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '[data-test-id="code-content"]',
        '.code-container',
        '.formatted-code-block-internal-container',
        '[class*="code-block"]',
        '[class*="codeBlock"]',
        '[role="code"]',
        '.monaco-editor',
        '.cm-editor'
    ];
    const CODE_GUARD = CODE_GUARD_SELECTORS.join(', ');
    const UI_EXCLUDE = UI_EXCLUDE_SELECTORS.join(', ');

    let elementDirections = new WeakMap();

    function normalizeText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function findFirstStrongChar(text) {
        for (const char of text) {
            if (STRONG_LETTER.test(char)) return char;
        }
        return null;
    }

    function detectDirection(text) {
        const normalized = normalizeText(text);
        if (!normalized) return null;

        let rtlCount = 0;
        let ltrCount = 0;

        for (const char of normalized) {
            if (!STRONG_LETTER.test(char)) continue;
            if (IS_RTL.test(char)) {
                rtlCount++;
            } else if (IS_LTR.test(char)) {
                ltrCount++;
            }
        }

        if (!rtlCount && !ltrCount) return null;
        if (rtlCount === ltrCount) {
            const firstStrong = findFirstStrongChar(normalized);
            if (!firstStrong) return null;
            return IS_RTL.test(firstStrong) ? 'rtl' : 'ltr';
        }

        return rtlCount > ltrCount ? 'rtl' : 'ltr';
    }

    function isInExcludedUi(el) {
        if (!el || !(el instanceof Element)) return false;
        return Boolean(el.closest(UI_EXCLUDE));
    }

    function restoreElement(engine, el) {
        if (!el || !(el instanceof HTMLElement)) return;
        const snapshot = engine.styledElements?.get(el);
        if (!snapshot) {
            elementDirections.delete(el);
            return;
        }

        if (snapshot.dirAttr === null) {
            el.removeAttribute('dir');
        } else {
            el.setAttribute('dir', snapshot.dirAttr);
        }
        el.style.direction = snapshot.styleDirection || '';
        el.style.textAlign = snapshot.styleTextAlign || '';
        el.style.unicodeBidi = snapshot.styleUnicodeBidi || '';
        if (engine.rtlClass) {
            if (snapshot.hadRtlClass) {
                el.classList.add(engine.rtlClass);
            } else {
                el.classList.remove(engine.rtlClass);
            }
        }
        engine.styledElements.delete(el);
        elementDirections.delete(el);
    }

    function applyDirection(engine, el, direction) {
        if (!el || !(el instanceof HTMLElement)) return;
        if (engine.isExcluded(el)) return;
        if (isInExcludedUi(el)) return;

        if (direction !== 'rtl') {
            if (elementDirections.has(el)) {
                engine.clearInline?.(el);
                restoreElement(engine, el);
            }
            return;
        }

        const previous = elementDirections.get(el);
        if (previous === 'rtl') {
            engine.isolateInline?.(el);
            return;
        }

        engine.applyRTL(el);
        elementDirections.set(el, 'rtl');
    }

    const recipe = {
        version: 1,
        storageKey: 'geminiEnabled',
        inlineIsolate: true,
        hosts: ['gemini.google.com'],
        rtlRegex: IS_RTL,
        rtlStyle: { unicodeBidi: 'isolate' },
        messageSelectors: MESSAGE_SELECTORS,
        excludeSelectors: UI_EXCLUDE_SELECTORS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        isCodeLike: el => {
            if (!el || !(el instanceof HTMLElement)) return true;
            if (isInExcludedUi(el)) return true;
            return Boolean(el.closest(CODE_GUARD));
        },
        applyToMessage: (el, engine) => {
            if (!el || !(el instanceof HTMLElement) || !el.isConnected) return true;
            if (isInExcludedUi(el)) return true;

            const candidates = new Set();

            if (el.matches('[data-test-id="luminous-collapsed-bubble"]')) {
                candidates.add(el);
            }

            el.querySelectorAll(TEXTUAL_SELECTOR).forEach(node => {
                if (node instanceof HTMLElement && !isInExcludedUi(node)) {
                    candidates.add(node);
                }
            });

            candidates.forEach(node => {
                const dir = detectDirection(engine.stripLtrTokens(engine.collectDirectionText(node)));
                applyDirection(engine, node, dir);
            });

            return true;
        },
        onDisable: () => {
            elementDirections = new WeakMap();
        },
        globalCss: (codeGuard, ctx) => {
            const messageScope = `:is(${ctx.messageSelectors.join(', ')})`;
            const codeScope = `:is(${ctx.codeGuardSelectors.join(', ')})`;
            return `
            ${messageScope} ${codeScope} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: embed;
            }

            ${messageScope} :is(ul, ol)[dir="rtl"] {
                direction: rtl !important;
                text-align: right !important;
                list-style: none !important;
                margin-inline-start: 0 !important;
                margin-inline-end: 0 !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding-inline-start: 0 !important;
                padding-inline-end: 0 !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
            }

            ${messageScope} :is(ul, ol)[dir="rtl"] > li {
                direction: rtl !important;
                text-align: right !important;
                list-style: none !important;
                position: relative !important;
                padding-inline-start: 1.55rem !important;
                padding-inline-end: 0 !important;
                padding-left: 0 !important;
                padding-right: 1.55rem !important;
            }

            ${messageScope} ol[dir="rtl"] {
                counter-reset: rastchin-gemini-rtl-list;
            }

            ${messageScope} ol[dir="rtl"] > li {
                counter-increment: rastchin-gemini-rtl-list;
            }

            ${messageScope} :is(ul, ol)[dir="rtl"] > li::before {
                display: block !important;
                position: absolute !important;
                right: 0 !important;
                left: auto !important;
                top: 0.72em !important;
                transform: translateY(-50%) !important;
                line-height: 1 !important;
                text-align: right !important;
                direction: rtl !important;
            }

            ${messageScope} ul[dir="rtl"] > li::before {
                content: "\\25E6" !important;
                width: 1rem !important;
            }

            ${messageScope} ol[dir="rtl"] > li::before {
                content: counter(rastchin-gemini-rtl-list) "." !important;
                width: 1.15rem !important;
            }

            ${messageScope} [dir="rtl"] table {
                direction: rtl;
            }
        `;
        }
    };

    RastChinRecipe.runPlatformRecipe(recipe);
})();
