// src/platforms/copilot-rtl.js
(() => {
    const IS_RTL = /\p{Script=Arabic}/u;
    const RTL_CLASS = 'rastchin-copilot-rtl';
    const MESSAGE_SELECTORS = [
        '[data-testid="ai-message"]', '[data-testid="ai-message-body"]',
        '[data-testid="user-message"]', '[data-content="ai-message"]',
        '[data-content="user-message"]', '[data-message-id]',
        'cib-message', 'cib-chat-turn', '[role="article"]'
    ];
    const CODE_SELECTOR = [
        'code', 'pre', '[class*="language-"]', '[class*="hljs"]',
        '.monaco-editor', '.cm-editor', '.ace_editor', '[role="code"]',
        '[data-testid*="code"]'
    ].join(', ');
    const CHROME_SELECTOR = [
        'button', '[role="toolbar"]', '[role="menu"]', '[role="menuitem"]',
        '[role="tab"]', '[role="navigation"]', 'input', 'textarea',
        '[contenteditable="true"]', 'svg', 'canvas', 'img', 'video',
        '[aria-hidden="true"]'
    ].join(', ');
    const TEXT_BLOCK_TAGS = new Set([
        'P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
    ]);

    function containsElement(root, child) {
        if (root === child) return true;
        if (typeof root?.contains === 'function') return root.contains(child);
        let current = child?.parentElement;
        while (current) {
            if (current === root) return true;
            current = current.parentElement;
        }
        return false;
    }

    function isLayoutContainer(element) {
        if (!(element instanceof HTMLElement)) return false;
        const display = window.getComputedStyle(element).display || '';
        return display.includes('flex') || display.includes('grid') || display.startsWith('table');
    }

    function isExcluded(element) {
        return element instanceof HTMLElement &&
            (!!element.closest(CODE_SELECTOR) || !!element.closest(CHROME_SELECTOR));
    }

    function resolveTextTarget(textNode, root) {
        let current = textNode.parentElement;
        const item = current?.closest('li');
        if (item && containsElement(root, item) && !isExcluded(item)) return item;

        while (current && containsElement(root, current)) {
            if (isExcluded(current)) return null;
            if (TEXT_BLOCK_TAGS.has(current.tagName)) return current;
            const display = window.getComputedStyle(current).display || '';
            if (display === 'block' && !isLayoutContainer(current)) return current;
            current = current.parentElement;
        }
        return null;
    }

    function reconcileTargets(engine, root, targets) {
        if (!engine?.styledElements) return;
        const desired = Array.from(targets);
        Array.from(engine.styledElements.keys()).forEach(element => {
            if (!element?.isConnected) {
                engine.styledElements.delete(element);
                return;
            }
            if (!containsElement(root, element) || targets.has(element)) return;
            if (desired.some(target => target !== element && containsElement(element, target))) {
                engine.restoreElement(element);
            }
        });
    }

    const recipe = {
        version: 1,
        storageKey: 'copilotEnabled',
        inlineIsolate: true,
        hosts: ['copilot.microsoft.com'],
        messageSelectors: MESSAGE_SELECTORS,
        excludeSelectors: [CHROME_SELECTOR],
        textSelectors: [],
        codeGuardSelectors: [CODE_SELECTOR],
        rtlRegex: IS_RTL,
        rtlClass: RTL_CLASS,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isCodeLike: isExcluded,
        applyToMessage: (root, engine) => {
            if (!(root instanceof HTMLElement) || !root.isConnected) return true;
            const text = engine.collectDirectionText(root);
            if (!engine.needsRTL(text)) {
                engine.restoreSubtree(root);
                return true;
            }

            const targets = new Set();
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                const content = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (content.length >= 3 && engine.needsRTL(content)) {
                    const target = resolveTextTarget(node, root);
                    if (target) {
                        if (target.tagName === 'LI') {
                            const list = target.parentElement?.closest('ul, ol');
                            if (list && containsElement(root, list)) targets.add(list);
                        }
                        targets.add(target);
                    }
                }
                node = walker.nextNode();
            }

            reconcileTargets(engine, root, targets);
            targets.forEach(target => engine.applyRTL(target));
            return true;
        },
        globalCss: codeGuard => `
            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }

            .${RTL_CLASS}[dir="rtl"] {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            ul.${RTL_CLASS},
            ol.${RTL_CLASS} {
                box-sizing: border-box !important;
                padding-inline-start: 1.5rem !important;
                padding-inline-end: 0 !important;
                margin-inline-start: 0 !important;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__COPILOT_RTL_TEST__ === 'function') {
        window.__COPILOT_RTL_TEST__({
            recipe, messageSelectors: MESSAGE_SELECTORS, codeSelector: CODE_SELECTOR,
            chromeSelector: CHROME_SELECTOR, isLayoutContainer
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
