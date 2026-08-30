// scripts/auto-direction.js
(() => {
    const state = {
        enabled: false,
        observer: null,
        trackedInputs: new Map(),
        inputListener: null,
        pasteListener: null
    };

    const IS_RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
    const STRONG_CHAR = /[\p{L}\p{N}]/u;
    const TEXT_INPUT_TYPES = new Set(["", "text", "search", "url", "tel", "email", "password", "number"]);
    const EDITABLE_SELECTOR = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="tel"], input[type="email"], input[type="password"], input[type="number"], [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

    const GEMINI_UI_SKIP = [
        '[data-test-id="overflow-container"]',
        '[data-test-id="all-conversations"]',
        '[data-test-id="conversation"]',
        '[data-test-id="chats-expandable-section"]',
        '[data-test-id="notebooks-expandable-section"]',
        'conversations-list',
        'project-sidenav-list',
        'mat-nav-list[gem-sidenav-list]'
    ].join(', ');

    // Claude streams its (non-editable) assistant response into these containers.
    // Scanning those subtrees for editables is wasted work and walks a large,
    // constantly-mutating tree during streaming. Skip them; the real composer lives
    // outside the response containers and keeps auto-direction.
    const CLAUDE_RESPONSE_SKIP = [
        '.font-claude-message',
        '.font-claude-response',
        '[data-test-render-count]',
        '[role="article"]'
    ].join(', ');

    // ChatGPT streams its (non-editable) assistant/user turns into these containers.
    // Like Claude, scanning them for editables is wasted work over a large, churning
    // tree; the composer lives outside them (in the unified composer) and keeps
    // auto-direction.
    const CHATGPT_RESPONSE_SKIP = [
        '[data-message-author-role]',
        '[data-testid="conversation-turn"]'
    ].join(', ');

    function isGeminiHost() {
        return (window.__RASTCHIN_DESKTOP_HOST__ || window.location.hostname) === 'gemini.google.com';
    }

    function isClaudeHost() {
        return (window.__RASTCHIN_DESKTOP_HOST__ || window.location.hostname) === 'claude.ai';
    }

    function isChatgptHost() {
        const host = window.__RASTCHIN_DESKTOP_HOST__ || window.location.hostname;
        return host === 'chatgpt.com' || host === 'chat.openai.com';
    }

    function isChatgptResponseTarget(el) {
        return isChatgptHost() && !!el.closest(CHATGPT_RESPONSE_SKIP);
    }

    function shouldSkipEditable(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (isGeminiHost() && el.closest(GEMINI_UI_SKIP)) return true;
        if (isClaudeHost() && el.closest(CLAUDE_RESPONSE_SKIP)) return true;
        return false;
    }

    function shouldSkipElement(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (isGeminiHost() && el.closest(GEMINI_UI_SKIP)) return true;
        if (isClaudeHost() && el.closest(CLAUDE_RESPONSE_SKIP)) return true;
        if (isChatgptResponseTarget(el)) return true;
        return false;
    }

    function isEditable(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el instanceof HTMLTextAreaElement) return true;
        if (el instanceof HTMLInputElement) {
            const type = (el.type || "").toLowerCase();
            return TEXT_INPUT_TYPES.has(type);
        }
        if (el.matches?.('[contenteditable]:not([contenteditable="false"])')) return true;
        if ((el.getAttribute("role") || "").toLowerCase() === "textbox") return true;
        return false;
    }

    function findFirstStrongChar(str) {
        if (!str) return null;
        for (const char of str) {
            if (STRONG_CHAR.test(char)) {
                return char;
            }
        }
        return null;
    }

    function extractFromEditable(el) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return findFirstStrongChar(el.value || "");
        }

        if (el instanceof HTMLElement && (
            el.isContentEditable
            || el.matches?.('[contenteditable]:not([contenteditable="false"])')
            || (el.getAttribute("role") || "").toLowerCase() === "textbox"
        )) {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
            let current = walker.nextNode();
            while (current) {
                const candidate = findFirstStrongChar(current.textContent || "");
                if (candidate) return candidate;
                current = walker.nextNode();
            }
            return null;
        }

        return null;
    }

    function editableContainsRtl(el) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return IS_RTL.test(el.value || "");
        }

        if (el instanceof HTMLElement && (
            el.isContentEditable
            || el.matches?.('[contenteditable]:not([contenteditable="false"])')
            || (el.getAttribute("role") || "").toLowerCase() === "textbox"
        )) {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
            let current = walker.nextNode();
            while (current) {
                if (IS_RTL.test(current.textContent || "")) return true;
                current = walker.nextNode();
            }
        }

        return false;
    }

    function detectDirection(el) {
        return editableContainsRtl(el) ? "rtl" : "ltr";
    }

    function applyDirection(el, dir) {
        el.dir = dir;
        if (dir === "rtl") {
            el.style.setProperty("direction", "rtl", "important");
            el.style.setProperty("text-align", "right", "important");
        } else {
            el.style.removeProperty("direction");
            el.style.removeProperty("text-align");
        }
    }

    function applyDetectedDirection(el) {
        applyDirection(el, detectDirection(el));
    }

    function updateDirection(el) {
        if (!el || !isEditable(el)) return;
        if (shouldSkipEditable(el)) return;

        const dirAttr = (el.getAttribute("dir") || "").toLowerCase();
        const firstChar = extractFromEditable(el);

        if (el.isContentEditable || el.matches?.('[contenteditable]:not([contenteditable="false"])')) {
            if (!firstChar) {
                el.setAttribute("dir", "auto");
                el.style.removeProperty("direction");
                el.style.removeProperty("text-align");
                return;
            }
            applyDetectedDirection(el);
            return;
        }

        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            if (!firstChar) {
                el.setAttribute("dir", "auto");
                el.style.removeProperty("direction");
                el.style.removeProperty("text-align");
                return;
            }

            if (dirAttr === "auto") {
                applyDetectedDirection(el);
                return;
            }
        }

        applyDetectedDirection(el);
    }

    function attachAutoDirection(el) {
        if (!isEditable(el) || state.trackedInputs.has(el)) return;
        if (shouldSkipEditable(el)) return;

        const original = {
            dir: el.getAttribute('dir'),
            direction: el.style.getPropertyValue('direction'),
            directionPriority: el.style.getPropertyPriority('direction'),
            textAlign: el.style.getPropertyValue('text-align'),
            textAlignPriority: el.style.getPropertyPriority('text-align')
        };

        const handler = () => updateDirection(el);
        el.addEventListener("input", handler);
        el.addEventListener("compositionend", handler);
        el.addEventListener("change", handler);
        updateDirection(el);

        state.trackedInputs.set(el, () => {
            el.removeEventListener("input", handler);
            el.removeEventListener("compositionend", handler);
            el.removeEventListener("change", handler);
            if (original.dir === null) el.removeAttribute('dir');
            else el.setAttribute('dir', original.dir);
            if (original.direction) {
                el.style.setProperty('direction', original.direction, original.directionPriority);
            } else {
                el.style.removeProperty('direction');
            }
            if (original.textAlign) {
                el.style.setProperty('text-align', original.textAlign, original.textAlignPriority);
            } else {
                el.style.removeProperty('text-align');
            }
        });
    }

    function resolveEditableTarget(target) {
        if (!(target instanceof HTMLElement)) return null;
        if (isEditable(target)) return target;
        const closest = target.closest?.(EDITABLE_SELECTOR);
        return isEditable(closest) ? closest : null;
    }

    function attachGlobalInputListener() {
        if (state.inputListener) return;
        const handler = event => {
            if (!state.enabled) return;
            const target = resolveEditableTarget(event.target);
            if (target && !shouldSkipEditable(target)) {
                updateDirection(target);
            }
        };
        document.addEventListener("input", handler, true);
        document.addEventListener("compositionend", handler, true);
        document.addEventListener("change", handler, true);
        state.inputListener = handler;
    }

    function attachGlobalPasteListener() {
        if (state.pasteListener) return;
        const handler = event => {
            if (!state.enabled) return;
            const target = resolveEditableTarget(event.target);
            if (!target || shouldSkipEditable(target)) return;

            // Controlled editors can commit clipboard content after their paste
            // handler and omit a useful input event. Apply RTL immediately from the
            // clipboard when Persian is present, then re-read the committed DOM on
            // the next turns so English-only pastes and host rewrites also settle.
            const pastedText = event.clipboardData?.getData?.('text/plain') || '';
            if (IS_RTL.test(pastedText)) applyDirection(target, 'rtl');

            const settle = () => {
                if (state.enabled && target.isConnected) updateDirection(target);
            };
            if (typeof queueMicrotask === 'function') queueMicrotask(settle);
            setTimeout(settle, 0);
            setTimeout(settle, 50);
        };
        document.addEventListener('paste', handler, true);
        state.pasteListener = handler;
    }

    function detachGlobalInputListener() {
        if (!state.inputListener) return;
        document.removeEventListener("input", state.inputListener, true);
        document.removeEventListener("compositionend", state.inputListener, true);
        document.removeEventListener("change", state.inputListener, true);
        state.inputListener = null;
    }

    function detachGlobalPasteListener() {
        if (!state.pasteListener) return;
        document.removeEventListener('paste', state.pasteListener, true);
        state.pasteListener = null;
    }

    function detachAll() {
        state.trackedInputs.forEach((cleanup, el) => {
            try {
                cleanup();
            } catch (err) {
                console.error("auto-direction cleanup failed", err);
            }
        });
        state.trackedInputs.clear();
    }

    function cleanupTrackedInSubtree(root) {
        if (!(root instanceof HTMLElement) && !(root instanceof DocumentFragment)) return;
        const nodes = [];
        if (root instanceof HTMLElement && state.trackedInputs.has(root)) {
            nodes.push(root);
        }
        if (root.querySelectorAll) {
            root.querySelectorAll(EDITABLE_SELECTOR).forEach(node => {
                if (state.trackedInputs.has(node)) {
                    nodes.push(node);
                }
            });
        }
        nodes.forEach(node => {
            const cleanup = state.trackedInputs.get(node);
            if (cleanup) {
                try {
                    cleanup();
                } catch (err) {
                    console.error("auto-direction cleanup failed", err);
                }
                state.trackedInputs.delete(node);
            }
        });
    }

    function collectEditableNodes(root, nodes, visitedShadows = new Set()) {
        if (!root) return;
        // Don't descend into skipped subtrees (e.g. Claude's streaming response):
        // avoids the expensive querySelectorAll('*') walk over a large, churning tree.
        if (root instanceof HTMLElement && shouldSkipElement(root)) {
            // ChatGPT can mount an inline editor inside a previous turn. Keep the
            // response subtree skip for general scanning, but collect editables only
            // so editing an old message still gets direction handling.
            if (isChatgptResponseTarget(root) && root.querySelectorAll) {
                if (isEditable(root) && !shouldSkipEditable(root)) nodes.push(root);
                root.querySelectorAll(EDITABLE_SELECTOR).forEach(node => {
                    if (!shouldSkipEditable(node)) nodes.push(node);
                });
            }
            return;
        }
        if (isEditable(root) && !shouldSkipEditable(root)) {
            nodes.push(root);
        }

        if (root instanceof HTMLElement && root.shadowRoot && !visitedShadows.has(root.shadowRoot)) {
            visitedShadows.add(root.shadowRoot);
            collectEditableNodes(root.shadowRoot, nodes, visitedShadows);
        }

        const isShadowRoot = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
        const queryRoot = (root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment || isShadowRoot) ? root : null;
        if (!queryRoot?.querySelectorAll) return;

        queryRoot.querySelectorAll(EDITABLE_SELECTOR).forEach(node => {
            if (!shouldSkipEditable(node)) {
                nodes.push(node);
            }
        });

        queryRoot.querySelectorAll('*').forEach(node => {
            if (node instanceof HTMLElement && node.shadowRoot && !visitedShadows.has(node.shadowRoot)) {
                visitedShadows.add(node.shadowRoot);
                collectEditableNodes(node.shadowRoot, nodes, visitedShadows);
            }
        });
    }

    function scanEditableNodes(root = document) {
        const nodes = [];
        collectEditableNodes(root, nodes);
        nodes.forEach(attachAutoDirection);
    }

    function startObserver() {
        if (state.observer || !state.enabled) return;
        state.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                const mutationElement = mutation.target instanceof HTMLElement
                    ? mutation.target
                    : mutation.target.parentElement;
                const edited = resolveEditableTarget(mutationElement);
                if (edited && !shouldSkipEditable(edited)) updateDirection(edited);

                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE && !(node instanceof DocumentFragment)) return;
                    if (node instanceof HTMLElement) {
                        if (node.shadowRoot) scanEditableNodes(node.shadowRoot);
                        if (isEditable(node) && !shouldSkipEditable(node)) {
                            attachAutoDirection(node);
                        }
                        scanEditableNodes(node);
                    } else if (node instanceof DocumentFragment) {
                        scanEditableNodes(node);
                    }
                });
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE && !(node instanceof DocumentFragment)) return;
                    cleanupTrackedInSubtree(node);
                });
            }
        });
        state.observer.observe(document.documentElement, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    function stopObserver() {
        if (!state.observer) return;
        state.observer.disconnect();
        state.observer = null;
    }

    function enable() {
        if (state.enabled) return;
        state.enabled = true;
        attachGlobalInputListener();
        attachGlobalPasteListener();
        scanEditableNodes();
        startObserver();
    }

    function disable() {
        if (!state.enabled) return;
        state.enabled = false;
        stopObserver();
        detachGlobalInputListener();
        detachGlobalPasteListener();
        detachAll();
    }

    function init() {
        const config = window.chatbotConfig;
        if (!config) {
            enable();
            return;
        }

        const unsubscribe = config.subscribe(({ enabled }) => {
            if (enabled) {
                enable();
            } else {
                disable();
            }
        });

        window.addEventListener("beforeunload", () => {
            disable();
            unsubscribe();
        }, { once: true });
    }

    init();
    window.__RASTCHIN_DESKTOP_REGISTER__?.({ enable, disable });

    if (typeof window !== 'undefined' && typeof window.__AUTO_DIR_TEST__ === 'function') {
        window.__AUTO_DIR_TEST__({
            updateDirection, applyDetectedDirection, detectDirection,
            editableContainsRtl, extractFromEditable, findFirstStrongChar,
            shouldSkipElement, shouldSkipEditable,
            scanEditableNodes, resolveEditableTarget
        });
    }
})();
