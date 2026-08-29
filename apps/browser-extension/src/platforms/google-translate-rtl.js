// src/platforms/google-translate-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-google-translate';
    const MODIFIED_CLASS = 'rastchin-google-translate-rtl';
    const PERSIAN_TEXT_REGEX = /\p{Script=Arabic}/u;

    const TEXT_BLOCK_SELECTORS = [
        'textarea[aria-label]',
        'textarea[placeholder]',
        'textarea.er8xn',
        '[contenteditable="true"][aria-label]',
        '[role="textbox"][contenteditable="true"]',
        '[role="textbox"][aria-label]',
        '[data-language-for-alternatives]',
        '[data-result-index]',
        '[lang="fa"]',
        '[lang="fa-IR"]',
        '[lang="prs"]',
        '[lang="ps"]',
        // Google Translate rotates these build-artifact selectors. Keep them as
        // opportunistic hooks; the stable textarea/role/lang/data selectors above
        // are the real contract.
        '.ryNqvb',
        '.Q4iAWc',
        '.J0lOec',
        '[jsname="W297wb"]',
        '[jsname="jqKxS"]',
        '[jsname="BJE2fc"]'
    ];

    const TEXT_TARGET_SELECTORS = [
        'textarea[aria-label]',
        'textarea[placeholder]',
        'textarea.er8xn',
        '[contenteditable="true"][aria-label]',
        '[role="textbox"][contenteditable="true"]',
        '[role="textbox"][aria-label]',
        '[data-language-for-alternatives]',
        '[data-result-index]',
        '[lang="fa"]',
        '[lang="fa-IR"]',
        '[lang="prs"]',
        '[lang="ps"]',
        // Opportunistic Google build-artifact hooks. Verify periodically.
        '.ryNqvb',
        '.Q4iAWc',
        '.J0lOec',
        '[jsname="W297wb"]',
        '[jsname="jqKxS"]',
        '[jsname="BJE2fc"]'
    ];

    const EDITABLE_TEXT_SELECTORS = [
        'textarea[aria-label]',
        'textarea[placeholder]',
        'textarea.er8xn',
        '[contenteditable="true"][aria-label]',
        '[role="textbox"][contenteditable="true"]',
        '[role="textbox"][aria-label]'
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
        'header',
        'nav',
        'footer',
        'button',
        'a[href]',
        'input',
        'select',
        '[role="button"]',
        '[role="tab"]',
        '[role="tablist"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="navigation"]',
        '[role="toolbar"]',
        '[aria-label="Main menu"]',
        '[aria-label="Google apps"]',
        '[aria-label*="Account"]',
        '[aria-label*="Settings"]',
        '[aria-label*="Swap languages"]',
        '[aria-label*="Clear source text"]',
        '[aria-label*="Listen"]',
        '[aria-label*="Copy translation"]',
        '[aria-label*="Share translation"]',
        '.gb_A',
        '.gb_B',
        '.gb_C',
        '.gb_D',
        '.gb_E',
        '.gb_F',
        '.gb_T',
        '.gb_U'
    ];

    const modifiedElements = new Set();
    const originalFontStyles = new WeakMap();
    const textDirectionState = new WeakMap();
    let inputListener = null;

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
        return hostname === 'translate.google.com';
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
        if (!(element instanceof HTMLElement)) return false;
        if (element.matches?.('textarea, [contenteditable="true"], [role="textbox"]')) return false;
        return !!element.closest(selectorList(OUT_OF_SCOPE_SELECTORS));
    }

    function textOf(element, engine) {
        if (!element) return '';
        if ('value' in element && typeof element.value === 'string') return element.value;
        return engine?.collectDirectionText?.(element) || element.innerText || element.textContent || '';
    }

    function textNeedsRTL(element, engine) {
        const text = textOf(element, engine).trim();
        const previous = textDirectionState.get(element);
        if (previous && previous.text === text) return previous.needsRTL;
        const needsRTL = PERSIAN_TEXT_REGEX.test(text) && engine.needsRTL(text);
        textDirectionState.set(element, { text, needsRTL });
        return needsRTL;
    }

    function isLayoutContainer(element) {
        if (!(element instanceof HTMLElement) || !element.isConnected) return false;
        if (element.matches?.('textarea, [contenteditable="true"], [role="textbox"]')) return false;
        const style = window.getComputedStyle(element);
        const display = style.display || '';
        if (display.includes('grid') || display === 'table' || display === 'inline-grid') return true;
        if (display.includes('flex')) {
            const direction = style.flexDirection || 'row';
            return direction.startsWith('row');
        }
        return false;
    }

    function isTextTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!matchesAny(element, TEXT_TARGET_SELECTORS)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        return true;
    }

    function isEditableTextTarget(element) {
        return element instanceof HTMLElement && matchesAny(element, EDITABLE_TEXT_SELECTORS);
    }

    function isGoogleTranslateTextBlock(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isSupportedHost(window.location.hostname)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        if (element.getAttribute?.(MODIFIED_ATTR) === 'true') return true;
        return matchesAny(element, TEXT_BLOCK_SELECTORS) && textOf(element).trim().length > 0;
    }

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(Boolean)));
    }

    function getTextTargets(block) {
        const targets = [];
        if (isTextTarget(block) && !isLayoutContainer(block) && textOf(block).trim()) {
            targets.push(block);
        }

        try {
            block.querySelectorAll?.(selectorList(TEXT_TARGET_SELECTORS)).forEach(element => {
                if (!(element instanceof HTMLElement)) return;
                if (!isTextTarget(element)) return;
                if (!textOf(element).trim()) return;
                targets.push(element);
            });
        } catch (_) {}

        return uniqueElements(targets);
    }

    function rememberFont(element) {
        if (originalFontStyles.has(element)) return;
        originalFontStyles.set(element, {
            fontFamily: element.style.getPropertyValue('font-family'),
            fontFamilyPriority: element.style.getPropertyPriority('font-family')
        });
    }

    function applyFont(element) {
        rememberFont(element);
        element.setAttribute(MODIFIED_ATTR, 'true');
        element.classList.add(MODIFIED_CLASS);
        const fontStack = '"Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
        if (element.style.getPropertyValue('font-family') !== fontStack ||
            element.style.getPropertyPriority('font-family') !== 'important') {
            element.style.setProperty('font-family', fontStack, 'important');
        }
        modifiedElements.add(element);
    }

    function restoreFont(element) {
        if (element.getAttribute?.(MODIFIED_ATTR) !== 'true') return;
        const original = originalFontStyles.get(element) || {};
        if (original.fontFamily) element.style.setProperty('font-family', original.fontFamily, original.fontFamilyPriority || '');
        else element.style.removeProperty('font-family');
        element.removeAttribute(MODIFIED_ATTR);
        element.classList.remove(MODIFIED_CLASS);
        originalFontStyles.delete(element);
        modifiedElements.delete(element);
    }

    function restoreTextElement(element, engine) {
        restoreFont(element);
        engine?.restoreElement?.(element);
    }

    function applyTranslateRTL(element, engine) {
        if (element.getAttribute?.(MODIFIED_ATTR) === 'true') return;
        engine.applyRTL(element);
        applyFont(element);
    }

    function restoreStaleModifiedTargets(root, engine) {
        if (!(root instanceof HTMLElement)) return;
        Array.from(modifiedElements).forEach(element => {
            if (!(element instanceof HTMLElement)) return;
            if (element.isConnected === false) {
                modifiedElements.delete(element);
                textDirectionState.delete(element);
                return;
            }
            if (element !== root && !root.contains?.(element)) return;
            if (!textNeedsRTL(element, engine)) restoreTextElement(element, engine);
        });
    }

    function processGoogleTranslateBlock(block, engine) {
        if (!isGoogleTranslateTextBlock(block)) {
            restoreStaleModifiedTargets(block, engine);
            return true;
        }

        const targets = getTextTargets(block);
        if (!targets.length) {
            if (textNeedsRTL(block, engine) && !isLayoutContainer(block)) {
                applyTranslateRTL(block, engine);
            } else {
                restoreStaleModifiedTargets(block, engine);
                restoreTextElement(block, engine);
            }
            return true;
        }

        targets.forEach(target => {
            if (textNeedsRTL(target, engine)) {
                applyTranslateRTL(target, engine);
            } else {
                restoreTextElement(target, engine);
            }
        });

        if (block !== targets[0] && modifiedElements.has(block) && !targets.includes(block)) {
            restoreTextElement(block, engine);
        }

        return true;
    }

    function getInputScanTarget(target) {
        if (!(target instanceof HTMLElement)) return null;
        if (!isSupportedHost(window.location.hostname)) return null;
        const scanTarget = isEditableTextTarget(target)
            ? target
            : target.closest?.(selectorList(EDITABLE_TEXT_SELECTORS));
        if (!(scanTarget instanceof HTMLElement)) return null;
        if (!isVisible(scanTarget)) return null;
        if (isCodeLike(scanTarget) || isOutOfScope(scanTarget)) return null;
        return scanTarget;
    }

    function attachInputListener(engine) {
        if (inputListener || !document.addEventListener) return;
        inputListener = event => {
            const target = getInputScanTarget(event?.target);
            if (!target) return;
            engine.scheduleScan(target);
        };
        document.addEventListener('input', inputListener, true);
    }

    function detachInputListener() {
        if (!inputListener || !document.removeEventListener) return;
        document.removeEventListener('input', inputListener, true);
        inputListener = null;
    }

    function cleanUpStyles(engine) {
        detachInputListener();
        Array.from(modifiedElements).forEach(element => restoreTextElement(element, engine));
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(element => restoreTextElement(element, engine));
    }

    const recipe = {
        version: 1,
        storageKey: 'googleTranslateEnabled',
        hosts: ['translate.google.com'],
        inlineIsolate: false,
        observeCharacterData: false,
        messageSelectors: TEXT_BLOCK_SELECTORS,
        excludeSelectors: [...CODE_GUARD_SELECTORS, ...OUT_OF_SCOPE_SELECTORS],
        textSelectors: [],
        rtlRegex: PERSIAN_TEXT_REGEX,
        rtlClass: MODIFIED_CLASS,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement: isGoogleTranslateTextBlock,
        isCodeLike: element => isCodeLike(element) || isOutOfScope(element),
        applyToMessage: processGoogleTranslateBlock,
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
        `
    };

    if (typeof window !== 'undefined' && typeof window.__GOOGLE_TRANSLATE_RTL_TEST__ === 'function') {
        window.__GOOGLE_TRANSLATE_RTL_TEST__({
            recipe,
            isSupportedHost,
            isGoogleTranslateTextBlock,
            getTextTargets,
            textBlockSelectors: TEXT_BLOCK_SELECTORS,
            textTargetSelectors: TEXT_TARGET_SELECTORS,
            outOfScopeSelectors: OUT_OF_SCOPE_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
