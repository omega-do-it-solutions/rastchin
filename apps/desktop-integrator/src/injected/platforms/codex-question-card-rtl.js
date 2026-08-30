// Dedicated adapter for Codex request_user_input / approval cards.
//
// Codex Desktop and the VS Code Codex webview expose the same semantic hooks for
// these cards. Keeping this pass separate from the generic desktop fallback is
// intentional: the fallback excludes buttons and other interactive controls,
// while a question card needs its radio/checkbox row direction corrected without
// changing unrelated application chrome.
(() => {
    'use strict';

    const RTL_RE = /\p{Script=Arabic}/u;
    const LATIN_RE = /[A-Za-z]/;
    const CARD_SELECTOR = '[data-codex-approval-surface], [data-codex-composer-request-navigation]';
    const GROUP_SELECTOR = '[role="radiogroup"]';
    const OPTION_SELECTOR = '[role="radio"], [role="checkbox"]';
    const TEXT_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, div, span, label, strong, em, small';
    const PROTECTED_SELECTOR = [
        'pre', 'code', 'kbd', 'samp',
        'input', 'textarea', '[contenteditable="true"]', '[role="textbox"]',
        'svg', '[role="img"]'
    ].join(', ');
    const OUTSIDE_INTERACTIVE_SELECTOR = [
        'button', '[role="button"]', '[role="option"]',
        '[role="menuitem"]', '[role="menuitemradio"]', '[role="menuitemcheckbox"]'
    ].join(', ');
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const UI_FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
    const RTL_CLASS = 'rastchin-codex-question-rtl';
    const OPTION_CLASS = 'rastchin-codex-question-option-rtl';
    const LTR_CLASS = 'rastchin-codex-question-ltr';
    const STYLE_ATTRIBUTE = 'data-rastchin-codex-question-style';
    const tracked = new Map();
    const pending = new Set();
    let observer = null;
    let style = null;
    let frame = null;
    let enabled = false;

    function isElement(node) {
        return Boolean(node && node.nodeType === 1);
    }

    function hasRtl(text) {
        return RTL_RE.test(String(text || ''));
    }

    function isProtected(element) {
        return Boolean(element?.matches?.(PROTECTED_SELECTOR)
            || element?.closest?.(PROTECTED_SELECTOR));
    }

    function textOutsideProtected(element) {
        const chunks = [];
        function walk(node) {
            if (!node) return;
            if (node.nodeType === 3) {
                chunks.push(node.nodeValue || '');
                return;
            }
            if (!isElement(node)) return;
            if (node !== element && node.matches(PROTECTED_SELECTOR)) return;
            for (const child of node.childNodes) walk(child);
        }
        walk(element);
        return chunks.join(' ');
    }

    function directText(element) {
        const chunks = [];
        for (const node of element.childNodes || []) {
            if (node.nodeType === 3) chunks.push(node.nodeValue || '');
        }
        return chunks.join(' ');
    }

    function remember(element) {
        if (tracked.has(element)) return;
        tracked.set(element, {
            hadDir: element.hasAttribute('dir'),
            dir: element.getAttribute('dir'),
            rtl: element.classList.contains(RTL_CLASS),
            option: element.classList.contains(OPTION_CLASS),
            ltr: element.classList.contains(LTR_CLASS)
        });
    }

    function setRole(element, role) {
        if (!isElement(element)) return;
        remember(element);
        element.classList.remove(RTL_CLASS, OPTION_CLASS, LTR_CLASS);
        if (role === 'rtl') {
            element.classList.add(RTL_CLASS);
            element.setAttribute('dir', 'rtl');
        } else if (role === 'option') {
            element.classList.add(OPTION_CLASS);
            element.setAttribute('dir', 'rtl');
        } else if (role === 'ltr') {
            element.classList.add(LTR_CLASS);
            element.setAttribute('dir', 'ltr');
        }
    }

    function restore(element) {
        const original = tracked.get(element);
        if (!original) return;
        element.classList.toggle(RTL_CLASS, original.rtl);
        element.classList.toggle(OPTION_CLASS, original.option);
        element.classList.toggle(LTR_CLASS, original.ltr);
        if (original.hadDir) element.setAttribute('dir', original.dir || '');
        else element.removeAttribute('dir');
        tracked.delete(element);
    }

    function shouldStyleText(element) {
        if (!isElement(element) || isProtected(element)) return false;
        if (element.closest(OPTION_SELECTOR)) return false;
        if (element.closest(OUTSIDE_INTERACTIVE_SELECTOR)) return false;
        // Never direct an outer wrapper that also owns the choices. Only the
        // title/description block itself should change direction.
        if (element.querySelector(GROUP_SELECTOR) || element.querySelector(OPTION_SELECTOR)) return false;
        const own = directText(element);
        if (hasRtl(own)) return true;
        const all = textOutsideProtected(element);
        if (!hasRtl(all)) return false;
        // Prefer the innermost textual element. This avoids flipping a whole
        // React layout wrapper when its Persian text lives in a child block.
        return !Array.from(element.children || []).some(child =>
            !isProtected(child) && hasRtl(textOutsideProtected(child))
        );
    }

    function processOption(option) {
        if (!isElement(option)) return;
        const optionText = textOutsideProtected(option);
        if (!hasRtl(optionText)) {
            restore(option);
            option.querySelectorAll(TEXT_SELECTOR).forEach(element => restore(element));
            return;
        }

        // Direction on the option row moves its radio/checkbox indicator to the
        // RTL side. Individual English labels and badges are isolated below.
        setRole(option, 'option');
        option.querySelectorAll(TEXT_SELECTOR).forEach(element => {
            if (isProtected(element)) {
                restore(element);
                return;
            }
            const own = directText(element).trim();
            const all = textOutsideProtected(element).trim();
            const hasDirectionalChild = Array.from(element.children || []).some(child => {
                const childText = textOutsideProtected(child);
                return hasRtl(childText) || LATIN_RE.test(childText);
            });
            const text = own || (!hasDirectionalChild ? all : '');
            if (!text) {
                restore(element);
                return;
            }
            if (hasRtl(text)) setRole(element, 'rtl');
            else if (LATIN_RE.test(text)) setRole(element, 'ltr');
            else restore(element);
        });
    }

    function processCard(card) {
        if (!isElement(card)) return;
        card.querySelectorAll(OPTION_SELECTOR).forEach(processOption);
        card.querySelectorAll(TEXT_SELECTOR).forEach(element => {
            if (element.closest(OPTION_SELECTOR)) return;
            if (shouldStyleText(element)) setRole(element, 'rtl');
            else if (tracked.has(element)) restore(element);
        });
    }

    function isBareOptionPicker(option) {
        if (!option?.matches?.(OPTION_SELECTOR)) return false;
        if (option.closest(CARD_SELECTOR) || option.closest(GROUP_SELECTOR)) return false;
        if ((option.tagName || '').toLowerCase() !== 'button') return false;
        const group = option.parentElement;
        return Boolean(
            group
            && group.classList.contains('flex')
            && group.classList.contains('flex-wrap')
            && group.classList.contains('gap-2')
            && group.parentElement?.tagName?.toLowerCase() === 'form'
            && option.classList.contains('rounded-full')
            && option.classList.contains('border')
            && option.classList.contains('text-sm')
        );
    }

    function collectCards(root) {
        const cards = new Set();
        const element = isElement(root) ? root : root?.parentElement;
        if (!element) return cards;

        if (element.matches(CARD_SELECTOR)) cards.add(element);
        element.querySelectorAll?.(CARD_SELECTOR).forEach(card => cards.add(card));
        const containingCard = element.closest?.(CARD_SELECTOR);
        if (containingCard) cards.add(containingCard);

        const groups = [];
        if (element.matches(GROUP_SELECTOR)) groups.push(element);
        element.querySelectorAll?.(GROUP_SELECTOR).forEach(group => groups.push(group));
        const containingGroup = element.closest?.(GROUP_SELECTOR);
        if (containingGroup) groups.push(containingGroup);
        groups.forEach(group => {
            if (!group.closest(CARD_SELECTOR) && group.parentElement) cards.add(group.parentElement);
        });

        const options = [];
        if (element.matches(OPTION_SELECTOR)) options.push(element);
        element.querySelectorAll?.(OPTION_SELECTOR).forEach(option => options.push(option));
        options.filter(isBareOptionPicker).forEach(option => {
            const form = option.parentElement?.parentElement;
            if (form) cards.add(form);
        });
        return cards;
    }

    function cleanupDetached() {
        for (const element of tracked.keys()) {
            if (!element.isConnected) tracked.delete(element);
        }
    }

    function scan(root) {
        collectCards(root).forEach(processCard);
        cleanupDetached();
    }

    function flush() {
        frame = null;
        const roots = Array.from(pending);
        pending.clear();
        roots.forEach(scan);
    }

    function schedule(root) {
        if (!enabled || !root) return;
        pending.add(root);
        if (frame !== null) return;
        frame = requestAnimationFrame(flush);
    }

    function ensureStyle() {
        if (style?.isConnected) return;
        style = document.createElement('style');
        style.setAttribute(STYLE_ATTRIBUTE, 'true');
        style.textContent = `
            .${RTL_CLASS} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }
            .${OPTION_CLASS} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }
            .${OPTION_CLASS} .${RTL_CLASS} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }
            .${OPTION_CLASS} .${LTR_CLASS} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
                font-family: ${UI_FONT_STACK} !important;
            }
            :is(.${RTL_CLASS}, .${OPTION_CLASS}) :is(a[href], [data-link]) {
                direction: ltr !important;
                unicode-bidi: isolate !important;
            }
            :is(.${RTL_CLASS}, .${OPTION_CLASS}) :is(pre, code, kbd, samp),
            :is(.${RTL_CLASS}, .${OPTION_CLASS}) :is(pre, code, kbd, samp) * {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
                font-family: ${MONO_FONT_STACK} !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function enable() {
        if (enabled) return;
        enabled = true;
        ensureStyle();
        scan(document.documentElement);
        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    schedule(mutation.target);
                    mutation.addedNodes.forEach(schedule);
                } else if (mutation.type === 'characterData') {
                    schedule(mutation.target.parentElement || mutation.target);
                } else if (mutation.type === 'attributes') {
                    schedule(mutation.target);
                }
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                'role',
                'data-codex-approval-surface',
                'data-codex-composer-request-navigation'
            ]
        });
    }

    function disable() {
        if (!enabled) return;
        enabled = false;
        observer?.disconnect();
        observer = null;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        pending.clear();
        Array.from(tracked.keys()).forEach(restore);
        style?.remove();
        style = null;
    }

    enable();
    const handle = { enable, disable, scan };
    window.__RASTCHIN_DESKTOP_REGISTER__?.(handle);

    if (typeof window.__RASTCHIN_CODEX_QUESTION_TEST__ === 'function') {
        window.__RASTCHIN_CODEX_QUESTION_TEST__({
            CARD_SELECTOR,
            GROUP_SELECTOR,
            OPTION_SELECTOR,
            RTL_CLASS,
            OPTION_CLASS,
            LTR_CLASS,
            scan
        });
    }
})();
