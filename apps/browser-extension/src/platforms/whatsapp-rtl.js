// src/platforms/whatsapp-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-whatsapp-rtl';
    const MODIFIED_CLASS = 'rastchin-whatsapp-rtl';
    const PERSIAN_TEXT_REGEX = /\p{Script=Arabic}/u;

    const MESSAGE_CONTAINER_SELECTORS = [
        '[data-testid="msg-container"]',
        '[data-pre-plain-text]',
        '.message-in',
        '.message-out'
    ];

    const MESSAGE_TEXT_SELECTORS = [
        '[data-pre-plain-text]',
        '.selectable-text.copyable-text',
        'span.selectable-text',
        '[data-testid="msg-text"]'
    ];

    const EDITABLE_TEXT_SELECTORS = [
        '[data-testid="conversation-compose-box-input"]',
        '[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-tab]',
        'input[aria-label*="Search"]',
        '[role="textbox"][aria-label*="Search"]',
        '[data-testid="chat-list-search"] [contenteditable="true"]'
    ];

    const LIST_TEXT_SELECTORS = [
        '[aria-label*="Chat list"] span[title]',
        '[role="listitem"] span[title]'
    ];

    const TEXT_TARGET_SELECTORS = [
        ...MESSAGE_TEXT_SELECTORS,
        ...EDITABLE_TEXT_SELECTORS,
        ...LIST_TEXT_SELECTORS
    ];

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
        return hostname === 'web.whatsapp.com';
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

    function isWhatsAppTextBlock(element) {
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

    function processWhatsAppBlock(block, engine) {
        if (!isWhatsAppTextBlock(block)) {
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
        storageKey: 'whatsappEnabled',
        hosts: ['web.whatsapp.com'],
        inlineIsolate: false,
        messageSelectors: TEXT_BLOCK_SELECTORS,
        excludeSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: PERSIAN_TEXT_REGEX,
        rtlClass: MODIFIED_CLASS,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement: isWhatsAppTextBlock,
        isCodeLike: element => isCodeLike(element) || isOutOfScope(element),
        applyToMessage: processWhatsAppBlock,
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

            /*
             * Timestamp/checkmark overlap guard.
             * WhatsApp renders the message time + read receipts as an
             * absolutely-positioned metadata row at the bottom inline-end of
             * each bubble, and its native LTR layout reserves trailing space
             * (bottom + inline-end) so message text never runs under it. Once
             * we flip the text leaf to RTL/right-align that native reserved
             * space lands on the wrong side, so the last Persian line collides
             * with the timestamp/checkmarks. We reserve the space back on the
             * marked text leaf ONLY inside real message bubbles
             * (.message-in / .message-out) and the copyable-text message
             * variant -- never the bare class -- so chat-list previews, the
             * composer and search are untouched. padding-bottom ~= one
             * metadata-row height; a small inline-end pad keeps the trailing
             * glyph clear of floated meta. This is class-keyed CSS, so it
             * self-removes on cleanup. Font size is intentionally left alone.
             */
            .message-in .${MODIFIED_CLASS},
            .message-out .${MODIFIED_CLASS},
            .copyable-text.${MODIFIED_CLASS} {
                padding-bottom: 1.1em;
                padding-inline-end: 0.35em;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__WHATSAPP_RTL_TEST__ === 'function') {
        window.__WHATSAPP_RTL_TEST__({
            recipe,
            isSupportedHost,
            isWhatsAppTextBlock,
            getTextTargets,
            textBlockSelectors: TEXT_BLOCK_SELECTORS,
            textTargetSelectors: TEXT_TARGET_SELECTORS,
            editableTextSelectors: EDITABLE_TEXT_SELECTORS,
            listTextSelectors: LIST_TEXT_SELECTORS,
            outOfScopeSelectors: [...HARD_CHROME_SELECTORS, ...INTERACTIVE_CHROME_SELECTORS]
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
