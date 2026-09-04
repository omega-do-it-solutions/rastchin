// src/platforms/gmail-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-gmail-font';
    const MODIFIED_CLASS = 'rastchin-gmail-font';
    const RTL_ATTR = 'data-rastchin-gmail-rtl';
    const RTL_CLASS = 'rastchin-gmail-rtl';
    const PERSIAN_TEXT_REGEX = /\p{Script=Arabic}/u;

    const TEXT_BLOCK_SELECTORS = [
        '.zA',
        '.bog',
        '.y2',
        '.bqe',
        '.hP',
        '.a3s',
        '.ii.gt',
        '.adn.ads',
        '.gs',
        '.Am.Al.editable',
        '[role="textbox"][contenteditable="true"]',
        '[aria-label][contenteditable="true"]'
    ];

    const TEXT_TARGET_SELECTORS = [
        '.bog',
        '.y2',
        '.bqe',
        '.hP',
        '.a3s',
        '.ii.gt',
        '.Am.Al.editable',
        '[role="textbox"][contenteditable="true"]',
        '[aria-label][contenteditable="true"]',
        'p',
        'div',
        'span',
        'li',
        'blockquote'
    ];

    // Keep direction changes confined to Gmail's visible subject/snippet text.
    // Applying RTL to the row or message container would also flip senders,
    // timestamps, actions, quoted mail and other application layout.
    const RTL_TARGET_SELECTORS = [
        '.bog',
        '.y2',
        '.bqe',
        '.hP'
    ];

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        'kbd',
        'samp',
        '[class*="code"]',
        '[class*="Code"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '[style*="monospace"]',
        '[role="code"]'
    ];

    const OUT_OF_SCOPE_SELECTORS = [
        '.gb_T',
        '.gb_F',
        '.gb_y',
        '[role="navigation"]',
        '[role="banner"]',
        '[role="toolbar"]',
        '[aria-label="Google apps"]',
        '[aria-label="Main menu"]'
    ];

    const modifiedElements = new Set();
    const originalStyles = new WeakMap();

    function selectorList(selectors) {
        return selectors.join(', ');
    }

    function matchesAny(element, selectors) {
        return selectors.some(selector => {
            try {
                return element.matches?.(selector);
            } catch (_) {
                return false;
            }
        });
    }

    function isSupportedHost(hostname) {
        return hostname === 'mail.google.com';
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.isConnected) return false;
        if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden';
    }

    function isCodeLike(element) {
        return element instanceof HTMLElement && !!element.closest(selectorList(CODE_GUARD_SELECTORS));
    }

    function isOutOfScope(element) {
        return element instanceof HTMLElement && !!element.closest(selectorList(OUT_OF_SCOPE_SELECTORS));
    }

    function isGmailTextBlock(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isSupportedHost(window.location.hostname)) return false;
        if (!matchesAny(element, TEXT_BLOCK_SELECTORS)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        return (element.textContent || '').trim().length > 0;
    }

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(Boolean)));
    }

    function getTextTargets(block) {
        const targets = [];
        if (block instanceof HTMLElement
            && matchesAny(block, TEXT_TARGET_SELECTORS)
            && isVisible(block)
            && !isCodeLike(block)
            && !isOutOfScope(block)
            && (block.textContent || '').trim()) {
            targets.push(block);
        }

        TEXT_TARGET_SELECTORS.forEach(selector => {
            try {
                block.querySelectorAll?.(selector).forEach(element => {
                    if (!(element instanceof HTMLElement)) return;
                    if (!isVisible(element)) return;
                    if (isCodeLike(element) || isOutOfScope(element)) return;
                    if (!(element.textContent || '').trim()) return;
                    targets.push(element);
                });
            } catch (_) {}
        });

        return uniqueElements(targets);
    }

    function setImportant(element, property, value) {
        element.style.setProperty(property, value, 'important');
    }

    function rememberOriginal(element) {
        if (originalStyles.has(element)) return;
        originalStyles.set(element, {
            fontFamily: element.style.getPropertyValue('font-family'),
            fontFamilyPriority: element.style.getPropertyPriority('font-family'),
            direction: element.style.getPropertyValue('direction'),
            directionPriority: element.style.getPropertyPriority('direction'),
            textAlign: element.style.getPropertyValue('text-align'),
            textAlignPriority: element.style.getPropertyPriority('text-align'),
            unicodeBidi: element.style.getPropertyValue('unicode-bidi'),
            unicodeBidiPriority: element.style.getPropertyPriority('unicode-bidi')
        });
    }

    function applyFont(element) {
        if (!(element instanceof HTMLElement)) return;

        rememberOriginal(element);
        element.setAttribute(MODIFIED_ATTR, 'true');
        element.classList.add(MODIFIED_CLASS);
        setImportant(element, 'font-family', '"Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif');
        modifiedElements.add(element);
    }

    function applyRtl(element) {
        if (!(element instanceof HTMLElement)) return;

        rememberOriginal(element);
        element.setAttribute(RTL_ATTR, 'true');
        element.classList.add(RTL_CLASS);
        setImportant(element, 'direction', 'rtl');
        setImportant(element, 'text-align', 'right');
        setImportant(element, 'unicode-bidi', 'isolate');
        modifiedElements.add(element);
    }

    function restoreElement(element) {
        if (element.getAttribute?.(MODIFIED_ATTR) !== 'true'
            && element.getAttribute?.(RTL_ATTR) !== 'true') return;

        const original = originalStyles.get(element) || {};
        if (original.fontFamily) element.style.setProperty('font-family', original.fontFamily, original.fontFamilyPriority || '');
        else element.style.removeProperty('font-family');
        if (original.direction) element.style.setProperty('direction', original.direction, original.directionPriority || '');
        else element.style.removeProperty('direction');
        if (original.textAlign) element.style.setProperty('text-align', original.textAlign, original.textAlignPriority || '');
        else element.style.removeProperty('text-align');
        if (original.unicodeBidi) element.style.setProperty('unicode-bidi', original.unicodeBidi, original.unicodeBidiPriority || '');
        else element.style.removeProperty('unicode-bidi');

        element.removeAttribute(MODIFIED_ATTR);
        element.classList.remove(MODIFIED_CLASS);
        element.removeAttribute(RTL_ATTR);
        element.classList.remove(RTL_CLASS);
        originalStyles.delete(element);
        modifiedElements.delete(element);
    }

    function processGmailBlock(block, engine) {
        if (!isGmailTextBlock(block)) return true;

        const text = engine.collectDirectionText(block).trim();
        if (!PERSIAN_TEXT_REGEX.test(text)) {
            restoreElement(block);
            getTextTargets(block).forEach(restoreElement);
            return true;
        }

        applyFont(block);
        getTextTargets(block).forEach(target => {
            applyFont(target);
            if (matchesAny(target, RTL_TARGET_SELECTORS)
                && PERSIAN_TEXT_REGEX.test(engine.collectDirectionText(target).trim())) {
                applyRtl(target);
            }
        });
        if (matchesAny(block, RTL_TARGET_SELECTORS)) applyRtl(block);
        return true;
    }

    function cleanUpStyles() {
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
        document.querySelectorAll(`[${RTL_ATTR}="true"]`).forEach(restoreElement);
    }

    const recipe = {
        version: 1,
        storageKey: 'gmailEnabled',
        hosts: ['mail.google.com'],
        messageSelectors: TEXT_BLOCK_SELECTORS,
        excludeSelectors: [...CODE_GUARD_SELECTORS, ...OUT_OF_SCOPE_SELECTORS],
        textSelectors: [],
        rtlRegex: PERSIAN_TEXT_REGEX,
        isMessageElement: isGmailTextBlock,
        isCodeLike: element => isCodeLike(element) || isOutOfScope(element),
        applyToMessage: processGmailBlock,
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

            .${MODIFIED_CLASS},
            .${MODIFIED_CLASS} .bog,
            .${MODIFIED_CLASS} .y2,
            .${MODIFIED_CLASS} .bqe,
            .${MODIFIED_CLASS} .a3s,
            .${MODIFIED_CLASS} .Am.Al.editable,
            .${MODIFIED_CLASS}[contenteditable="true"] {
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            .${RTL_CLASS} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__GMAIL_RTL_TEST__ === 'function') {
        window.__GMAIL_RTL_TEST__({
            recipe,
            isSupportedHost,
            isGmailTextBlock,
            getTextTargets,
            textBlockSelectors: TEXT_BLOCK_SELECTORS,
            rtlTargetSelectors: RTL_TARGET_SELECTORS,
            outOfScopeSelectors: OUT_OF_SCOPE_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
