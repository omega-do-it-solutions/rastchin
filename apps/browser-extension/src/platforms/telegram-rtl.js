// src/platforms/telegram-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-telegram-rtl';
    const MODIFIED_CLASS = 'rastchin-telegram-rtl';
    const PERSIAN_TEXT_REGEX = /\p{Script=Arabic}/u;

    const MESSAGE_CONTAINER_SELECTORS = [
        '.Message',
        '.message',
        '.bubble',
        '[data-message-id]',
        '[id^="message-"]'
    ];

    const MESSAGE_TEXT_SELECTORS = [
        // A/Z (web.telegram.org/a, /z) — React rewrite. Text lives in .text-content.
        '.Message .text-content',
        '.message .text-content',
        '.Message .message-text',
        '.message .message-text',
        '[data-message-id] .text-content',
        '[data-message-id] .message-text',
        '[id^="message-"] .text-content',
        '[id^="message-"] .message-text',
        // K (web.telegram.org/k) — tweb. The bubble's .message element holds the
        // text directly (a .time child carries the timestamp); there is no
        // .text-content wrapper, so target the .message leaf inside .bubble.
        '.bubble .message',
        '.bubble-content .message'
    ];

    const EDITABLE_TEXT_SELECTORS = [
        '#editable-message-text',
        '.input-message-input',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][aria-label*="Message"]',
        '[contenteditable="true"][aria-label*="Search"]',
        'input[placeholder*="Search"]',
        'input[aria-label*="Search"]',
        'input[type="search"]'
    ];

    const LIST_TEXT_SELECTORS = [
        // A/Z (React): chat rows are .Chat (a .ListItem); name is .title/.fullName,
        // preview is .subtitle/.last-message.
        '.chatlist .title',
        '.chatlist .subtitle',
        '.chat-list .title',
        '.chat-list .subtitle',
        '.ChatList .title',
        '.ChatList .subtitle',
        '.Chat .title',
        '.Chat .fullName',
        '.Chat .subtitle',
        '.Chat .last-message',
        '[data-peer-id] .title',
        '[data-peer-id] .subtitle',
        '.ListItem.chat-item .title',
        '.ListItem.chat-item .subtitle',
        // K (tweb): chat rows are .chatlist-chat; name is .peer-title/.dialog-title,
        // preview is .dialog-subtitle. Scope to the chat list to avoid the
        // .peer-title that also renders in the chat header bar.
        '.chatlist .peer-title',
        '.chatlist .dialog-title',
        '.chatlist .dialog-subtitle'
    ];

    const TEXT_TARGET_SELECTORS = [
        ...MESSAGE_TEXT_SELECTORS,
        ...EDITABLE_TEXT_SELECTORS,
        ...LIST_TEXT_SELECTORS
    ];

    // Scoped CSS selectors for the marked message-text leaf only (NOT chat-list
    // rows, NOT the .time/views chrome). These are the MESSAGE_TEXT_SELECTORS
    // qualified with the RTL marker class so font-size/spacing tweaks land on the
    // message body alone. Chat-list titles/subtitles carry the same class but do
    // not match these selectors, so they stay at their native size.
    const MESSAGE_TEXT_SCOPE_SELECTORS = MESSAGE_TEXT_SELECTORS.map(selector => {
        // Qualify the leaf (last compound) with the marker class, e.g.
        // `.bubble .message` -> `.bubble .message.rastchin-telegram-rtl`.
        const lastSpace = selector.lastIndexOf(' ');
        const leaf = lastSpace === -1 ? selector : selector.slice(lastSpace + 1);
        const prefix = lastSpace === -1 ? '' : selector.slice(0, lastSpace + 1);
        return `${prefix}${leaf}.${MODIFIED_CLASS}`;
    });

    const TEXT_BLOCK_SELECTORS = [
        ...MESSAGE_CONTAINER_SELECTORS,
        ...TEXT_TARGET_SELECTORS
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

    const HARD_CHROME_SELECTORS = [
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[data-icon]',
        'svg',
        'canvas',
        'img',
        'video',
        '[aria-hidden="true"]'
    ];

    const INTERACTIVE_CHROME_SELECTORS = [
        'button',
        '[role="button"]',
        'select',
        '[contenteditable="false"]'
    ];

    const modifiedElements = new Set();
    const originalStyles = new WeakMap();
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
        return hostname === 'web.telegram.org';
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

    function isEditableTextTarget(element) {
        return element instanceof HTMLElement && matchesAny(element, EDITABLE_TEXT_SELECTORS);
    }

    function isListTextTarget(element) {
        return element instanceof HTMLElement && matchesAny(element, LIST_TEXT_SELECTORS);
    }

    function isOutOfScope(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (isEditableTextTarget(element)) return false;
        if (element.closest(selectorList(HARD_CHROME_SELECTORS))) return true;
        if (element.closest(selectorList(INTERACTIVE_CHROME_SELECTORS)) && !isListTextTarget(element)) return true;
        return false;
    }

    function textOf(element, engine) {
        if (!element) return '';
        if ('value' in element && typeof element.value === 'string') return element.value;
        return engine?.collectDirectionText?.(element) || element.innerText || element.textContent || '';
    }

    function isLayoutContainer(element) {
        if (!(element instanceof HTMLElement) || isEditableTextTarget(element)) return false;
        const style = window.getComputedStyle(element);
        const display = style.display || '';
        if (display.includes('grid') || display === 'table' || display === 'inline-grid') return true;
        if (display.includes('flex')) {
            const flexDirection = style.flexDirection || 'row';
            return flexDirection.startsWith('row');
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

    function isTelegramTextBlock(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isSupportedHost(window.location.hostname)) return false;
        if (!matchesAny(element, TEXT_BLOCK_SELECTORS)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        return textOf(element).trim().length > 0;
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
                if (isLayoutContainer(element)) return;
                if (!textOf(element).trim()) return;
                targets.push(element);
            });
        } catch (_) {}

        return uniqueElements(targets);
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

    function setImportant(element, property, value) {
        element.style.setProperty(property, value, 'important');
    }

    function applyRTL(element) {
        if (element.getAttribute?.(MODIFIED_ATTR) === 'true') return;
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

    function textNeedsRTL(element, engine) {
        const text = textOf(element, engine).trim();
        return PERSIAN_TEXT_REGEX.test(text) && engine.needsRTL(text);
    }

    function processTextTarget(element, engine) {
        if (textNeedsRTL(element, engine)) {
            applyRTL(element);
        } else {
            restoreElement(element);
        }
    }

    function restoreStaleModifiedTargets(root, engine) {
        if (!(root instanceof HTMLElement)) return;
        Array.from(modifiedElements).forEach(element => {
            if (!(element instanceof HTMLElement)) return;
            if (element.isConnected === false) {
                modifiedElements.delete(element);
                originalStyles.delete(element);
                return;
            }
            if (element !== root && typeof root.contains === 'function' && !root.contains(element)) return;
            if (!textNeedsRTL(element, engine)) restoreElement(element);
        });
    }

    function processTelegramBlock(block, engine) {
        if (!isTelegramTextBlock(block)) {
            restoreStaleModifiedTargets(block, engine);
            return true;
        }

        const targets = getTextTargets(block);
        if (!targets.length) {
            restoreStaleModifiedTargets(block, engine);
            return true;
        }

        targets.forEach(target => processTextTarget(target, engine));
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

    function cleanUpStyles() {
        detachInputListener();
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
    }

    const recipe = {
        version: 1,
        storageKey: 'telegramEnabled',
        hosts: ['web.telegram.org'],
        inlineIsolate: false,
        messageSelectors: TEXT_BLOCK_SELECTORS,
        excludeSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: PERSIAN_TEXT_REGEX,
        rtlClass: MODIFIED_CLASS,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement: isTelegramTextBlock,
        isCodeLike: element => isCodeLike(element) || isOutOfScope(element),
        applyToMessage: processTelegramBlock,
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

            ${selectorList(CODE_GUARD_SELECTORS)} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate;
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

            /* Message body only: nudge the RTL text one visual step smaller than
               native Telegram, and reserve a little trailing space so the bottom
               metadata row (time / views / reactions) does not sit on top of the
               text. Scoped to the message-text leaf so chat-list rows, the .time
               node, buttons, icons and chrome keep their native size/layout. */
            ${selectorList(MESSAGE_TEXT_SCOPE_SELECTORS)} {
                font-size: 0.94em !important;
                padding-bottom: 0.45em;
                padding-inline-end: 0.35em;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__TELEGRAM_RTL_TEST__ === 'function') {
        window.__TELEGRAM_RTL_TEST__({
            recipe,
            isSupportedHost,
            isTelegramTextBlock,
            getTextTargets,
            textBlockSelectors: TEXT_BLOCK_SELECTORS,
            textTargetSelectors: TEXT_TARGET_SELECTORS,
            messageTextSelectors: MESSAGE_TEXT_SELECTORS,
            messageTextScopeSelectors: MESSAGE_TEXT_SCOPE_SELECTORS,
            editableTextSelectors: EDITABLE_TEXT_SELECTORS,
            listTextSelectors: LIST_TEXT_SELECTORS,
            outOfScopeSelectors: [...HARD_CHROME_SELECTORS, ...INTERACTIVE_CHROME_SELECTORS]
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
