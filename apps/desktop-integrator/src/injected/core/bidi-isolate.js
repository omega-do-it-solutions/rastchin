// scripts/bidi-isolate.js
'use strict';

// Reusable mixed-BiDi inline-isolation layer, shared across every platform
// recipe (isolated-world global `RastChinBidi`, same pattern as RTLEngine /
// RastChinRecipe).
//
// WHY THIS EXISTS
// The engine sets a base direction (dir=rtl) plus unicode-bidi:plaintext|isolate
// on block elements (p, li, td, ...). That fixes the *block's* base direction and
// isolates it from its siblings, but the Unicode Bidirectional Algorithm still
// reorders the runs *inside* a single block. So a Persian line that contains a
// Latin run plus neutral punctuation — `اتصال به POS / کاسه`, `Kaffeehaus (کافه‌هاوس)`,
// `باشگاه مشتریان / CRM`, `DSGVO / GDPR کامپلاینس` — renders with the slash,
// parentheses or the Latin token jumping to a confusing position. There is no
// pure-CSS fix for inner-run reordering: the UBA needs an *isolate boundary*
// around each opposite-direction run. This layer adds that boundary by wrapping
// each Latin/LTR run in `<bdi dir="ltr">` (Unicode bidirectional isolate), which
// is exactly what the algorithm wants and keeps the Latin run's internal order
// while letting the browser do correct bracket/neutral matching for the rest.
//
// SAFETY
// Wrapping restructures text nodes, which is risky inside framework-managed
// (React/Vue/Angular) subtrees that are actively re-rendering — replacing a live
// text node out from under the framework can make its reconciler throw later.
// This module is therefore (a) idempotent — re-running never nests or duplicates
// wrappers — and (b) reversible via clearIsolation(). The *when* (skip the
// actively-streaming turn, only touch settled content) is the integration layer's
// job (RTLEngine.isolateInline); this module stays pure/synchronous and never
// throws to the host page.
var RastChinBidi = (() => {
    'use strict';

    // Marks the <bdi> wrappers this module creates, so re-processing the same
    // subtree is a no-op (idempotency) and clearIsolation() can find and undo
    // exactly the nodes we added — never a <bdi> the page authored itself.
    const MARK_ATTR = 'data-rastchin-bidi';
    const WRAP_TAG = 'bdi';

    // Strong RTL scripts. Mirrors auto-direction's IS_RTL; Arabic covers Persian.
    const RTL_STRONG = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
    const LETTER = /\p{L}/u;

    // Elements whose text must never be restructured: code/preformatted content,
    // non-rendered/replaced subtrees, form controls, interactive chrome, and BiDi
    // controls (incl. our own wrappers — guarantees idempotency without a second
    // pass). Tag names are compared case-insensitively via tagNameOf(): real
    // SVG/MathML elements report their tagName in LOWERCASE (foreign namespace),
    // so an uppercase-only Set lookup silently misses them in a browser.
    const PROTECTED_TAGS = new Set([
        'PRE', 'CODE', 'KBD', 'SAMP', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'MATH',
        'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BDI', 'BDO', 'BUTTON'
    ]);

    const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

    // ARIA roles that mark interactive/decorative UI chrome (toolbars, action
    // bars, icon spans). Their text is glyphs/labels owned by the host app's
    // framework — wrapping it breaks icon fonts and races React commits (the
    // Claude action-icon regression), and it never needs BiDi correction.
    // Deliberately CONSERVATIVE: this set ships to every platform, so generic
    // grouping roles (group, tablist, menu, radiogroup, …) that legitimately
    // wrap real prose on some sites stay OUT of core — a recipe that needs them
    // fenced opts in via excludeSelectors (see claude-rtl.js UI guards).
    const UI_CHROME_ROLES = new Set([
        'button', 'toolbar', 'menubar', 'img', 'switch', 'slider', 'progressbar'
    ]);

    function tagNameOf(node) {
        return node && typeof node.tagName === 'string' ? node.tagName.toUpperCase() : '';
    }

    // SVG/MathML (and any other non-HTML namespace) subtrees: an HTML <bdi>
    // inserted there is non-rendering foreign content, so the original glyph or
    // label would simply disappear.
    function isForeignContent(node) {
        const ns = node && node.namespaceURI;
        return typeof ns === 'string' && ns.length > 0 && ns !== HTML_NAMESPACE;
    }

    function hasUiChromeRole(node) {
        if (!node || typeof node.getAttribute !== 'function') return false;
        const role = node.getAttribute('role');
        if (!role) return false;
        // The role attribute is a space-separated token list; the first
        // recognized token wins, so match any token rather than the raw string.
        return String(role).trim().toLowerCase().split(/\s+/)
            .some(token => UI_CHROME_ROLES.has(token));
    }

    function isAriaHiddenNode(node) {
        return Boolean(node && typeof node.getAttribute === 'function' &&
            node.getAttribute('aria-hidden') === 'true');
    }

    // The STABLE protections — ones an app never toggles at runtime. Used for
    // both the node itself and (via hasProtectedAncestor) its ancestry.
    // aria-hidden is intentionally NOT here: Radix-style dialogs flip
    // aria-hidden="true" on the whole backgrounded app, and treating that as an
    // ancestor protection would silently skip isolation for every message while
    // any modal is open — with no rescan when it closes (the engine's observer
    // does not watch aria-hidden). aria-hidden stays a node-SELF check only.
    function isStructurallyProtected(node) {
        if (PROTECTED_TAGS.has(tagNameOf(node))) return true;
        if (isForeignContent(node)) return true;
        if (hasUiChromeRole(node)) return true;
        if (isWrapper(node)) return true;
        if (isContentEditable(node)) return true;
        return false;
    }

    // Inner block boundaries. isolateElement() processes one block's *inline*
    // content and stops at nested blocks, because those blocks get their own
    // isolateElement() call from the engine walk. This keeps each call cheap and
    // avoids re-walking a whole message subtree on every mutation.
    const BLOCK_BOUNDARY = new Set([
        'P', 'DIV', 'LI', 'UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR',
        'TD', 'TH', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER',
        'FOOTER', 'NAV', 'MAIN', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD',
        'FORM', 'FIELDSET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR'
    ]);

    // Chars that END an LTR run's trailing token-tail and stay in the RTL
    // container: whitespace, brackets/quotes (so the browser's UBA bracket-pair
    // matching keeps `Kaffeehaus (کافه‌هاوس)` correct), and zero-width / bidi
    // format controls (so a Persian ZWNJ suffix like `SaaS‌های` binds to the
    // Persian side, not the Latin run). Everything else neutral — ASCII digits,
    // `. / : ? = & % # @ ~ + -` etc. — is a token-continuation char and stays
    // with the run, so `https://ex.com/p?q=1`, `mently.com` and `v1.2.3` wrap whole.
    const TRAIL_STOP = /[\s()\[\]{}«»<>"'`،؛؟\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u;
    const OPEN_TO_CLOSE = new Map([
        ['(', ')'],
        ['[', ']'],
        ['{', '}'],
        ['<', '>'],
        ['«', '»']
    ]);
    const CLOSE_TO_OPEN = new Map(Array.from(OPEN_TO_CLOSE, ([open, close]) => [close, open]));
    const SYMMETRIC_QUOTES = new Set(['"']);

    // Combining marks (\p{M}) are NOT strong — they inherit direction from their
    // base letter — so they are classified neutral, not letter-like. A Latin
    // diacritic is then absorbed into its run as an interior/trailing neutral
    // (café, naïve), while an Arabic harakat — which is Script=Inherited, NOT
    // Script=Arabic, so RTL_STRONG does not match it — no longer becomes a
    // spurious 1-char LTR run that would split a base+mark cluster in vocalized
    // Persian/Arabic text (e.g. بِسْمِ اللَّهِ).
    function classifyChar(ch) {
        if (RTL_STRONG.test(ch)) return 'R';
        if (LETTER.test(ch)) return 'L';
        return 'N';
    }

    // Walk a string by code point (not UTF-16 unit), tagging each with its
    // directional class and its code-unit offset/length so run boundaries map
    // back to valid splitText/slice positions for astral chars.
    function scanChars(text) {
        const chars = [];
        let cu = 0;
        for (const ch of text) {
            chars.push({ ch, cuStart: cu, cuLen: ch.length, cls: classifyChar(ch) });
            cu += ch.length;
        }
        return chars;
    }

    function extendBalancedTail(chars, firstL, lastL) {
        const stack = [];
        const quoteOpen = new Set();
        for (let k = firstL; k <= lastL; k += 1) {
            const ch = chars[k].ch;
            if (OPEN_TO_CLOSE.has(ch)) {
                stack.push(ch);
            } else if (CLOSE_TO_OPEN.has(ch)) {
                if (stack[stack.length - 1] === CLOSE_TO_OPEN.get(ch)) {
                    stack.pop();
                }
            } else if (SYMMETRIC_QUOTES.has(ch)) {
                if (quoteOpen.has(ch)) quoteOpen.delete(ch);
                else quoteOpen.add(ch);
            }
        }

        let endIdx = lastL;
        while (endIdx + 1 < chars.length) {
            const next = chars[endIdx + 1].ch;
            const open = stack[stack.length - 1];
            if (open && OPEN_TO_CLOSE.get(open) === next) {
                stack.pop();
                endIdx += 1;
                continue;
            }
            if (quoteOpen.has(next)) {
                quoteOpen.delete(next);
                endIdx += 1;
                continue;
            }
            break;
        }
        return endIdx;
    }

    // Find the LTR runs to wrap. A run spans from its first LTR letter through its
    // last LTR letter, INCLUDING interior neutrals/digits (so `DSGVO / GDPR` and
    // `mently.com` stay one ordered unit), then extends across a trailing tail of
    // token-continuation neutrals (digits, `. / : ? = & …`) so a whole URL/email/
    // version wraps as one unit. It stops the tail at whitespace, brackets/quotes,
    // ZWNJ/bidi controls, or an RTL char (TRAIL_STOP) — leaving the `/` in `… / CRM`,
    // the `(` in `Kaffeehaus (…)`, a `۱.` list marker, and a `SaaS‌های` suffix in the
    // RTL container, where the browser orders neutrals and matches brackets correctly.
    // Returns [{ start, end }] as code-unit offsets into `text`.
    function findLtrRuns(text) {
        if (!text) return [];
        const chars = scanChars(text);
        const runs = [];
        let i = 0;
        while (i < chars.length) {
            if (chars[i].cls !== 'L') { i += 1; continue; }
            const firstL = i;
            let lastL = i;
            let j = i;
            while (j < chars.length && chars[j].cls !== 'R') {
                if (chars[j].cls === 'L') lastL = j;
                j += 1;
            }
            let endIdx = extendBalancedTail(chars, firstL, lastL);
            while (
                endIdx + 1 < chars.length &&
                chars[endIdx + 1].cls === 'N' &&
                !TRAIL_STOP.test(chars[endIdx + 1].ch)
            ) {
                endIdx += 1;
            }
            runs.push({
                start: chars[firstL].cuStart,
                end: chars[endIdx].cuStart + chars[endIdx].cuLen
            });
            i = endIdx + 1;
        }
        return runs;
    }

    function isWrapper(node) {
        return Boolean(
            node &&
            node.nodeType === 1 &&
            typeof node.getAttribute === 'function' &&
            tagNameOf(node) === WRAP_TAG.toUpperCase() &&
            node.getAttribute('dir') === 'ltr' &&
            node.getAttribute(MARK_ATTR) === 'ltr'
        );
    }

    function isContentEditable(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.isContentEditable === true) return true;
        if (typeof node.getAttribute === 'function') {
            const attr = node.getAttribute('contenteditable');
            if (attr === '' || attr === 'true' || attr === 'plaintext-only') return true;
        }
        return false;
    }

    function isProtectedElement(node, protectedSelector) {
        if (!node || node.nodeType !== 1) return true;
        if (isStructurallyProtected(node)) return true;
        if (isAriaHiddenNode(node)) return true;
        if (protectedSelector && typeof node.closest === 'function') {
            try {
                if (node.closest(protectedSelector)) return true;
            } catch (_) {
                // A malformed selector must never break isolation.
            }
        }
        return false;
    }

    function parentElementOf(node) {
        if (!node) return null;
        return node.parentElement ||
            (node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null);
    }

    // The built-in protections above only see the node itself (plus the caller's
    // protectedSelector via closest). When isolateElement is invoked on a block
    // that LIVES INSIDE protected chrome — e.g. a <p> nested in a custom button —
    // the root check alone misses it. Only STABLE protections participate (see
    // isStructurallyProtected on aria-hidden). Real ancestor chains are ~10-20
    // deep, so the walk is cheap; the hop cap only guards pathological trees and
    // fails CLOSED — when in doubt, do not restructure text.
    function hasProtectedAncestor(node) {
        let current = parentElementOf(node);
        let hops = 0;
        while (current && current.nodeType === 1) {
            if (hops >= 64) return true;
            if (isStructurallyProtected(current)) return true;
            current = parentElementOf(current);
            hops += 1;
        }
        return false;
    }

    // Collect the text nodes that belong to THIS block's inline content: descend
    // through inline elements, stop at nested blocks and protected subtrees.
    function collectInlineTextNodes(root, protectedSelector, out) {
        const kids = root.childNodes;
        if (!kids) return;
        for (let k = 0; k < kids.length; k += 1) {
            const child = kids[k];
            if (!child) continue;
            if (child.nodeType === 3) {
                if (child.textContent) out.push(child);
            } else if (child.nodeType === 1) {
                if (BLOCK_BOUNDARY.has(tagNameOf(child))) continue;
                if (isProtectedElement(child, protectedSelector)) continue;
                collectInlineTextNodes(child, protectedSelector, out);
            }
        }
    }

    function ownerDocumentOf(node) {
        return node.ownerDocument || (typeof document !== 'undefined' ? document : null);
    }

    // A DOM error that means the live tree changed under us (a framework detached
    // `node` between collection and the swap) — expected and recoverable. Anything
    // else thrown from the swap is a real defect we must not silently treat as a race.
    function isRacyDomError(err) {
        const name = err && err.name;
        return name === 'NotFoundError' || name === 'HierarchyRequestError' || name === 'NoModificationAllowedError';
    }

    function buildInlineTextStream(textNodes) {
        const items = [];
        let text = '';
        for (const node of textNodes) {
            const value = node.textContent || '';
            const start = text.length;
            text += value;
            items.push({ node, start, end: text.length });
        }
        return { text, items };
    }

    function rangesForTextNode(item, runs) {
        const ranges = [];
        for (const run of runs) {
            if (run.end <= item.start) continue;
            if (run.start >= item.end) break;
            const start = Math.max(run.start, item.start) - item.start;
            const end = Math.min(run.end, item.end) - item.start;
            if (start < end) ranges.push({ start, end });
        }
        return ranges;
    }

    // Replace one mixed text node with [text?, <bdi>run</bdi>, text?, ...]. A run
    // covering the whole node still yields a single wrapper. The replacement is
    // built on a DETACHED fragment first (pure work — a throw there is a real bug
    // and is allowed to propagate); only the live-tree swap is guarded, and only
    // against the framework-race error class. Returns true if it changed the DOM,
    // false if the swap raced (recoverable; the observer re-tries later).
    function wrapTextNodeRanges(node, ranges) {
        const text = node.textContent;
        if (!text) return false;
        const parent = node.parentNode || node.parentElement;
        if (!parent) return false;
        if (!ranges.length) return false;
        const doc = ownerDocumentOf(node);
        if (!doc) return false;

        const frag = doc.createDocumentFragment();
        let cursor = 0;
        for (const range of ranges) {
            if (range.start > cursor) {
                frag.appendChild(doc.createTextNode(text.slice(cursor, range.start)));
            }
            const bdi = doc.createElement(WRAP_TAG);
            bdi.setAttribute('dir', 'ltr');
            bdi.setAttribute(MARK_ATTR, 'ltr');
            bdi.appendChild(doc.createTextNode(text.slice(range.start, range.end)));
            frag.appendChild(bdi);
            cursor = range.end;
        }
        if (cursor < text.length) {
            frag.appendChild(doc.createTextNode(text.slice(cursor)));
        }
        try {
            parent.replaceChild(frag, node);
        } catch (err) {
            if (isRacyDomError(err)) return false;
            throw err;
        }
        return true;
    }

    // Public: isolate every Latin/LTR run inside `el`'s inline content. Idempotent
    // (already-wrapped runs are skipped) and never throws to the host page. Returns
    // the number of text nodes it rewrote.
    function isolateElement(el, opts) {
        if (!el || el.nodeType !== 1) return 0;
        const options = opts || {};
        const protectedSelector = options.protectedSelector || '';
        if (isProtectedElement(el, protectedSelector)) return 0;
        if (hasProtectedAncestor(el)) return 0;

        const textNodes = [];
        collectInlineTextNodes(el, protectedSelector, textNodes);
        const stream = buildInlineTextStream(textNodes);
        const runs = findLtrRuns(stream.text);
        if (!runs.length) return 0;
        let changed = 0;
        for (const item of stream.items) {
            const ranges = rangesForTextNode(item, runs);
            if (!ranges.length) continue;
            try {
                if (wrapTextNodeRanges(item.node, ranges)) changed += 1;
            } catch (err) {
                // Page-safety boundary: never throw to the host page. The text-node
                // swap already returns false for the expected framework-race; a throw
                // reaching here is an UNEXPECTED defect, so surface it once (instead
                // of an invisible, observer-driven retry loop) without crashing.
                warnUnexpected(err);
            }
        }
        return changed;
    }

    let warnedUnexpected = false;
    function warnUnexpected(err) {
        if (warnedUnexpected) return;
        warnedUnexpected = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[RastChinBidi] unexpected isolation failure', err);
        }
    }

    // Collect our wrappers under `root` (inclusive) via a manual walk, so we never
    // depend on a compound-selector engine and never touch page-authored <bdi>.
    function collectWrappers(root, out) {
        if (!root) return;
        if (isWrapper(root)) out.push(root);
        const kids = root.childNodes;
        if (!kids) return;
        for (let k = 0; k < kids.length; k += 1) {
            const child = kids[k];
            if (child && child.nodeType === 1) collectWrappers(child, out);
        }
    }

    // Public: undo isolation under `root`, restoring the original text. Used when a
    // platform is disabled. Idempotent and safe to call on un-isolated subtrees.
    function clearIsolation(root) {
        if (!root || root.nodeType !== 1) return 0;
        const wrappers = [];
        collectWrappers(root, wrappers);
        let removed = 0;
        for (const wrapper of wrappers) {
            const parent = wrapper.parentNode || wrapper.parentElement;
            if (!parent) continue;
            try {
                while (wrapper.firstChild) {
                    parent.insertBefore(wrapper.firstChild, wrapper);
                }
                parent.removeChild(wrapper);
                if (typeof parent.normalize === 'function') parent.normalize();
                removed += 1;
            } catch (_) {
                // Same rationale as isolateElement: never throw to the page.
            }
        }
        return removed;
    }

    return {
        MARK_ATTR,
        classifyChar,
        findLtrRuns,
        isWrapper,
        isProtectedElement,
        isolateElement,
        clearIsolation
    };
})();

// Browser-side debug/test hook, mirroring the platform recipes' __*_TEST__ globals.
// Node tests read the `RastChinBidi` var straight out of the vm sandbox instead.
if (typeof window !== 'undefined' && typeof window.__BIDI_TEST__ === 'function') {
    window.__BIDI_TEST__(RastChinBidi);
}
