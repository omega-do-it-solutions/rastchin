// src/platforms/notion-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-notion-font';
    const MODIFIED_CLASS = 'rastchin-notion-font';
    const PERSIAN_TEXT_REGEX = /\p{Script=Arabic}/u;

    const NOTION_HOST_SUFFIXES = ['.notion.site'];

    const TEXT_BLOCK_SELECTORS = [
        '.notion-text-block',
        '.notion-header-block',
        '.notion-sub_header-block',
        '.notion-sub_sub_header-block',
        '.notion-bulleted_list-block',
        '.notion-numbered_list-block',
        '.notion-to_do-block',
        '.notion-toggle-block',
        '.notion-quote-block',
        '.notion-callout-block',
        '[data-block-id][class*="notion-text"]',
        '[data-block-id][class*="notion-header"]',
        '[data-block-id][class*="notion-bulleted_list"]',
        '[data-block-id][class*="notion-numbered_list"]',
        '[data-block-id][class*="notion-to_do"]',
        '[data-block-id][class*="notion-toggle"]',
        '[data-block-id][class*="notion-quote"]',
        '[data-block-id][class*="notion-callout"]',
        '[data-block-id]',
        '.notion-selectable',
        '[data-testid="property-value"]',
        '[data-content-editable-leaf="true"]',
        '[contenteditable="true"][spellcheck]'
    ];

    const TEXT_TARGET_SELECTORS = [
        '[data-testid="property-value"]',
        '[data-content-editable-leaf="true"]',
        '[contenteditable="true"][spellcheck]',
        '.notranslate',
        'p',
        'span',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3'
    ];

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '.notion-code-block',
        '[class*="code"]',
        '[class*="Code"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.cm-editor',
        '.monaco-editor',
        '[role="code"]'
    ];

    const OUT_OF_SCOPE_SELECTORS = [
        '.notion-page-controls',
        '.notion-collection_view-block',
        '.notion-collection-item',
        '.notion-table-block',
        '.notion-table-view',
        '.notion-board-view',
        '.notion-calendar-view',
        '.notion-gallery-view',
        '.notion-list-view',
        '.notion-timeline-view',
        '.notion-database-block',
        '.notion-table_of_contents-block',
        '[data-testid*="database"]',
        '[placeholder="Untitled"]',
        '[aria-label="Untitled"]'
    ];

    // Database layout containers remain out of scope. Only their actual rich-
    // text leaves may receive the Persian font; this preserves column sizing,
    // row controls, selection handles and Notion's own grid direction.
    const DATABASE_SCOPE_SELECTORS = [
        '.notion-collection_view-block',
        '.notion-collection-item',
        '.notion-table-block',
        '.notion-table-view',
        '.notion-board-view',
        '.notion-calendar-view',
        '.notion-gallery-view',
        '.notion-list-view',
        '.notion-timeline-view',
        '.notion-database-block',
        '[data-testid*="database"]'
    ];
    const DATABASE_TEXT_SELECTORS = [
        '[data-testid="property-value"]',
        '[data-content-editable-leaf="true"]',
        '.notranslate'
    ];
    const DIRECTION_TARGET_SELECTORS = [
        '[data-testid="property-value"]',
        '[data-content-editable-leaf="true"]',
        '[contenteditable="true"][spellcheck]',
        '.notranslate',
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3'
    ];

    const modifiedElements = new Set();
    const originalStyles = new WeakMap();

    function isSupportedHost(hostname) {
        return hostname === 'notion.so'
            || hostname === 'www.notion.so'
            || hostname === 'app.notion.so'
            || hostname === 'app.notion.com'
            || NOTION_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
    }

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
        return element instanceof HTMLElement && !!element.closest(selectorList(CODE_GUARD_SELECTORS));
    }

    function closestDatabaseTextTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        const target = matchesAny(element, DATABASE_TEXT_SELECTORS)
            ? element
            : element.closest(selectorList(DATABASE_TEXT_SELECTORS));
        if (!(target instanceof HTMLElement)) return null;
        if (!target.closest(selectorList(DATABASE_SCOPE_SELECTORS))) return null;
        return target;
    }

    function isDatabaseTextTarget(element) {
        const target = closestDatabaseTextTarget(element);
        return target === element && (target.textContent || '').trim().length > 0;
    }

    function isWithinDatabaseTextTarget(element) {
        const target = closestDatabaseTextTarget(element);
        return !!target && (target.textContent || '').trim().length > 0;
    }

    function isDirectionTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!matchesAny(element, DIRECTION_TARGET_SELECTORS)) return false;
        if (!isVisible(element) || isCodeLike(element) || isOutOfScope(element)) return false;
        const display = window.getComputedStyle(element).display || '';
        if (display === 'inline' || display === 'inline-block' || display === 'contents') return false;
        if (display.includes('flex') || display.includes('grid') || display.startsWith('table')) return false;
        return (element.textContent || '').trim().length > 0;
    }

    function isOutOfScope(element) {
        if (!(element instanceof HTMLElement)) return false;
        // Rich-text descendants must remain readable to collectDirectionText;
        // only the owning property-value itself is styled later.
        if (isWithinDatabaseTextTarget(element)) return false;
        return !!element.closest(selectorList(OUT_OF_SCOPE_SELECTORS));
    }

    function isNotionTextBlock(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isSupportedHost(window.location.hostname)) return false;
        if (!matchesAny(element, TEXT_BLOCK_SELECTORS)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        if (!matchesAny(element, TEXT_TARGET_SELECTORS) && !element.querySelector?.(selectorList(TEXT_TARGET_SELECTORS))) return false;
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
            fontFamilyPriority: element.style.getPropertyPriority('font-family')
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

    function restoreElement(element) {
        if (element.getAttribute?.(MODIFIED_ATTR) !== 'true') return;

        const original = originalStyles.get(element) || {};
        if (original.fontFamily) element.style.setProperty('font-family', original.fontFamily, original.fontFamilyPriority || '');
        else element.style.removeProperty('font-family');

        element.removeAttribute(MODIFIED_ATTR);
        element.classList.remove(MODIFIED_CLASS);
        originalStyles.delete(element);
        modifiedElements.delete(element);
    }

    function processNotionBlock(block, engine) {
        if (!isNotionTextBlock(block)) return true;

        const text = engine.collectDirectionText(block).trim();
        if (!PERSIAN_TEXT_REGEX.test(text)) {
            restoreElement(block);
            engine.restoreElement?.(block);
            getTextTargets(block).forEach(target => {
                restoreElement(target);
                engine.restoreElement?.(target);
            });
            return true;
        }

        applyFont(block);
        const targets = isDatabaseTextTarget(block) ? [block] : getTextTargets(block);
        if (targets.length) {
            targets.forEach(target => {
                applyFont(target);
                if (isDirectionTarget(target)) engine.applyRTL(target);
            });
        }
        return true;
    }

    function cleanUpStyles() {
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
    }

    const recipe = {
        version: 1,
        storageKey: 'notionEnabled',
        hosts: ['notion.so', 'www.notion.so', 'app.notion.so', 'app.notion.com'],
        hostSuffixes: NOTION_HOST_SUFFIXES,
        messageSelectors: TEXT_BLOCK_SELECTORS,
        // Database selectors are enforced by isCodeLike/isOutOfScope instead of
        // the engine's static closest() guard so safe text leaves can pass.
        excludeSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: PERSIAN_TEXT_REGEX,
        isMessageElement: isNotionTextBlock,
        isCodeLike: element => isCodeLike(element) || isOutOfScope(element),
        applyToMessage: processNotionBlock,
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
            .${MODIFIED_CLASS} [data-content-editable-leaf="true"],
            .${MODIFIED_CLASS} .notranslate {
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__NOTION_RTL_TEST__ === 'function') {
        window.__NOTION_RTL_TEST__({
            recipe,
            isSupportedHost,
            isNotionTextBlock,
            isDatabaseTextTarget,
            isWithinDatabaseTextTarget,
            isDirectionTarget,
            isOutOfScope,
            getTextTargets,
            textBlockSelectors: TEXT_BLOCK_SELECTORS,
            outOfScopeSelectors: OUT_OF_SCOPE_SELECTORS,
            databaseScopeSelectors: DATABASE_SCOPE_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
