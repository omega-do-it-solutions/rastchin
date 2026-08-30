// src/platforms/google-workspace-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-google-workspace';
    const MODIFIED_CLASS = 'rastchin-google-workspace-rtl';
    const PERSIAN_TEXT_REGEX = /\p{Script=Arabic}/u;

    const TEXT_BLOCK_SELECTORS = [
        '.docos-layout-anchored .docos-anchoreddocoview',
        '.docos-anchoreddocoview',
        '.docos-anchoreddocoview-content',
        '.docos-streamdocoview',
        '.docos-docoview',
        '.docos-docoview-rootreply',
        '.docos-docoview-replycontainer',
        '.docos-comment-body',
        '.docos-comment-text',
        '.docos-comment-text-body',
        '.docos-replyview-body',
        '.docos-replyview-comment',
        '.docos-replyview-comment-text',
        '.docos-replyview-static',
        '.docos-anchoredreplyview-body',
        '.docos-anchoredreplyview-comment',
        '.docos-input',
        '.docos-input-contenteditable[contenteditable="true"]',
        'textarea.docos-input-textarea',
        '.docos-input-textarea',
        '.docos-input [role="textbox"]',
        '.docos-input-textarea [contenteditable="true"]',
        '[class*="docos"] [role="textbox"][contenteditable="true"]',
        '[class*="docos"] [role="textbox"]',
        '[class*="docos"] textarea',
        '[class*="docos"] input[type="text"]',
        '[class*="docos"] [contenteditable="true"]',
        '[class*="comment"] [role="textbox"][contenteditable="true"]',
        '[class*="comment"] [role="textbox"]',
        '[class*="comment"] textarea',
        '[class*="comment"] input[type="text"]',
        '[class*="comment"] [contenteditable="true"]',
        '[aria-label*="Comment" i][role="textbox"]',
        '[aria-label*="Comment" i]',
        '[aria-label*="Add comment" i]',
        '[aria-label*="Comment" i][contenteditable="true"]',
        '[aria-label*="نظر"][role="textbox"]',
        '[aria-label*="نظر"]',
        '[aria-label*="نظر"][contenteditable="true"]',
        '[aria-label*="کامنت"][role="textbox"]',
        '[aria-label*="کامنت"]',
        '[aria-label*="کامنت"][contenteditable="true"]',
        '[role="dialog"] [role="textbox"][contenteditable="true"]',
        '[role="dialog"] [role="textbox"]',
        '[role="dialog"] [contenteditable="true"]',
        '[role="dialog"] textarea',
        '[role="dialog"] input[type="text"]',
        '[role="dialog"] textarea[aria-label*="Comment" i]'
    ];

    const COMMENT_CONTEXT_SELECTORS = [
        '.docos-layout-anchored',
        '.docos-anchoreddocoview',
        '.docos-streamdocoview',
        '.docos-docoview',
        '.docos-input',
        '[class*="docos"]',
        '[class*="comment"]',
        '[class*="Comment"]',
        '[aria-label*="Comment" i]',
        '[aria-label*="Comments" i]',
        '[aria-label*="Add comment" i]',
        '[aria-label*="Reply" i]',
        '[aria-label*="Discussion" i]',
        '[aria-label*="نظر"]',
        '[aria-label*="کامنت"]',
        '[role="dialog"]'
    ];

    const GENERIC_COMMENT_TEXT_SELECTORS = [
        'p',
        'span',
        'div',
        '[role="textbox"]',
        '[contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
        'textarea',
        'input[type="text"]'
    ];

    const TEXT_TARGET_SELECTORS = [
        ...TEXT_BLOCK_SELECTORS,
        ...GENERIC_COMMENT_TEXT_SELECTORS,
        '.docos-comment-body p',
        '.docos-comment-body span',
        '.docos-comment-text p',
        '.docos-comment-text span',
        '.docos-replyview-body p',
        '.docos-replyview-body span',
        '.docos-replyview-comment p',
        '.docos-replyview-comment span',
        '.docos-replyview-static p',
        '.docos-replyview-static span',
        '[class*="docos"] p',
        '[class*="docos"] span',
        '[class*="comment"] p',
        '[class*="comment"] span'
    ];

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        'kbd',
        'samp',
        '[class*="code"]',
        '[class*="Code"]',
        '[style*="monospace"]',
        '[role="code"]'
    ];

    const OUT_OF_SCOPE_SELECTORS = [
        'header',
        'nav',
        '[role="navigation"]',
        '[role="banner"]',
        '[role="toolbar"]',
        '[role="menubar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[aria-label="Google apps"]',
        '[aria-label*="Account"]',
        'button',
        '[role="button"]',
        '.docos-input-buttons',
        '.docos-input-buttons-post',
        '.docos-replyview-author',
        '.docos-replyview-username',
        '.docos-replyview-date',
        '[class*="kix-"]',
        '.kix-appview-editor',
        '.kix-page',
        '.docs-texteventtarget-iframe',
        '.docs-titlebar',
        '.docs-menubar',
        '#docs-toolbar',
        '.docs-toolbar',
        '.docs-toolbar-wrapper',
        '.waffle',
        '.grid-container',
        '#waffle-grid-container',
        '.cell-input',
        '.waffle-menubar',
        '.waffle-toolbar'
    ];

    const INPUT_SCAN_SELECTORS = [
        '.docos-input-contenteditable[contenteditable="true"]',
        'textarea.docos-input-textarea',
        '.docos-input [role="textbox"]',
        '[class*="docos"] [role="textbox"]',
        '[class*="docos"] textarea',
        '[class*="docos"] input[type="text"]',
        '[class*="comment"] [role="textbox"]',
        '[class*="comment"] textarea',
        '[class*="comment"] input[type="text"]',
        '[role="dialog"] [role="textbox"]',
        '[role="dialog"] [contenteditable="plaintext-only"]',
        '[role="dialog"] [contenteditable="true"]',
        '[role="dialog"] textarea',
        '[role="dialog"] input[type="text"]',
        '[role="textbox"]',
        '[contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
        'textarea',
        'input[type="text"]',
        '[aria-label*="Comment" i]',
        '[aria-label*="نظر"]',
        '[aria-label*="کامنت"]'
    ];

    const modifiedElements = new Set();
    let inputListener = null;
    let focusListener = null;

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

    function hostnameFromUrl(url) {
        const match = String(url || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i);
        return match ? match[1].toLowerCase() : '';
    }

    function hasDocsWorkspaceAncestor() {
        const referrerHost = hostnameFromUrl(document?.referrer || '');
        if (referrerHost === 'docs.google.com') return true;

        try {
            const origins = Array.from(window.location?.ancestorOrigins || []);
            return origins.some(origin => hostnameFromUrl(origin) === 'docs.google.com');
        } catch (_) {
            return false;
        }
    }

    function isSupportedHost(hostname) {
        if (hostname === 'docs.google.com') return true;
        if (hostname) return false;
        return hasDocsWorkspaceAncestor();
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

    function isInputScanTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!matchesAny(element, INPUT_SCAN_SELECTORS)) return false;
        if (!isCommentContext(element)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        return true;
    }

    function textOf(element, engine) {
        if (!element) return '';
        if ('value' in element && typeof element.value === 'string') return element.value;
        return engine?.collectDirectionText?.(element) || element.innerText || element.textContent || '';
    }

    function isCommentContext(element) {
        if (!(element instanceof HTMLElement)) return false;
        return matchesAny(element, COMMENT_CONTEXT_SELECTORS)
            || matchesAny(element, TEXT_BLOCK_SELECTORS)
            || Boolean(element.closest?.(selectorList(COMMENT_CONTEXT_SELECTORS)));
    }

    function hasTextContent(element) {
        return (textOf(element).trim() || element.textContent?.trim() || element.value?.trim() || '').length > 0;
    }

    function isWorkspaceCommentBlock(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isSupportedHost(window.location.hostname)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        if (element.getAttribute?.(MODIFIED_ATTR) === 'true') return true;
        if (matchesAny(element, TEXT_BLOCK_SELECTORS) && hasTextContent(element)) return true;
        if (!isCommentContext(element) || !hasTextContent(element)) return false;
        return matchesAny(element, GENERIC_COMMENT_TEXT_SELECTORS);
    }

    function isTextTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isOutOfScope(element)) return false;
        if (matchesAny(element, TEXT_BLOCK_SELECTORS)) return true;
        if (!isCommentContext(element)) return false;
        return matchesAny(element, TEXT_TARGET_SELECTORS);
    }

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(Boolean)));
    }

    function getTextTargets(block) {
        const targets = [];
        if (isTextTarget(block) && textOf(block).trim()) {
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

    function markModified(element) {
        element.setAttribute(MODIFIED_ATTR, 'true');
        element.classList.add(MODIFIED_CLASS);
        modifiedElements.add(element);
    }

    function restoreMarked(engine) {
        Array.from(modifiedElements).forEach(element => {
            engine?.restoreElement?.(element);
            element.removeAttribute?.(MODIFIED_ATTR);
            element.classList?.remove(MODIFIED_CLASS);
            modifiedElements.delete(element);
        });
        document.querySelectorAll?.(`[${MODIFIED_ATTR}="true"]`).forEach(element => {
            engine?.restoreElement?.(element);
            element.removeAttribute(MODIFIED_ATTR);
            element.classList.remove(MODIFIED_CLASS);
        });
    }

    function getInputScanTarget(target) {
        if (!(target instanceof HTMLElement)) return null;
        if (!isSupportedHost(window.location.hostname)) return null;
        if (isInputScanTarget(target)) return target;
        const selector = selectorList(INPUT_SCAN_SELECTORS);
        const scanTarget = target.closest?.(selector);
        return isInputScanTarget(scanTarget) ? scanTarget : null;
    }

    function attachInputListeners(engine) {
        if (!document.addEventListener) return;
        if (!inputListener) {
            inputListener = event => {
                const target = getInputScanTarget(event?.target);
                if (target) engine.scheduleScan(target);
            };
            document.addEventListener('input', inputListener, true);
        }
        if (!focusListener) {
            focusListener = event => {
                const target = getInputScanTarget(event?.target);
                if (target) engine.scheduleScan(target);
            };
            document.addEventListener('focusin', focusListener, true);
        }
    }

    function detachInputListeners() {
        if (inputListener && document.removeEventListener) {
            document.removeEventListener('input', inputListener, true);
            inputListener = null;
        }
        if (focusListener && document.removeEventListener) {
            document.removeEventListener('focusin', focusListener, true);
            focusListener = null;
        }
    }

    function disableWorkspace(engine) {
        detachInputListeners();
        restoreMarked(engine);
    }

    function processWorkspaceComment(block, engine) {
        if (!isWorkspaceCommentBlock(block)) return true;

        const text = textOf(block, engine).trim();
        if (!PERSIAN_TEXT_REGEX.test(text) || !engine.needsRTL(text)) {
            engine.restoreElement(block);
            block.removeAttribute(MODIFIED_ATTR);
            block.classList.remove(MODIFIED_CLASS);
            getTextTargets(block).forEach(target => {
                engine.restoreElement(target);
                target.removeAttribute(MODIFIED_ATTR);
                target.classList.remove(MODIFIED_CLASS);
                modifiedElements.delete(target);
            });
            modifiedElements.delete(block);
            return true;
        }

        const targets = getTextTargets(block);
        const applied = targets.length ? targets : [block];
        applied.forEach(target => {
            engine.applyRTL(target);
            markModified(target);
        });
        return true;
    }

    const recipe = {
        version: 1,
        storageKey: 'googleWorkspaceEnabled',
        hosts: ['docs.google.com', ''],
        messageSelectors: TEXT_BLOCK_SELECTORS,
        excludeSelectors: [...CODE_GUARD_SELECTORS, ...OUT_OF_SCOPE_SELECTORS],
        textSelectors: [],
        rtlRegex: PERSIAN_TEXT_REGEX,
        rtlClass: MODIFIED_CLASS,
        inlineIsolate: true,
        isMessageElement: isWorkspaceCommentBlock,
        isCodeLike: element => isCodeLike(element) || isOutOfScope(element),
        applyToMessage: processWorkspaceComment,
        onEnable: attachInputListeners,
        onDisable: disableWorkspace,
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

            /* Live Docs/Sheets comments can already be RTL according to Google
               dir="rtl" while the engine still cannot mark the exact leaf
               node. Keep this as a direct, comment-only fallback for the real
               docos surfaces seen in Docs and Sheets. */
            .docos-replyview-body,
            .docos-anchoredreplyview-body,
            .docos-replyview-comment,
            .docos-replyview-comment-text,
            .docos-replyview-static,
            .docos-comment-body,
            .docos-comment-text,
            .docos-comment-text-body,
            .docos-input-textarea,
            .docos-input-contenteditable {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            .docos-replyview-body *,
            .docos-anchoredreplyview-body *,
            .docos-replyview-comment *,
            .docos-replyview-comment-text *,
            .docos-replyview-static *,
            .docos-comment-body *,
            .docos-comment-text *,
            .docos-comment-text-body *,
            .docos-input-textarea *,
            .docos-input-contenteditable * {
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            /* Marked comment surface: force RTL + Vazirmatn. Scoped ONLY to the
               elements RastChin marked, never the editor/grid/toolbar/menu. */
            .${MODIFIED_CLASS},
            [${MODIFIED_ATTR}="true"] {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            /* Reinforce the engine-set dir="rtl" on the marked subtree so the
               rendered comment/reply text Google paints in a nested child also
               flips even when only the container element was marked. */
            .${MODIFIED_CLASS}[dir="rtl"],
            [${MODIFIED_ATTR}="true"][dir="rtl"] {
                direction: rtl !important;
                text-align: right !important;
            }

            /* Apply Vazirmatn to every descendant of a marked comment surface so
               Google's per-node font-family on .docos-replyview-* children is
               overridden. Tied to the marked scope; cannot reach app chrome. */
            .${MODIFIED_CLASS} *,
            [${MODIFIED_ATTR}="true"] * {
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            /* Known Docs/Sheets comment + reply text nodes: right-align the
               rendered prose inside a marked thread container as well. */
            .${MODIFIED_CLASS} .docos-replyview-comment,
            .${MODIFIED_CLASS} .docos-replyview-comment-text,
            .${MODIFIED_CLASS} .docos-replyview-static,
            .${MODIFIED_CLASS} .docos-replyview-body,
            .${MODIFIED_CLASS} .docos-anchoredreplyview-body,
            .${MODIFIED_CLASS} .docos-comment-text,
            .${MODIFIED_CLASS} .docos-comment-body,
            [${MODIFIED_ATTR}="true"] .docos-replyview-comment,
            [${MODIFIED_ATTR}="true"] .docos-replyview-comment-text,
            [${MODIFIED_ATTR}="true"] .docos-replyview-static,
            [${MODIFIED_ATTR}="true"] .docos-replyview-body,
            [${MODIFIED_ATTR}="true"] .docos-anchoredreplyview-body,
            [${MODIFIED_ATTR}="true"] .docos-comment-text,
            [${MODIFIED_ATTR}="true"] .docos-comment-body {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
            }

            /* Composer (textarea / contenteditable): inherit the comment font but
               use plaintext bidi so an empty placeholder composer keeps its native
               LTR layout and only flips to RTL once Persian is typed; never force a
               hard text-align that would break caret/placeholder positioning. */
            .${MODIFIED_CLASS} input,
            .${MODIFIED_CLASS} textarea,
            .${MODIFIED_CLASS} [contenteditable="true"],
            .${MODIFIED_CLASS} [contenteditable="plaintext-only"],
            [${MODIFIED_ATTR}="true"] input,
            [${MODIFIED_ATTR}="true"] textarea,
            [${MODIFIED_ATTR}="true"] [contenteditable="true"],
            [${MODIFIED_ATTR}="true"] [contenteditable="plaintext-only"] {
                font-family: inherit !important;
                unicode-bidi: plaintext !important;
            }

            textarea.${MODIFIED_CLASS},
            input.${MODIFIED_CLASS},
            [contenteditable="true"].${MODIFIED_CLASS},
            [contenteditable="plaintext-only"].${MODIFIED_CLASS} {
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__GOOGLE_WORKSPACE_RTL_TEST__ === 'function') {
        window.__GOOGLE_WORKSPACE_RTL_TEST__({
            recipe,
            isSupportedHost,
            isWorkspaceCommentBlock,
            getTextTargets,
            textBlockSelectors: TEXT_BLOCK_SELECTORS,
            textTargetSelectors: TEXT_TARGET_SELECTORS,
            inputScanSelectors: INPUT_SCAN_SELECTORS,
            outOfScopeSelectors: OUT_OF_SCOPE_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
