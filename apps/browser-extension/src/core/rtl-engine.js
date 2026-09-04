// scripts/rtl-engine.js
'use strict';

const DEFAULT_RTL_REGEX = /\p{Script=Arabic}/u;
// Persian-specific letters. Their presence in real prose is an unambiguous
// Persian-first RTL signal, distinct from generic Arabic-script content.
const PERSIAN_STRONG_REGEX = /[پچژگکی]/u;
// Unicode letter test, used to distinguish RTL letters from RTL punctuation/digits.
const LETTER_REGEX = /\p{L}/u;
// Stage 1: fenced code blocks, stripped from the RAW text (newlines intact)
// BEFORE whitespace collapse so the closer can be line-anchored. A line-start
// run of 3+ backticks or tildes (<=3 indent) opens a block; the closer is a
// line-anchored run of the SAME char whose length is >= the opener (CommonMark:
// group1 = opener run, group2 = fence char, closer = \1\2*). So a mid-line fence
// in a string, a line-start fence of the OTHER delimiter, and a SHORTER run are
// all body, not closers. An unterminated/streaming fence strips to end-of-input
// (trailing code -> LTR).
const FENCE_REGEX = /^[ \t]{0,3}((`|~)\2{2,})[^\n]*(?:[\s\S]*?^[ \t]{0,3}\1\2*[ \t]*$|[\s\S]*)/gm;
// Stage 2: math/code-like structural blocks, stripped before whitespace collapse
// so Persian labels inside formulas do not flip the whole message. Inline math
// is intentionally conservative: it handles common $...$, \( ... \), and
// display $$...$$ / \[ ... \] forms, but avoids crossing a line with single-$.
const MATH_REGEX = /(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\\\r\n])*?[^\s$\\](?<!\\)\$)/gmu;

// Stage 3: table/data-grid-like lines. Markdown pipe tables, ASCII table rows,
// and TSV rows keep their own LTR-ish column geometry; Persian cells should not
// flip the whole message. Comma CSV is intentionally excluded to avoid treating
// ordinary Persian comma-separated prose as a table.
const TABLE_LINE_REGEX = new RegExp([
    String.raw`^[ \t]*[^\r\n|]*\|[^\r\n|]*\|[^\r\n]*$`,
    String.raw`^[ \t]*\+(?:[-=:+]+|\s)+\+[^\r\n]*$`,
    String.raw`^[^\r\n\t]*(?:\t[^\r\n\t]*){2,}$`
].join('|'), 'gmu');

// Stage 4: terminal-like lines, stripped before whitespace collapse so command
// output containing Persian words does not flip the whole message. This is
// intentionally line-start anchored: inline commands inside Persian prose stay
// part of the surrounding sentence and can still make the message RTL.
const TERMINAL_COMMAND_SOURCE = String.raw`(?:apt-get|docker-compose|python3|pip3|npm|pnpm|yarn|bun|npx|node|git|gh|docker|kubectl|helm|terraform|ssh|scp|rsync|curl|wget|brew|apt|pip|python|php|composer|cargo|rustc|java|javac|mvn|gradle|cmake|grep|rg|sed|awk|chmod|chown|cd|ls|pwd|cat|mkdir|rm|cp|mv)`;
const TERMINAL_LINE_REGEX = new RegExp([
    String.raw`^[ \t]*(?:[$%❯➜]\s+.+|#\s+${TERMINAL_COMMAND_SOURCE}(?:\s|$)[^\r\n]*)$`,
    String.raw`^[ \t]*(?:PS\s+)?[A-Za-z]:[\\\/][^>\r\n]*>\s*.+$`,
    String.raw`^[ \t]*[\w.-]+@[\w.-]+(?::[^\s$#\r\n]+)?[$#]\s+.+$`,
    String.raw`^[ \t]*${TERMINAL_COMMAND_SOURCE}(?:\s|$)[^\r\n]*$`,
    String.raw`^[ \t]*(?:(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|Warning|WARN|INFO|DEBUG|Exception|Caused by):[^\r\n]*|Traceback \(most recent call last\):)$`
].join('|'), 'gmu');
function stripStructuralLtrBlocks(text) {
    if (!text) return '';
    return String(text)
        .replace(FENCE_REGEX, ' ')
        .replace(MATH_REGEX, ' ')
        .replace(TABLE_LINE_REGEX, ' ')
        .replace(TERMINAL_LINE_REGEX, ' ');
}

// Stage 5: other LTR-only tokens whose direction must not be flipped, stripped
// from the whitespace-collapsed text so an Arabic-script glyph living only
// inside a URL, email, inline `code`, or path never forces RTL. A URL consumes
// contiguous characters (incl. a Persian path/query segment, so a URL-only RTL
// glyph does not flip; ASCII . : ? are URL-internal) plus single-level balanced
// (...) or [...] groups (e.g. a Wikipedia slug like ...سلام_(ابهام‌زدایی)), and
// ends only at whitespace, brackets, quotes, or , ; ، ؛ ؟ ! — so Persian prose
// survives next to a URL only across one of those boundaries, not a bare ASCII
// . or :. Path tokens cover POSIX, Windows drive, UNC, and file:// forms,
// including Unicode path segments. Bare domains, indented code, raw HTML, and
// LaTeX math are text-level out of scope (handled by the DOM/recipe layer:
// excludeSelectors / config.isCodeLike). An inline code span is an opener run
// of N backticks closed by the same-length run (so ``..`` too).
const URL_TOKEN_SOURCE = String.raw`(?:https?:\/\/|file:\/\/\/?|www\.)(?:[^\s«»<>"'(){}\[\]،؛؟!,;]|\([^\s()]*\)|\[[^\s\[\]]*\])+`;
const EMAIL_TOKEN_SOURCE = String.raw`(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}(?![\p{L}\p{N}.-])`;
const INLINE_CODE_TOKEN_SOURCE = '(`+)[\\s\\S]*?\\1';
const PATH_SEGMENT_SOURCE = String.raw`[^\s\\\/«»<>"'(){}\[\]،؛؟!,;:]+`;
const POSIX_PATH_SOURCE = String.raw`(?:~\/|\.{1,2}\/|\/)(?:${PATH_SEGMENT_SOURCE}\/)*${PATH_SEGMENT_SOURCE}`;
const WINDOWS_PATH_SOURCE = String.raw`(?:[A-Za-z]:[\\\/]|\\\\${PATH_SEGMENT_SOURCE}[\\\/]${PATH_SEGMENT_SOURCE}[\\\/])(?:${PATH_SEGMENT_SOURCE}[\\\/])*${PATH_SEGMENT_SOURCE}`;
const LTR_TOKEN_REGEX = new RegExp([
    URL_TOKEN_SOURCE,
    EMAIL_TOKEN_SOURCE,
    INLINE_CODE_TOKEN_SOURCE,
    WINDOWS_PATH_SOURCE,
    POSIX_PATH_SOURCE
].join('|'), 'gu');
// Block-level tags whose boundaries should separate text when gathering the
// directional text of a message, so prose in distinct blocks is not glued into
// one token (e.g. a URL block followed by a Persian-prose block).
const BLOCK_LEVEL_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL',
    'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2',
    'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
    'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]);
// Product threshold: minimum fraction of letters that must be RTL for
// mixed-script text to be treated as RTL. The 0.40 value is a RastChin
// product threshold, not a browser algorithm.
// Only applies to the non-Persian-strong path in needsRTL.
const RTL_LETTER_THRESHOLD = 0.40;

const DEFAULT_TEXTUAL_SELECTORS = [
    'p',
    'div',
    'span',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol'
];

var RTLEngine = class {
    constructor(config) {
        this.config = config || {};
        this.enabled = true;
        this.pendingNodes = new Set();
        this.rafId = null;
        this.scanMicrotaskQueued = false;
        this.observer = null;
        this.styledElements = new Map();
        this.initialized = false;
        this.observeCharacterData = this.config.observeCharacterData !== false;
        this.scanBeforePaint = this.config.scanBeforePaint === true;
        this.lastMutationAt = new WeakMap();
        this.settleTimers = new WeakMap();

        this.messageSelectors = Array.isArray(this.config.messageSelectors) ? this.config.messageSelectors : [];
        this.excludeSelectors = Array.isArray(this.config.excludeSelectors) ? this.config.excludeSelectors : [];

        this.messageSelector = this.messageSelectors.length ? this.messageSelectors.join(', ') : '';
        this.excludeSelector = this.excludeSelectors.length ? this.excludeSelectors.join(', ') : '';
        this.textSelector = Array.isArray(this.config.textSelectors)
            ? this.config.textSelectors.join(', ')
            : DEFAULT_TEXTUAL_SELECTORS.join(', ');
        const _supplied = this.config.rtlRegex || DEFAULT_RTL_REGEX;
        this.rtlRegex = (_supplied.global || _supplied.sticky)
            ? new RegExp(_supplied.source, _supplied.flags.replace(/[gy]/g, ''))
            : _supplied;
        this.rtlClass = this.config.rtlClass || null;
        this.rtlStyle = {
            direction: 'rtl',
            textAlign: 'right',
            unicodeBidi: 'plaintext',
            ...this.config.rtlStyle
        };
        // Inline BiDi isolation: when on, every element we mark RTL also gets its
        // Latin/LTR runs wrapped in <bdi dir="ltr"> (see src/core/bidi-isolate.js)
        // so neutral punctuation/brackets around those runs stay readable. The
        // module loads as a separate core script; when it is absent (e.g. a unit
        // test that loads only the engine) isolateInline/clear calls are no-ops.
        this.inlineIsolate = this.config.inlineIsolate === true;
        // A recipe may name the selector of its actively-STREAMING turn; elements
        // inside it are left alone until streaming settles (see isolateInline).
        this.streamingSelector = typeof this.config.streamingSelector === 'string'
            ? this.config.streamingSelector
            : '';
        this.inlineSettleDelayMs = Number.isFinite(this.config.inlineSettleDelayMs)
            ? Math.max(0, this.config.inlineSettleDelayMs)
            : 300;
        this.bidi = (typeof RastChinBidi !== 'undefined') ? RastChinBidi : null;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.observe();
        if (this.enabled) {
            this.scheduleScan(document.body || document.documentElement || document);
        }
    }

    observe() {
        if (this.observer) return;
        const target = document.body || document.documentElement;
        if (!target) return;

        this.observer = new MutationObserver(mutations => {
            if (!this.enabled) return;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    this.markMutated(mutation.target);
                    mutation.addedNodes.forEach(node => {
                        this.markMutated(node);
                        this.scheduleScan(node);
                    });
                    if (mutation.removedNodes && mutation.removedNodes.length) {
                        this.cleanupDetached();
                        // A streaming turn swapped wholesale for its settled
                        // render may carry no other observable signal — rescan
                        // the mutation root so the settled content is isolated.
                        this.scheduleScan(mutation.target);
                    }
                } else if (mutation.type === 'characterData' && this.observeCharacterData) {
                    this.markMutated(mutation.target);
                    this.scheduleScan(mutation.target.parentElement || mutation.target);
                } else if (mutation.type === 'attributes') {
                    this.markMutated(mutation.target);
                    this.scheduleScan(mutation.target.parentElement || mutation.target);
                }
            }
        });

        const observerOptions = {
            childList: true,
            subtree: true,
            characterData: this.observeCharacterData
        };
        if (this.streamingSelector) {
            observerOptions.attributes = true;
            observerOptions.attributeFilter = ['class', 'data-is-streaming', 'data-message-status'];
        }
        this.observer.observe(target, observerOptions);
    }

    scheduleScan(node) {
        if (!node) return;
        this.pendingNodes.add(node);
        if (this.scanBeforePaint) {
            if (this.scanMicrotaskQueued) return;
            this.scanMicrotaskQueued = true;
            queueMicrotask(() => {
                this.scanMicrotaskQueued = false;
                this.processQueue();
            });
            return;
        }
        if (this.rafId !== null) return;
        this.rafId = requestAnimationFrame(() => this.processQueue());
    }

    markMutated(node) {
        if (!node || typeof Element === 'undefined') return;
        const now = Date.now();
        let current = node instanceof Element ? node : node.parentElement;
        let hops = 0;
        while (current && current instanceof Element && hops < 8) {
            this.lastMutationAt.set(current, now);
            current = current.parentElement;
            hops += 1;
        }
    }

    recentlyMutated(el) {
        if (!el || this.inlineSettleDelayMs <= 0) return 0;
        const at = this.lastMutationAt.get(el);
        if (!at) return 0;
        const remaining = this.inlineSettleDelayMs - (Date.now() - at);
        return remaining > 0 ? remaining : 0;
    }

    scheduleSettledScan(el, delayMs) {
        if (!el || !(el instanceof Element) || el.isConnected === false) return;
        if (this.settleTimers.has(el)) return;
        const timer = setTimeout(() => {
            this.settleTimers.delete(el);
            if (this.enabled && el.isConnected !== false) this.scheduleScan(el);
        }, Math.max(0, delayMs || this.inlineSettleDelayMs));
        this.settleTimers.set(el, timer);
    }

    processQueue() {
        this.rafId = null;
        if (!this.enabled) {
            this.pendingNodes.clear();
            return;
        }

        const nodes = Array.from(this.pendingNodes);
        this.pendingNodes.clear();

        const candidates = new Set();
        nodes.forEach(node => this.collectCandidates(node, candidates));

        candidates.forEach(el => this.applyToMessage(el));
        this.cleanupDetached();
    }

    collectCandidates(node, bucket) {
        if (!node) return;
        const selector = this.messageSelector;
        const isMessageElement = typeof this.config.isMessageElement === 'function' ? this.config.isMessageElement : null;

        const addIfCandidate = el => {
            if (!el || !(el instanceof Element)) return;
            if ((selector && el.matches(selector)) || (isMessageElement && isMessageElement(el))) {
                bucket.add(el);
            }
        };

        if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (!parent || this.isExcluded(parent)) return;
            addIfCandidate(parent);
            if (selector && parent.closest) {
                const container = parent.closest(selector);
                if (container) bucket.add(container);
            }
            if (isMessageElement) {
                let current = parent;
                while (current && current instanceof Element) {
                    if (this.isExcluded(current)) break;
                    if (isMessageElement(current)) {
                        bucket.add(current);
                        break;
                    }
                    current = current.parentElement;
                }
            }
            return;
        }

        if (node instanceof Element) {
            if (this.isExcluded(node)) return;
            addIfCandidate(node);
            if (selector && node.closest) {
                const container = node.closest(selector);
                if (container) bucket.add(container);
            }
            if (selector && node.querySelectorAll) {
                node.querySelectorAll(selector).forEach(el => bucket.add(el));
            }
            if (isMessageElement && node.querySelectorAll) {
                node.querySelectorAll('*').forEach(el => {
                    if (isMessageElement(el)) {
                        bucket.add(el);
                    }
                });
            }
            return;
        }

        if (node instanceof Document || node instanceof DocumentFragment || node instanceof ShadowRoot) {
            if (selector && node.querySelectorAll) {
                node.querySelectorAll(selector).forEach(el => {
                    if (!this.isExcluded(el)) bucket.add(el);
                });
            }
            if (isMessageElement && node.querySelectorAll) {
                node.querySelectorAll('*').forEach(el => {
                    if (this.isExcluded(el)) return;
                    if (isMessageElement(el)) {
                        bucket.add(el);
                    }
                });
            }
        }
    }

    applyToMessage(el) {
        if (!el || !(el instanceof Element) || !el.isConnected) return;
        if (this.isExcluded(el)) return;

        if (typeof this.config.applyToMessage === 'function') {
            const handled = this.config.applyToMessage(el, this);
            if (handled === true) return;
        }

        const text = this.collectDirectionText(el).trim();
        if (!this.needsRTL(text)) {
            this.restoreSubtree(el);
            return;
        }

        this.applyRTL(el);

        if (!this.textSelector) return;
        el.querySelectorAll(this.textSelector).forEach(child => {
            if (this.isExcluded(child)) return;
            this.applyRTL(child);
        });
    }

    collectDirectionText(root) {
        if (!root || !root.childNodes || typeof Node === 'undefined') {
            return (root && (root.innerText || root.textContent)) || '';
        }
        let out = '';
        const visit = node => {
            if (!node) return;
            if (node.nodeType === Node.TEXT_NODE) {
                out += node.textContent || '';
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (node !== root && (this.isExcluded(node) || this.isDirectionHidden(node))) {
                out += ' ';
                return;
            }
            if (node.tagName === 'BR') {
                out += '\n';
                return;
            }
            const block = BLOCK_LEVEL_TAGS.has(node.tagName);
            if (block) out += '\n';
            const children = node.childNodes;
            for (let i = 0; i < children.length; i += 1) {
                visit(children[i]);
            }
            if (block) out += '\n';
        };
        visit(root);
        return out;
    }

    stripLtrTokens(text) {
        if (!text) return '';
        const strippedBlocks = stripStructuralLtrBlocks(text);
        return strippedBlocks.replace(/\s+/g, ' ').trim().replace(LTR_TOKEN_REGEX, ' ');
    }

    hasRtlLetter(text) {
        const stripped = this.stripLtrTokens(text);
        for (const ch of stripped) {
            if (this.rtlRegex.test(ch) && LETTER_REGEX.test(ch)) return true;
        }
        return false;
    }

    needsRTL(text) {
        if (typeof this.config.needsRTL === 'function') {
            return this.config.needsRTL(text, this);
        }
        if (!text) return false;
        const strippedBlocks = stripStructuralLtrBlocks(text);
        const normalized = strippedBlocks.replace(/\s+/g, ' ').trim();
        if (normalized.length < 3) return false;
        if (!this.rtlRegex.test(normalized)) return false;
        const stripped = normalized.replace(LTR_TOKEN_REGEX, ' ');
        if (PERSIAN_STRONG_REGEX.test(stripped)) return true;
        let rtlLetters = 0, totalLetters = 0;
        for (const ch of stripped) {
            if (!LETTER_REGEX.test(ch)) continue;
            totalLetters++;
            if (this.rtlRegex.test(ch)) rtlLetters++;
        }
        return totalLetters > 0 && (rtlLetters / totalLetters) >= RTL_LETTER_THRESHOLD;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
    }

    isExcluded(node) {
        if (!node || !(node instanceof Element)) return false;
        if (typeof this.config.isCodeLike === 'function' && this.config.isCodeLike(node)) {
            return true;
        }
        if (this.excludeSelector && node.closest) {
            // Recipes feed multi-part selector lists here; one malformed part
            // must degrade to "not excluded", not kill every scan from inside
            // the rAF queue.
            try {
                if (node.closest(this.excludeSelector)) return true;
            } catch (err) {
                if (!this.warnedExcludeSelector) {
                    this.warnedExcludeSelector = true;
                    console.warn?.('RastChin: invalid excludeSelector ignored', err);
                }
            }
        }
        return false;
    }

    isDirectionHidden(node) {
        if (!node || !(node instanceof Element)) return false;
        if (node.hidden === true || (typeof node.hasAttribute === 'function' && node.hasAttribute('hidden'))) {
            return true;
        }
        if (typeof node.getAttribute === 'function' && node.getAttribute('aria-hidden') === 'true') {
            return true;
        }
        const className = typeof node.className === 'string' ? node.className : '';
        if (/(^|\s)(sr-only|visually-hidden|screen-reader-only)(\s|$)/.test(className)) {
            return true;
        }
        if (typeof getComputedStyle === 'function') {
            const style = getComputedStyle(node);
            if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden')) {
                return true;
            }
        }
        return false;
    }

    applyRTL(el) {
        if (!el || !(el instanceof Element)) return;
        this.rememberStyle(el);
        el.setAttribute('dir', 'rtl');
        el.style.direction = this.rtlStyle.direction || 'rtl';
        el.style.textAlign = this.rtlStyle.textAlign || 'right';
        if (this.rtlStyle.unicodeBidi !== undefined) {
            el.style.unicodeBidi = this.rtlStyle.unicodeBidi;
        }
        if (this.rtlClass) {
            el.classList.add(this.rtlClass);
        }
        // Single chokepoint: any recipe that routes an element through applyRTL
        // (the engine's default walk plus the custom walks that call it) gets
        // inline isolation for free. Recipes that set dir themselves call
        // isolateInline() directly instead.
        this.isolateInline(el);
    }

    isInStreamingSubtree(el) {
        if (!this.streamingSelector || !el || !(el instanceof Element)) return false;
        try {
            if (typeof el.closest === 'function' && el.closest(this.streamingSelector)) return true;
            if (typeof el.querySelector === 'function' && el.querySelector(this.streamingSelector)) return true;
        } catch (_) {
            // A malformed streamingSelector must not block isolation.
        }
        return false;
    }

    // Wrap the Latin/LTR runs inside `el` with <bdi dir="ltr"> via RastChinBidi.
    // No-op unless inlineIsolate is on and the module is loaded. Skips excluded
    // (code-guard) subtrees and actively-mutating turns, and never throws to the
    // page — a structural DOM op can race a framework re-render.
    isolateInline(el) {
        if (!this.inlineIsolate || !this.bidi) return;
        if (!el || !(el instanceof Element) || el.isConnected === false) return;
        if (this.isExcluded(el)) return;
        if (this.isInStreamingSubtree(el)) {
            // Bare return on purpose: a self-scheduled settle scan here becomes
            // a ~300ms full-walk polling loop for as long as the turn streams.
            // Settles arrive through the observer instead — attribute flips via
            // attributeFilter, and replaced subtrees via the removedNodes
            // rescan in observe().
            return;
        }
        const settleRemaining = this.recentlyMutated(el);
        if (settleRemaining > 0) {
            this.scheduleSettledScan(el, settleRemaining);
            return;
        }
        try {
            this.bidi.isolateElement(el, { protectedSelector: this.excludeSelector || '' });
        } catch (_) {
            // Defence in depth; isolateElement already swallows per-node failures.
        }
    }

    // Undo inline isolation under `root`. Used by custom-walk recipes when an
    // element flips back to LTR, so no stale <bdi> wrappers are left behind.
    // Streaming- AND settle-gated like isolateInline: regenerate/edit flows
    // can reuse DOM that already has wrappers, and unwrapping is just as
    // structural as wrapping — both wait until the subtree settles.
    clearInline(root) {
        if (!this.inlineIsolate || !this.bidi || !root) return;
        if (root instanceof Element && this.isInStreamingSubtree(root)) {
            this.scheduleSettledScan(root, this.inlineSettleDelayMs);
            return;
        }
        if (root instanceof Element) {
            const settleRemaining = this.recentlyMutated(root);
            if (settleRemaining > 0) {
                this.scheduleSettledScan(root, settleRemaining);
                return;
            }
        }
        try {
            this.bidi.clearIsolation(root);
        } catch (_) {
            // never throw to the page
        }
    }

    restoreElement(el) {
        if (!el || !(el instanceof Element)) return;
        const snapshot = this.styledElements.get(el);
        if (!snapshot) return;
        if (el.isConnected === false) {
            this.styledElements.delete(el);
            return;
        }

        if (snapshot.dirAttr === null) {
            el.removeAttribute('dir');
        } else {
            el.setAttribute('dir', snapshot.dirAttr);
        }

        el.style.direction = snapshot.styleDirection || '';
        el.style.textAlign = snapshot.styleTextAlign || '';
        el.style.unicodeBidi = snapshot.styleUnicodeBidi || '';
        if (this.rtlClass) {
            if (snapshot.hadRtlClass) {
                el.classList.add(this.rtlClass);
            } else {
                el.classList.remove(this.rtlClass);
            }
        }
        this.styledElements.delete(el);
    }

    restoreSubtree(root) {
        if (!root || !(root instanceof Element)) return;
        // Undo inline isolation first so an element that no longer needs RTL is
        // left with its original, un-wrapped text.
        if (this.inlineIsolate && this.bidi) {
            if (this.isInStreamingSubtree(root)) {
                this.scheduleSettledScan(root, this.inlineSettleDelayMs);
            } else {
                try { this.bidi.clearIsolation(root); } catch (_) { /* page-safety: never throw */ }
            }
        }
        this.restoreElement(root);
        if (!root.querySelectorAll) return;
        root.querySelectorAll('*').forEach(el => this.restoreElement(el));
    }

    rememberStyle(el) {
        if (!el || !(el instanceof Element)) return;
        if (this.styledElements.has(el)) return;
        this.styledElements.set(el, {
            dirAttr: el.getAttribute('dir'),
            styleDirection: el.style.direction,
            styleTextAlign: el.style.textAlign,
            styleUnicodeBidi: el.style.unicodeBidi,
            hadRtlClass: this.rtlClass ? el.classList.contains(this.rtlClass) : false
        });
    }

    restoreStyles() {
        Array.from(this.styledElements.keys()).forEach(el => this.restoreElement(el));
        // Disable path: strip every <bdi> wrapper we added across the document so
        // turning the platform off leaves no trace.
        if (this.inlineIsolate && this.bidi && typeof document !== 'undefined') {
            const root = document.body || document.documentElement;
            if (root) {
                try { this.bidi.clearIsolation(root); } catch (_) { /* page-safety: never throw */ }
            }
        }
    }

    cleanupDetached() {
        const garbage = [];
        this.styledElements.forEach((_, el) => {
            if (!el || !el.isConnected) {
                garbage.push(el);
            }
        });
        garbage.forEach(el => this.styledElements.delete(el));
    }
}
