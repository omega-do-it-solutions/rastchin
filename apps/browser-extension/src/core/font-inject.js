// scripts/font-inject.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");

    const STYLE_CSS = `
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

    textarea,
    input:not([type]),
    input[type="text"],
    input[type="search"],
    input[type="url"],
    input[type="tel"],
    input[type="email"],
    input[type="password"],
    input[type="number"],
    [contenteditable]:not([contenteditable="false"]),
    [role="textbox"] {
      font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
    }
    `;

    const IS_RTL = /\p{Script=Arabic}/u;
    const PERSIAN_LANG_PREFIXES = ["fa", "fas", "prs"];
    const TEXT_INPUT_TYPES = new Set(["", "text", "search", "url", "tel", "email", "password", "number"]);
    const CONTENTEDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

    // On Claude and ChatGPT the assistant response is React-managed and streamed.
    // Each platform's recipe already scopes the Persian content font via its own
    // stylesheet, so inline font mutation on those streaming nodes is both redundant
    // and a streaming-time hazard. Claude tables can also be direct recipe
    // candidates after wrapper drift, so they stay under the Claude table stylesheet
    // instead of receiving inline "Vazirmatn" that would override its table font.
    const RESPONSE_SKIP_SELECTORS = {
        "claude.ai": '.font-claude-message, .font-claude-response, [data-test-render-count], [role="article"], table, [role="table"]',
        "chatgpt.com": '[data-message-author-role], [data-testid="conversation-turn"]',
        "chat.openai.com": '[data-message-author-role], [data-testid="conversation-turn"]'
    };

    function responseSkipSelector() {
        if (typeof window === "undefined" || !window.location) return "";
        return RESPONSE_SKIP_SELECTORS[window.location.hostname] || "";
    }

    function isResponseTarget(element) {
        const selector = responseSkipSelector();
        return !!selector && !!element.closest?.(selector);
    }
    const OBSERVER_CONFIG = {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["lang"]
    };

    const supportsConstructableSheets = !!(document.adoptedStyleSheets && typeof CSSStyleSheet === "function");

    const state = {
        enabled: false,
        documentStyle: null,
        observer: null,
        appliedShadows: new Set(),
        shadowSheets: new Map(),
        shadowStyles: new Map(),
        shadowObservers: new Map(),
        trackedElements: new Set(),
        originalInlineFonts: new Map(),
        inputListener: null,
        textNodeStatus: new WeakMap(),
        textNodeParents: new WeakMap(),
        elementTextCounts: new WeakMap()
    };

    const createStyleElement = () => {
        const style = document.createElement("style");
        style.textContent = STYLE_CSS;
        return style;
    };

    function applyToDocument() {
        if (state.documentStyle) return;

        const style = createStyleElement();
        (document.head || document.documentElement).appendChild(style);
        state.documentStyle = style;
    }

    function removeFromDocument() {
        if (!state.documentStyle) return;

        if (supportsConstructableSheets && state.documentStyle instanceof CSSStyleSheet) {
            document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== state.documentStyle);
        } else if (state.documentStyle instanceof HTMLElement) {
            state.documentStyle.remove();
        }

        state.documentStyle = null;
    }

    function shouldIgnoreElement(element) {
        const tagName = element.tagName;
        return tagName === "SCRIPT" || tagName === "STYLE" || tagName === "TEMPLATE";
    }

    function resolveFontTargets(element) {
        if (!(element instanceof HTMLElement)) return [];
        const targets = [element];
        if (element.matches?.(CONTENTEDITABLE_SELECTOR)) return targets;
        const host = element.closest?.(CONTENTEDITABLE_SELECTOR);
        if (host && host !== element) targets.push(host);
        return targets;
    }

    function isTextualInput(element) {
        if (element instanceof HTMLTextAreaElement) {
            return true;
        }

        if (element instanceof HTMLInputElement) {
            const type = (element.type || "").toLowerCase();
            return TEXT_INPUT_TYPES.has(type);
        }

        if (element instanceof HTMLElement && element.matches?.(`${CONTENTEDITABLE_SELECTOR}, [role="textbox"]`)) {
            return true;
        }

        return false;
    }

    function getEditableText(element) {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            return element.value;
        }
        if (element instanceof HTMLElement && element.matches?.(`${CONTENTEDITABLE_SELECTOR}, [role="textbox"]`)) {
            return element.innerText || element.textContent;
        }
        return "";
    }

    function containsPersian(text) {
        return !!text && IS_RTL.test(text);
    }

    function isPersianLang(lang) {
        if (!lang) return false;
        const normalized = lang.trim().toLowerCase();
        if (!normalized) return false;
        return PERSIAN_LANG_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}-`));
    }

    function elementNeedsPersianFont(element) {
        if (!(element instanceof HTMLElement)) return false;

        if (element.hasAttribute("lang") && isPersianLang(element.getAttribute("lang"))) {
            return true;
        }

        if (isTextualInput(element)) {
            return containsPersian(getEditableText(element));
        }

        return (state.elementTextCounts.get(element) || 0) > 0;
    }

    function applyFontToElement(element) {
        if (!(element instanceof HTMLElement)) return;
        if (!element.isConnected) return;
        if (shouldIgnoreElement(element)) return;
        if (state.trackedElements.has(element)) return;

        const computed = window.getComputedStyle(element).fontFamily || "";
        if (!computed) return;

        if (computed.toLowerCase().includes("vazirmatn")) {
            return;
        }

        const previousInline = element.style.getPropertyValue("font-family");
        const previousPriority = element.style.getPropertyPriority("font-family");
        const hadInline = previousInline.length > 0;

        state.originalInlineFonts.set(element, { value: previousInline, priority: previousPriority, hadInline });
        const newStack = `"Vazirmatn"${computed ? `, ${computed}` : ""}`;
        element.style.setProperty("font-family", newStack, "important");
        state.trackedElements.add(element);
    }

    function removeFontFromElement(element) {
        if (!state.trackedElements.has(element)) return;

        const original = state.originalInlineFonts.get(element);

        if (original && original.hadInline) {
            element.style.setProperty("font-family", original.value, original.priority || "");
        } else {
            element.style.removeProperty("font-family");
        }

        state.originalInlineFonts.delete(element);
        state.trackedElements.delete(element);
    }

    function updateElementFont(element) {
        if (!(element instanceof HTMLElement)) return;
        if (isResponseTarget(element)) {
            removeFontFromElement(element);
            return;
        }

        if (elementNeedsPersianFont(element)) {
            applyFontToElement(element);
        } else {
            removeFontFromElement(element);
        }
    }

    function handleLangAttribute(element) {
        if (!(element instanceof HTMLElement)) return;
        if (!element.hasAttribute("lang")) return;
        updateElementFont(element);
    }

    function rememberTextNodeParent(node, parents) {
        if (!node) return;
        // `parents` is the array of font targets (element + optional contenteditable
        // host). The previous `instanceof HTMLElement` guard silently rejected the
        // array, so removed text nodes never decremented their parents' counts and
        // their injected font was never cleaned up. Store the validated elements.
        const list = Array.isArray(parents) ? parents : [parents];
        const elements = list.filter(parent => parent instanceof HTMLElement);
        if (elements.length) state.textNodeParents.set(node, elements);
    }

    function incrementElementTextCount(element) {
        if (!(element instanceof HTMLElement)) return;
        if (shouldIgnoreElement(element)) return;
        const next = (state.elementTextCounts.get(element) || 0) + 1;
        state.elementTextCounts.set(element, next);
        applyFontToElement(element);
    }

    function decrementElementTextCount(element) {
        if (!(element instanceof HTMLElement)) return;
        if (shouldIgnoreElement(element)) return;
        const current = state.elementTextCounts.get(element) || 0;
        if (current <= 1) {
            state.elementTextCounts.delete(element);
            if (!elementNeedsPersianFont(element)) {
                removeFontFromElement(element);
            }
        } else {
            state.elementTextCounts.set(element, current - 1);
        }
    }

    function evaluateTextNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const parent = node.parentElement;
        if (!(parent instanceof HTMLElement)) return;
        const targets = resolveFontTargets(parent).filter(target =>
            target instanceof HTMLElement
            && !shouldIgnoreElement(target)
            && !isResponseTarget(target)
        );
        if (!targets.length) return;

        rememberTextNodeParent(node, targets);

        const hasPersian = containsPersian(node.textContent);
        const previous = state.textNodeStatus.get(node) || false;
        if (previous === hasPersian) return;

        state.textNodeStatus.set(node, hasPersian);

        if (hasPersian) {
            targets.forEach(incrementElementTextCount);
        } else if (previous) {
            targets.forEach(decrementElementTextCount);
        }
    }

    function handleTextNode(node) {
        evaluateTextNode(node);
    }

    function handleCharacterData(node) {
        evaluateTextNode(node);
    }

    function processChildNodes(root) {
        const nodes = root.childNodes || [];
        for (let i = 0; i < nodes.length; i += 1) {
            processNode(nodes[i]);
        }
    }

    function processNode(node) {
        if (!node || !state.enabled) return;

        if (node.nodeType === Node.TEXT_NODE) {
            handleTextNode(node);
            return;
        }

        if (node instanceof ShadowRoot) {
            applyToShadow(node);
            processChildNodes(node);
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;

            if (element.shadowRoot) {
                applyToShadow(element.shadowRoot);
            }

            if (element.hasAttribute && element.hasAttribute("lang")) {
                handleLangAttribute(element);
            }

            if (isTextualInput(element)) {
                updateElementFont(element);
            }

            if (element.childNodes && element.childNodes.length) {
                processChildNodes(element);
            }
        }
    }

    function observeShadow(root) {
        if (state.shadowObservers.has(root)) return;
        const observer = new MutationObserver(handleMutations);
        observer.observe(root, OBSERVER_CONFIG);
        state.shadowObservers.set(root, observer);
    }

    function releaseShadow(root) {
        if (!root) return;

        if (supportsConstructableSheets) {
            const sheet = state.shadowSheets.get(root);
            if (sheet) {
                root.adoptedStyleSheets = (root.adoptedStyleSheets || []).filter(item => item !== sheet);
            }
            state.shadowSheets.delete(root);
        } else {
            const style = state.shadowStyles.get(root);
            if (style) {
                style.remove();
            }
            state.shadowStyles.delete(root);
        }

        const observer = state.shadowObservers.get(root);
        if (observer) {
            observer.disconnect();
            state.shadowObservers.delete(root);
        }

        state.appliedShadows.delete(root);
    }

    function cleanupShadowRoots() {
        const roots = Array.from(state.appliedShadows);
        roots.forEach(root => {
            const host = root.host;
            if (!host || !host.isConnected) {
                releaseShadow(root);
            }
        });
    }

    function applyToShadow(root) {
        if (!root || state.appliedShadows.has(root)) return;

        if (supportsConstructableSheets) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(STYLE_CSS);
            root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), sheet];
            state.shadowSheets.set(root, sheet);
        } else {
            const style = createStyleElement();
            root.appendChild(style);
            state.shadowStyles.set(root, style);
        }

        state.appliedShadows.add(root);
        observeShadow(root);
        processChildNodes(root);
    }

    function cleanupRemoved(node) {
        if (!node) return;

        if (node instanceof ShadowRoot) {
            releaseShadow(node);
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const parent = state.textNodeParents.get(node);
            if (parent && state.textNodeStatus.get(node)) {
                const parents = Array.isArray(parent) ? parent : [parent];
                parents.forEach(decrementElementTextCount);
            }
            state.textNodeStatus.delete(node);
            state.textNodeParents.delete(node);
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            if (state.trackedElements.has(element)) {
                removeFontFromElement(element);
            }
            if (state.elementTextCounts.has(element)) {
                state.elementTextCounts.delete(element);
            }

            const children = element.childNodes || [];
            for (let i = 0; i < children.length; i += 1) {
                cleanupRemoved(children[i]);
            }
        }
    }

    function handleMutations(mutations) {
        if (!state.enabled) return;

        for (const mutation of mutations) {
            if (mutation.type === "childList") {
                mutation.addedNodes.forEach(node => {
                    processNode(node);
                });

                mutation.removedNodes.forEach(node => {
                    cleanupRemoved(node);
                });
            } else if (mutation.type === "characterData") {
                handleCharacterData(mutation.target);
            } else if (mutation.type === "attributes" && mutation.attributeName === "lang") {
                handleLangAttribute(mutation.target);
            }
        }

        cleanupShadowRoots();
    }

    function attachInputListener() {
        if (state.inputListener) return;

        const handler = event => {
            if (!state.enabled) return;
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            resolveFontTargets(target).forEach(updateElementFont);
        };

        document.addEventListener("input", handler, true);
        document.addEventListener("change", handler, true);
        state.inputListener = handler;
    }

    function detachInputListener() {
        if (!state.inputListener) return;
        document.removeEventListener("input", state.inputListener, true);
        document.removeEventListener("change", state.inputListener, true);
        state.inputListener = null;
    }

    function resetTextTracking() {
        state.textNodeStatus = new WeakMap();
        state.textNodeParents = new WeakMap();
        state.elementTextCounts = new WeakMap();
    }

    function startObserver() {
        if (state.observer || !state.enabled) return;
        state.observer = new MutationObserver(handleMutations);
        state.observer.observe(document.documentElement, OBSERVER_CONFIG);
    }

    function stopObserver() {
        if (!state.observer) return;
        state.observer.disconnect();
        state.observer = null;
    }

    function restoreTrackedElements() {
        const tracked = Array.from(state.trackedElements);
        tracked.forEach(element => {
            removeFontFromElement(element);
        });
        state.trackedElements.clear();
    }

    function enable() {
        if (state.enabled) return;
        state.enabled = true;
        applyToDocument();
        attachInputListener();
        processNode(document.documentElement);
        startObserver();
    }

    function disable() {
        if (!state.enabled) return;
        state.enabled = false;
        detachInputListener();
        stopObserver();
        restoreTrackedElements();
        state.originalInlineFonts.clear();
        resetTextTracking();
        removeFromShadows();
        removeFromDocument();
    }

    function removeFromShadows() {
        const roots = Array.from(state.appliedShadows);
        roots.forEach(root => releaseShadow(root));
        state.appliedShadows.clear();
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

    if (typeof window !== "undefined" && typeof window.__FONT_INJECT_TEST__ === "function") {
        window.__FONT_INJECT_TEST__({
            applyFontToElement,
            removeFontFromElement,
            updateElementFont,
            evaluateTextNode,
            cleanupRemoved
        });
    }
})();
