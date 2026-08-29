(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-vs-marketplace-rtl';
    const MODIFIED_CLASS = 'rastchin-vs-marketplace-rtl';

    const CONTENT_ROOT_SELECTORS = [
        '#overviewTab .details-tab.itemdetails .markdown',
        '.item-details-control-root .itemDetails .markdown',
        '#version-history-tab-content .markdown',
        '.item-details-control-root .ux-item-shortdesc'
    ];

    const TEXT_TARGET_SELECTORS = [
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'td',
        'th',
        'dt',
        'dd',
        'summary',
        'figcaption'
    ];

    const BLOCK_CHILD_SELECTOR = [
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'table',
        'pre',
        'div'
    ].join(', ');

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        'kbd',
        'samp',
        '.highlight',
        '[class*="language-"]',
        '.hljs',
        '.vscode-command-input'
    ];

    const INTERACTIVE_GUARD_SELECTOR = [
        'button',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="toolbar"]',
        '.tab'
    ].join(', ');

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

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.isConnected) return false;
        if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden';
    }

    function isCodeLike(element) {
        return element instanceof HTMLElement && Boolean(element.closest?.(selectorList(CODE_GUARD_SELECTORS)));
    }

    function isInteractiveChrome(element) {
        return element instanceof HTMLElement && Boolean(element.closest?.(INTERACTIVE_GUARD_SELECTOR));
    }

    function isContentRoot(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!matchesAny(element, CONTENT_ROOT_SELECTORS)) return false;
        if (!isVisible(element) || isCodeLike(element)) return false;
        return Boolean((element.textContent || '').trim());
    }

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(Boolean)));
    }

    function hasBlockChild(element) {
        return Array.from(element.children || []).some(child => (
            child.matches?.(BLOCK_CHILD_SELECTOR) && (child.textContent || '').trim().length > 0
        ));
    }

    function isTextTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isVisible(element) || isCodeLike(element) || isInteractiveChrome(element)) return false;
        if (!(element.textContent || '').trim()) return false;
        if (['LI', 'TD', 'TH'].includes(element.tagName)) return true;
        return !hasBlockChild(element);
    }

    function getTextTargets(root) {
        const targets = [];
        if (matchesAny(root, TEXT_TARGET_SELECTORS) && isTextTarget(root)) targets.push(root);

        TEXT_TARGET_SELECTORS.forEach(selector => {
            try {
                root.querySelectorAll?.(selector).forEach(element => {
                    if (isTextTarget(element)) targets.push(element);
                });
            } catch (_) {}
        });

        // The Marketplace short description is a direct-text <div>, while the
        // Overview/Version History roots contain normal Markdown block elements.
        if (!targets.length && isTextTarget(root)) targets.push(root);
        return uniqueElements(targets);
    }

    function setImportant(element, property, value) {
        element.style.setProperty(property, value, 'important');
    }

    function rememberOriginal(element) {
        if (originalStyles.has(element)) return;
        originalStyles.set(element, {
            dir: element.getAttribute('dir'),
            direction: element.style.getPropertyValue('direction'),
            directionPriority: element.style.getPropertyPriority('direction'),
            textAlign: element.style.getPropertyValue('text-align'),
            textAlignPriority: element.style.getPropertyPriority('text-align'),
            unicodeBidi: element.style.getPropertyValue('unicode-bidi'),
            unicodeBidiPriority: element.style.getPropertyPriority('unicode-bidi'),
            fontFamily: element.style.getPropertyValue('font-family'),
            fontFamilyPriority: element.style.getPropertyPriority('font-family')
        });
    }

    function applyRTL(element) {
        if (!(element instanceof HTMLElement)) return;
        rememberOriginal(element);
        element.setAttribute('dir', 'rtl');
        element.setAttribute(MODIFIED_ATTR, 'true');
        element.classList.add(MODIFIED_CLASS);
        setImportant(element, 'direction', 'rtl');
        setImportant(element, 'text-align', 'right');
        setImportant(element, 'unicode-bidi', 'plaintext');
        setImportant(element, 'font-family', '"Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif');
        modifiedElements.add(element);
    }

    function restoreElement(element) {
        if (element.getAttribute?.(MODIFIED_ATTR) !== 'true') return;
        const original = originalStyles.get(element) || {};

        if (original.dir == null) element.removeAttribute('dir');
        else element.setAttribute('dir', original.dir);

        [
            ['direction', original.direction, original.directionPriority],
            ['text-align', original.textAlign, original.textAlignPriority],
            ['unicode-bidi', original.unicodeBidi, original.unicodeBidiPriority],
            ['font-family', original.fontFamily, original.fontFamilyPriority]
        ].forEach(([property, value, priority]) => {
            if (value) element.style.setProperty(property, value, priority || '');
            else element.style.removeProperty(property);
        });

        element.removeAttribute(MODIFIED_ATTR);
        element.classList.remove(MODIFIED_CLASS);
        originalStyles.delete(element);
        modifiedElements.delete(element);
    }

    function processTextTarget(element, engine) {
        const text = engine.collectDirectionText(element).trim();
        if (engine.needsRTL(text)) {
            applyRTL(element);
            engine.isolateInline?.(element);
        } else {
            engine.clearInline?.(element);
            restoreElement(element);
        }
    }

    function processContentRoot(root, engine) {
        if (!isContentRoot(root)) return true;
        getTextTargets(root).forEach(target => processTextTarget(target, engine));
        return true;
    }

    function cleanUpStyles() {
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
    }

    const recipe = {
        version: 1,
        storageKey: 'vsMarketplaceEnabled',
        inlineIsolate: true,
        hosts: ['marketplace.visualstudio.com'],
        messageSelectors: CONTENT_ROOT_SELECTORS,
        excludeSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: /\p{Script=Arabic}/u,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement: isContentRoot,
        isCodeLike,
        applyToMessage: processContentRoot,
        onDisable: cleanUpStyles,
        globalCss: codeGuard => `
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

            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
                font-family: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace !important;
            }

            .${MODIFIED_CLASS} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            .${MODIFIED_CLASS} a {
                unicode-bidi: isolate;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__VS_MARKETPLACE_RTL_TEST__ === 'function') {
        window.__VS_MARKETPLACE_RTL_TEST__({
            recipe,
            isContentRoot,
            isCodeLike,
            getTextTargets,
            contentRootSelectors: CONTENT_ROOT_SELECTORS,
            codeGuardSelectors: CODE_GUARD_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
