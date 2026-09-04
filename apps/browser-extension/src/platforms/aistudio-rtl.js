// scripts/aistudio-rtl.js
(() => {
    const IS_RTL = /\p{Script=Arabic}/u;

    const MESSAGE_SELECTORS = [
        // MakerSuite/AI Studio components
        'ms-chat-session',
        'ms-chat-turn',
        'ms-text-chunk',
        'ms-prompt-chunk',
        'ms-chat-content',
        'ms-chat-body',
        'ms-message',
        'ms-cmark-node',
        // Class patterns observed in DOM
        '[class*="chat-session"]',
        '[class*="chatSession"]',
        '[class*="chat-turn"]',
        '[class*="chatTurn"]',
        '[class*="text-chunk"]',
        '[class*="textChunk"]',
        '[class*="prompt-chunk"]',
        '[class*="promptChunk"]',
        '[class*="chat-message"]',
        '[class*="chatMessage"]',
        '[class*="message-body"]',
        '[class*="messageBody"]',
        '[class*="response-card"]',
        // Fallback containers
        'gen-ai-chat-message',
        'gen-ai-message'

    ];

    const TEXTUAL_TAGS = new Set([
        'P',
        'DIV',
        'SPAN',
        'LI',
        'UL',
        'OL',
        'BLOCKQUOTE',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'FIGCAPTION',
        'DD',
        'DT',
        'A',
        'LABEL'
    ]);

    const INLINE_TEXT_TAGS = new Set([
        'A', 'B', 'EM', 'I', 'LABEL', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG', 'U'
    ]);
    const BLOCK_TEXT_DISPLAYS = new Set([
        'block', 'flow-root', 'list-item', 'table-caption', 'table-cell'
    ]);

    const CODE_SELECTOR =
        'code, pre, [class*=\"language-\"], [class*=\"hljs\"], .monaco-editor, .cm-editor, [role=\"code\"]';
    const CHROME_SELECTOR = [
        'button', '[role="button"]', '[role="toolbar"]', '[role="menu"]',
        '[role="menuitem"]', '[role="tab"]', '[role="navigation"]',
        '[role="banner"]', 'input', 'textarea', 'select',
        '[contenteditable="true"]', 'mat-icon', 'svg', 'canvas', 'img',
        'video', '[aria-hidden="true"]'
    ].join(', ');

    function isLayoutContainer(el) {
        if (!el || !(el instanceof HTMLElement) || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        const display = style.display || '';

        if (display.includes('grid') || display === 'table' || display === 'inline-grid') {
            return true;
        }

        // `direction` participates in flex layout even for column containers
        // (cross-axis start/end). Keep it off compare panes and action rows.
        if (display.includes('flex')) return true;

        return false;
    }

    function shouldStyleElement(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        if (isChromeLike(el)) return false;
        if (isLayoutContainer(el)) return false;
        const display = window.getComputedStyle(el).display || '';
        return BLOCK_TEXT_DISPLAYS.has(display) || TEXTUAL_TAGS.has(el.tagName);
    }

    function isChromeLike(el) {
        return el instanceof HTMLElement && !!el.closest(CHROME_SELECTOR);
    }

    function isInlineTextTarget(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        const display = window.getComputedStyle(el).display || '';
        return display === 'inline' || display === 'inline-block' || display === 'contents' ||
            (!display && INLINE_TEXT_TAGS.has(el.tagName));
    }

    function resolveTextTarget(textNode, root) {
        let current = textNode.parentElement;
        const listItem = current?.closest('li');
        if (listItem && containsElement(root, listItem) &&
            !listItem.closest(CODE_SELECTOR) && !isChromeLike(listItem)) {
            return { element: listItem, isCode: false };
        }
        let inlineFallback = null;
        while (current && containsElement(root, current)) {
            if (current.closest(CODE_SELECTOR) || isChromeLike(current)) {
                return { element: current, isCode: true };
            }

            if (shouldStyleElement(current)) {
                if (isInlineTextTarget(current)) {
                    if (!inlineFallback) inlineFallback = current;
                    current = current.parentElement;
                    continue;
                }
                return { element: current, isCode: false };
            }

            current = current.parentElement;
        }
        return inlineFallback ? { element: inlineFallback, isCode: false } : null;
    }

    function containsElement(root, child) {
        if (!root || !child) return false;
        if (root === child) return true;
        if (typeof root.contains === 'function') return root.contains(child);
        let current = child.parentElement;
        while (current) {
            if (current === root) return true;
            current = current.parentElement;
        }
        return false;
    }

    function reconcileStyledTargets(engine, root, desiredTargets) {
        if (!engine?.styledElements || !root) return;
        const desired = Array.from(desiredTargets);
        Array.from(engine.styledElements.keys()).forEach(styled => {
            if (!(styled instanceof HTMLElement) || !styled.isConnected) {
                engine.styledElements.delete(styled);
                return;
            }
            if (!containsElement(root, styled) || desiredTargets.has(styled)) return;

            const containsDesired = desired.some(target => target !== styled && containsElement(styled, target));
            if (containsDesired) {
                engine.restoreElement(styled);
            } else {
                engine.restoreSubtree(styled);
            }
        });
    }

    const recipe = {
        version: 1,
        hosts: ['aistudio.google.com'],
        storageKey: 'aistudioEnabled',
        enableBeforeSettings: true,
        // AI Studio paints newly streamed chunks immediately. Process its small
        // incremental mutation batches in a microtask so prose direction is set
        // before the next paint instead of visibly flipping one frame later.
        scanBeforePaint: true,
        inlineIsolate: true,
        messageSelectors: MESSAGE_SELECTORS,
        excludeSelectors: [CHROME_SELECTOR],
        textSelectors: [],
        codeGuardSelectors: [CODE_SELECTOR],
        rtlRegex: IS_RTL,
        rtlClass: 'rastchin-rtl-text',
        rtlStyle: { unicodeBidi: 'plaintext' },
        isCodeLike: el => el instanceof HTMLElement && (!!el.closest(CODE_SELECTOR) || isChromeLike(el)),
        applyToMessage: (el, engine) => {
            if (!el || !(el instanceof HTMLElement) || !el.isConnected) return true;
            const text = engine.collectDirectionText(el);
            if (!engine.needsRTL(text)) {
                engine.restoreSubtree(el);
                return true;
            }

            const targets = new Set();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();

            while (node) {
                const content = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (content.length >= 3 && engine.needsRTL(content)) {
                    const target = resolveTextTarget(node, el);
                    if (target && !target.isCode) {
                        if (target.element.tagName === 'LI') {
                            const list = target.element.parentElement?.closest('ul, ol');
                            if (list && containsElement(el, list)) targets.add(list);
                        }
                        targets.add(target.element);
                    }
                }
                node = walker.nextNode();
            }

            // A candidate can be an entire chat session or compare pane. Marking
            // that root reverses native flex/grid behavior and leaks RTL into
            // model headers, buttons and scroll containers. Mark prose only.
            reconcileStyledTargets(engine, el, targets);
            targets.forEach(target => engine.applyRTL(target));

            return true;
        },
        globalCss: codeGuard => `
            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }

            [dir="rtl"].rastchin-rtl-text,
            .rastchin-rtl-text[dir="rtl"] {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
            }

            .rastchin-rtl-text ul,
            .rastchin-rtl-text ol,
            ul.rastchin-rtl-text,
            ol.rastchin-rtl-text {
                direction: rtl !important;
                box-sizing: border-box !important;
                padding-inline-start: 1.5rem !important;
                padding-inline-end: 0 !important;
            }

            .rastchin-rtl-text li,
            li.rastchin-rtl-text {
                text-align: right !important;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__AISTUDIO_RTL_TEST__ === 'function') {
        window.__AISTUDIO_RTL_TEST__({
            recipe,
            messageSelectors: MESSAGE_SELECTORS,
            codeSelector: CODE_SELECTOR,
            chromeSelector: CHROME_SELECTOR,
            isLayoutContainer
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
