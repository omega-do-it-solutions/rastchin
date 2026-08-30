(function () {
    // v7.2.28 — outer try/catch so any future issue here never breaks
    // VS Code Markdown Preview rendering.
    try {
    // PERSIAN: broad match used for hasPersian() unit-level check (any Persian/Arabic char).
    const PERSIAN = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
    // PERSIAN_LETTER: tighter match for neighbor classification — letters + Persian/Arabic digits
    // only; excludes Arabic punctuation (،  ؛  ؟ etc.) and combining marks so tokens like
    // "40px،" or "48→" do not falsely classify as prose-fa.
    const PERSIAN_LETTER = /[ء-غف-ي٠-٩ٱ-ۓ۰-۹ﭐ-﷿ﹰ-﻿]/;

    const ARROWS = ['→','←','⟶','⟵','⇒','⇐','➜','➔','➤','➞'];
    const ARROW_RE = new RegExp('(' + ARROWS.join('|') + ')', 'g');
    const ARROW_CHARS_RE = new RegExp('[' + ARROWS.join('') + ']', 'g');
    const CODE_SEL = 'pre, code, kbd, samp, textarea, input';
    const UNIT_SEL = 'p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6';
    const MAX_ATTEMPTS = 10;
    let FLIP_ATTEMPTS = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    setInterval(() => { if (FLIP_ATTEMPTS) FLIP_ATTEMPTS = new WeakMap(); }, 30000);

    function hasPersian(el) { return PERSIAN.test(el.textContent || ''); }
    function _isProtected(el) { return !!(el && el.closest && el.closest(CODE_SEL)); }
    function _stripArrows(t) { return (t || '').replace(ARROW_CHARS_RE, ''); }
    function _closestUnit(node, root) {
        const p = node && node.parentElement;
        return (p && p.closest && p.closest(UNIT_SEL)) || root;
    }
    function _hasPersianProse(unit) {
        if (!unit) return false;
        const wk = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                const p = n.parentElement;
                if (!p || _isProtected(p)) return NodeFilter.FILTER_REJECT;
                if (p.classList && p.classList.contains('bidi-arrow-mirror')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        let n;
        while ((n = wk.nextNode())) { if (PERSIAN.test(_stripArrows(n.nodeValue))) return true; }
        return false;
    }
    function _collectParts(unit) {
        const parts = [];
        function walk(node) {
            if (!node) return;
            if (node.nodeType === 1) {
                if (node.classList && node.classList.contains('bidi-arrow-mirror')) return;
                if (node.matches && node.matches(CODE_SEL)) {
                    if (/\S/.test(node.textContent || '')) parts.push({ kind: 'code', node, text: node.textContent || '' });
                    return;
                }
                for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
            } else if (node.nodeType === 3) {
                parts.push({ kind: 'text', node, text: node.nodeValue || '' });
            }
        }
        walk(unit);
        return parts;
    }
    function _hasContent(text) { return /\S/.test(_stripArrows(text)); }
    // Return the nearest non-whitespace token adjacent to an arrow boundary.
    // leftSlice=true: text is the slice LEFT of the arrow; we want its rightmost token.
    // leftSlice=false: text is the slice RIGHT of the arrow; we want its leftmost token.
    function _immediateToken(text, leftSlice) {
        const stripped = _stripArrows(text);
        if (leftSlice) {
            const m = stripped.match(/(\S+)\s*$/);
            return m ? m[1] : '';
        } else {
            const m = stripped.match(/^\s*(\S+)/);
            return m ? m[1] : '';
        }
    }
    function _classifyToken(token) {
        if (!token) return null;
        return PERSIAN_LETTER.test(token) ? 'prose-fa' : 'prose-latin';
    }
    function _nearestNeighbor(parts, pi, offset, dir) {
        const part = parts[pi];
        if (!part) return null;
        if (dir < 0) {
            const k = _classifyToken(_immediateToken(part.text.slice(0, offset), true));
            if (k) return { kind: k };
            for (let i = pi - 1; i >= 0; i--) {
                if (parts[i].kind === 'code') return { kind: 'code' };
                const k2 = _classifyToken(_immediateToken(parts[i].text, true));
                if (k2) return { kind: k2 };
            }
        } else {
            const k = _classifyToken(_immediateToken(part.text.slice(offset + 1), false));
            if (k) return { kind: k };
            for (let i = pi + 1; i < parts.length; i++) {
                if (parts[i].kind === 'code') return { kind: 'code' };
                const k2 = _classifyToken(_immediateToken(parts[i].text, false));
                if (k2) return { kind: k2 };
            }
        }
        return null;
    }
    function _shouldFlip(node, offset, root) {
        const unit = _closestUnit(node, root);
        if (!_hasPersianProse(unit)) return false;
        const parts = _collectParts(unit);
        const pi = parts.findIndex(p => p.node === node);
        if (pi === -1) return false;
        const left = _nearestNeighbor(parts, pi, offset, -1);
        const right = _nearestNeighbor(parts, pi, offset, 1);
        // Flip iff at least one immediate neighbor is Persian-script prose.
        return (left && left.kind === 'prose-fa') || (right && right.kind === 'prose-fa');
    }

    function wrapArrows(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                ARROW_RE.lastIndex = 0;
                if (!ARROW_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                ARROW_RE.lastIndex = 0;
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (p.classList && p.classList.contains('bidi-arrow-mirror')) return NodeFilter.FILTER_REJECT;
                if (_isProtected(p)) return NodeFilter.FILTER_REJECT;
                if (FLIP_ATTEMPTS && (FLIP_ATTEMPTS.get(p) || 0) >= MAX_ATTEMPTS) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const candidates = [];
        let n;
        while ((n = walker.nextNode())) candidates.push(n);
        for (const node of candidates) {
            const text = node.nodeValue, parent = node.parentElement;
            const frag = document.createDocumentFragment();
            let changed = false, last = 0;
            ARROW_RE.lastIndex = 0;
            let m;
            while ((m = ARROW_RE.exec(text))) {
                if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                if (_shouldFlip(node, m.index, root)) {
                    const span = document.createElement('span');
                    span.className = 'bidi-arrow-mirror';
                    span.textContent = m[1];
                    frag.appendChild(span);
                    changed = true;
                } else {
                    frag.appendChild(document.createTextNode(m[1]));
                }
                last = m.index + m[1].length;
            }
            if (!changed) continue;
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            if (FLIP_ATTEMPTS && parent) FLIP_ATTEMPTS.set(parent, (FLIP_ATTEMPTS.get(parent) || 0) + 1);
            if (node.parentNode) node.parentNode.replaceChild(frag, node);
        }
    }

    function applyRtl() {
        // Paragraphs, headings, blockquotes — font always when Persian present;
        // direction decided by the browser bidi algorithm from the first strong
        // character (`dir="auto"`). Pure-Persian elements resolve to RTL; Latin-
        // starting mixed elements (e.g. "Codex rounds: 24 → 32 (همه تأیید)")
        // stay LTR so the word order isn't inverted.
        document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote').forEach(el => {
            if (el.closest('pre')) return;
            const persian = hasPersian(el);
            el.classList.toggle('fa-text', persian);
            if (persian) { el.setAttribute('dir', 'auto'); } else { el.removeAttribute('dir'); }
            el.classList.remove('fa-rtl');
            if (persian) wrapArrows(el);
        });

        // List items: per-li direction (mixed lists work correctly)
        document.querySelectorAll('ul, ol').forEach(list => {
            if (list.closest('pre')) return;
            const persian = hasPersian(list);
            list.classList.toggle('fa-rtl', persian);
            list.querySelectorAll('li').forEach(li => {
                const liPersian = hasPersian(li);
                li.classList.toggle('fa-rtl', liPersian);
                if (liPersian) wrapArrows(li);
            });
        });

        // Tables: column order always source order. Per-cell direction.
        document.querySelectorAll('table').forEach(table => {
            table.setAttribute('dir', 'ltr');
            table.querySelectorAll('th, td').forEach(cell => {
                const persian = hasPersian(cell);
                cell.classList.toggle('fa-rtl', persian);
                cell.setAttribute('dir', persian ? 'rtl' : 'ltr');
                if (persian) wrapArrows(cell);
            });
        });
    }

    applyRtl();

    new MutationObserver(applyRtl).observe(document.body, { childList: true, subtree: true });
    } catch (e) { try { console.error('[persian-rtl markdown-preview]', e); } catch(_){} }
}());
