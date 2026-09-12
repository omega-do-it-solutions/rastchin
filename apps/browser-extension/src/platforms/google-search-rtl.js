(() => {
    const FONT_URL = chrome.runtime.getURL('src/assets/fonts/Vazirmatn[wght].ttf');
    const MODIFIED_ATTR = 'data-rastchin-google-search';
    const MODIFIED_CLASS = 'rastchin-google-search-rtl';
    const RTL_SCRIPT_REGEX = /\p{Script=Arabic}/u;
    const LETTER_REGEX = /\p{L}/u;

    const SEARCH_INPUT_SELECTORS = [
        'textarea[name="q"]',
        'input[name="q"]'
    ];

    const ORGANIC_RESULT_SELECTORS = [
        '#search h3',
        '#search [data-sncf]',
        '#search .VwiC3b'
    ];

    // Google changes generated class names frequently. The IDs and data
    // attributes below are the stable boundaries currently shared by the
    // classic results page and AI Overview responses.
    const AI_ROOT_SELECTORS = [
        '#Odp5De',
        '[data-scope-id="turn"]',
        '[data-subtree="aimc"]'
    ];

    const AI_TEXT_SELECTORS = [
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
        'td',
        'th',
        '[role="heading"]',
        'div'
    ];

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        'kbd',
        'samp',
        '[data-language]',
        '[data-node-type="codeBlock"]',
        '[class*="code-block"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.cm-editor',
        '.monaco-editor',
        '.ace_editor'
    ];

    const OUT_OF_SCOPE_SELECTORS = [
        'header',
        'nav',
        'footer',
        'button',
        'select',
        '[role="button"]',
        '[role="navigation"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="tablist"]',
        '[aria-hidden="true"]'
    ];

    const AI_ROOT_SELECTOR = AI_ROOT_SELECTORS.join(', ');
    const SEARCH_INPUT_SELECTOR = SEARCH_INPUT_SELECTORS.join(', ');
    const ORGANIC_RESULT_SELECTOR = ORGANIC_RESULT_SELECTORS.join(', ');
    const GUARDED_SELECTOR = [...CODE_GUARD_SELECTORS, ...OUT_OF_SCOPE_SELECTORS].join(', ');
    const SEMANTIC_BLOCK_SELECTOR = AI_TEXT_SELECTORS.filter(selector => selector !== 'div').join(', ');
    const AI_MESSAGE_SELECTORS = AI_ROOT_SELECTORS.flatMap(root =>
        AI_TEXT_SELECTORS.map(target => `${root} ${target}`)
    );

    const modifiedElements = new Set();
    let inputListener = null;

    function isSupportedHost(hostname) {
        return hostname === 'google.com' || hostname === 'www.google.com';
    }

    function isHtmlElement(element) {
        return typeof HTMLElement === 'undefined' || element instanceof HTMLElement;
    }

    function matches(element, selector) {
        try {
            return Boolean(element?.matches?.(selector));
        } catch (_) {
            return false;
        }
    }

    function closest(element, selector) {
        try {
            return element?.closest?.(selector) || null;
        } catch (_) {
            return null;
        }
    }

    function isGuarded(element) {
        return isHtmlElement(element) && Boolean(closest(element, GUARDED_SELECTOR));
    }

    function textOf(element, engine) {
        if (!element) return '';
        if (typeof element.value === 'string') return element.value;
        return engine?.collectDirectionText?.(element) || element.innerText || element.textContent || '';
    }

    // The product contract for search results is first-strong direction: a
    // Persian-first block becomes RTL, while an English-first block containing a
    // later Persian phrase stays in Google's native LTR flow. URLs and code-like
    // tokens are removed by the shared engine before the first letter is read.
    function startsWithRtlText(text, engine) {
        const rawText = String(text || '');
        const normalized = typeof engine?.stripLtrTokens === 'function'
            ? engine.stripLtrTokens(rawText)
            : rawText;
        for (const character of normalized) {
            if (!LETTER_REGEX.test(character)) continue;
            return RTL_SCRIPT_REGEX.test(character);
        }
        return false;
    }

    function isSearchInput(element) {
        return isHtmlElement(element) && matches(element, SEARCH_INPUT_SELECTOR);
    }

    function isOrganicTitle(element) {
        return isHtmlElement(element) && matches(element, 'h3') && Boolean(closest(element, '#search'));
    }

    function isOrganicSnippet(element) {
        if (!isHtmlElement(element) || !closest(element, '#search')) return false;
        if (matches(element, '.VwiC3b')) return true;
        if (!matches(element, '[data-sncf]')) return false;
        // Prefer Google's dedicated snippet child when it exists. This avoids
        // changing a result-card wrapper that also owns menus and metadata.
        return !element.querySelector?.('.VwiC3b');
    }

    function hasOwnText(element) {
        const nodes = Array.from(element?.childNodes || []);
        if (!nodes.length) return Boolean((element?.textContent || '').trim());
        return nodes.some(node => {
            if (node.nodeType === 3) return Boolean((node.textContent || '').trim());
            if (node.nodeType !== 1 || isGuarded(node)) return false;
            const tag = String(node.tagName || '').toUpperCase();
            const inlineTag = ['A', 'B', 'BDI', 'CITE', 'EM', 'I', 'MARK', 'SMALL', 'SPAN', 'STRONG', 'TIME'].includes(tag);
            return inlineTag && Boolean((node.textContent || '').trim());
        });
    }

    function isAiTextTarget(element) {
        if (!isHtmlElement(element) || isGuarded(element)) return false;
        if (!closest(element, AI_ROOT_SELECTOR)) return false;
        if (matches(element, SEMANTIC_BLOCK_SELECTOR)) return Boolean((element.textContent || '').trim());
        if (!matches(element, 'div') || !hasOwnText(element)) return false;
        // A layout wrapper with real block descendants must keep Google's own
        // direction. Its leaf prose blocks are scanned independently.
        return !element.querySelector?.(SEMANTIC_BLOCK_SELECTOR);
    }

    function isGoogleSearchTextBlock(element) {
        if (!isHtmlElement(element) || !isSupportedHost(window.location.hostname)) return false;
        if (isGuarded(element)) return false;
        return isSearchInput(element) || isOrganicTitle(element) || isOrganicSnippet(element) || isAiTextTarget(element);
    }

    function restoreElement(element, engine) {
        if (!element) return;
        engine?.restoreElement?.(element);
        element.removeAttribute?.(MODIFIED_ATTR);
        element.classList?.remove(MODIFIED_CLASS);
        modifiedElements.delete(element);
    }

    function applyElement(element, engine) {
        if (element.getAttribute?.(MODIFIED_ATTR) === 'rtl') return;
        engine.applyRTL(element);
        element.setAttribute(MODIFIED_ATTR, 'rtl');
        element.classList?.add(MODIFIED_CLASS);
        modifiedElements.add(element);
    }

    function processGoogleSearchBlock(element, engine) {
        if (!isGoogleSearchTextBlock(element)) {
            if (element?.getAttribute?.(MODIFIED_ATTR) === 'rtl') restoreElement(element, engine);
            return true;
        }

        const text = textOf(element, engine).trim();
        if (text && startsWithRtlText(text, engine)) applyElement(element, engine);
        else restoreElement(element, engine);
        return true;
    }

    function inputTarget(target) {
        if (!isHtmlElement(target) || !isSupportedHost(window.location.hostname)) return null;
        const candidate = isSearchInput(target) ? target : closest(target, SEARCH_INPUT_SELECTOR);
        return candidate && !isGuarded(candidate) ? candidate : null;
    }

    function attachInputListener(engine) {
        if (inputListener || !document.addEventListener) return;
        inputListener = event => {
            const target = inputTarget(event?.target);
            if (target) engine.scheduleScan(target);
        };
        document.addEventListener('input', inputListener, true);
        document.addEventListener('compositionend', inputListener, true);
    }

    function detachInputListener() {
        if (!inputListener || !document.removeEventListener) return;
        document.removeEventListener('input', inputListener, true);
        document.removeEventListener('compositionend', inputListener, true);
        inputListener = null;
    }

    function cleanUpStyles(engine) {
        detachInputListener();
        Array.from(modifiedElements).forEach(element => restoreElement(element, engine));
        document.querySelectorAll?.(`[${MODIFIED_ATTR}="rtl"]`).forEach(element => restoreElement(element, engine));
    }

    const recipe = {
        version: 1,
        storageKey: 'googleSearchEnabled',
        hosts: ['google.com', 'www.google.com'],
        messageSelectors: [
            ...SEARCH_INPUT_SELECTORS,
            ...ORGANIC_RESULT_SELECTORS,
            ...AI_MESSAGE_SELECTORS
        ],
        excludeSelectors: [...CODE_GUARD_SELECTORS, ...OUT_OF_SCOPE_SELECTORS],
        textSelectors: [],
        rtlRegex: RTL_SCRIPT_REGEX,
        rtlClass: MODIFIED_CLASS,
        rtlStyle: { unicodeBidi: 'plaintext' },
        inlineIsolate: false,
        needsRTL: startsWithRtlText,
        isCodeLike: isGuarded,
        applyToMessage: processGoogleSearchBlock,
        onEnable: attachInputListener,
        onDisable: cleanUpStyles,
        globalCss: () => `
            @font-face {
                font-family: "Vazirmatn";
                src: url(${JSON.stringify(FONT_URL)}) format("truetype-variations");
                font-weight: 100 900;
                font-style: normal;
                font-display: swap;
                unicode-range:
                    U+0600-06FF,
                    U+0750-077F,
                    U+08A0-08FF,
                    U+FB50-FDFF,
                    U+FE70-FEFF,
                    U+200C,
                    U+200D,
                    U+0660-0669;
            }

            .${MODIFIED_CLASS} {
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
            }

            li.${MODIFIED_CLASS} {
                list-style-position: outside !important;
            }

            .${MODIFIED_CLASS} :is(code, pre, kbd, samp, [dir="ltr"]) {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__GOOGLE_SEARCH_RTL_TEST__ === 'function') {
        window.__GOOGLE_SEARCH_RTL_TEST__({
            recipe,
            isSupportedHost,
            startsWithRtlText,
            isGoogleSearchTextBlock,
            isAiTextTarget,
            searchInputSelectors: SEARCH_INPUT_SELECTORS,
            organicResultSelectors: ORGANIC_RESULT_SELECTORS,
            aiRootSelectors: AI_ROOT_SELECTORS,
            outOfScopeSelectors: OUT_OF_SCOPE_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
