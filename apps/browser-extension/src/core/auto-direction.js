// scripts/auto-direction.js
(() => {
    const state = {
        enabled: false,
        observer: null,
        trackedInputs: new Map(),
        inputListener: null
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
        return window.location.hostname === 'gemini.google.com';
    }

    function isClaudeHost() {
        return window.location.hostname === 'claude.ai';
    }

    function isChatgptHost() {
        const host = window.location.hostname;
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

        if (el instanceof HTMLElement && (el.isContentEditable || (el.getAttribute("role") || "").toLowerCase() === "textbox")) {
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

    function detectDirection(el) {
        const firstChar = extractFromEditable(el);
        if (!firstChar) return "ltr";
        return IS_RTL.test(firstChar) ? "rtl" : "ltr";
    }

    function applyDetectedDirection(el) {
        const dir = detectDirection(el);
        el.dir = dir;
        if (dir === "rtl") {
            el.style.setProperty("direction", "rtl", "important");
            el.style.setProperty("text-align", "right", "important");
        } else {
            el.style.removeProperty("direction");
            el.style.removeProperty("text-align");
        }
    }

    function updateDirection(el) {
        if (!el || !isEditable(el)) return;
        if (shouldSkipEditable(el)) return;

        const dirAttr = (el.getAttribute("dir") || "").toLowerCase();
        const firstChar = extractFromEditable(el);

        if (el.isContentEditable) {
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

        const handler = () => updateDirection(el);
        el.addEventListener("input", handler);
        el.addEventListener("compositionend", handler);
        el.addEventListener("change", handler);
        updateDirection(el);

        state.trackedInputs.set(el, () => {
            el.removeEventListener("input", handler);
            el.removeEventListener("compositionend", handler);
            el.removeEventListener("change", handler);
            el.removeAttribute("dir");
            el.style.removeProperty("direction");
            el.style.removeProperty("text-align");
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

    function detachGlobalInputListener() {
        if (!state.inputListener) return;
        document.removeEventListener("input", state.inputListener, true);
        document.removeEventListener("compositionend", state.inputListener, true);
        document.removeEventListener("change", state.inputListener, true);
        state.inputListener = null;
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
        state.observer.observe(document.documentElement, { childList: true, subtree: true });
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
        scanEditableNodes();
        startObserver();
    }

    function disable() {
        if (!state.enabled) return;
        state.enabled = false;
        stopObserver();
        detachGlobalInputListener();
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

    if (typeof window !== 'undefined' && typeof window.__AUTO_DIR_TEST__ === 'function') {
        window.__AUTO_DIR_TEST__({
            updateDirection, applyDetectedDirection, detectDirection,
            extractFromEditable, findFirstStrongChar, shouldSkipElement, shouldSkipEditable,
            scanEditableNodes, resolveEditableTarget
        });
    }
})();
