'use strict';
// Dev-only test harness: loads the REAL src/core/rtl-engine.js into a sandbox
// with a minimal DOM mock so the engine's pure logic (needsRTL, stripLtrTokens,
// hasRtlLetter, collectDirectionText) can be exercised under Node without a
// browser. Only DOM primitives are mocked; the engine source is unmodified.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- minimal DOM mock ---
// Matches one simple selector part against a node: a TAG ("code"), a CLASS
// (".hljs"), a substring attribute ('[class*="language-"]', '[style*="x" i]'),
// or an exact attribute ('[role="code"]'). Attribute values resolve through
// getAttribute first (the real-DOM semantics), then fall back to the same-named
// JS property for legacy fixtures built with opts.role etc.
function attrValueOf(node, name) {
    if (name === 'class') return node.className || '';
    if (typeof node.getAttribute === 'function') {
        const value = node.getAttribute(name);
        if (value !== null && value !== undefined) return String(value);
    }
    const prop = node[name];
    return prop === undefined || prop === null ? '' : String(prop);
}

function matchesPart(node, part) {
    if (node.nodeType !== 1) return false;
    if (part === '*') return true;
    let m;
    if ((m = part.match(/^\[([\w-]+)\*=["']?([^"'\]]+)["']?(\s+i)?\]$/))) {
        const value = attrValueOf(node, m[1]);
        return m[3]
            ? value.toLowerCase().includes(m[2].toLowerCase())
            : value.includes(m[2]);
    }
    if ((m = part.match(/^\[([\w-]+)=["']?([^"'\]]+)["']?\]$/))) {
        return attrValueOf(node, m[1]) === m[2];
    }
    if (part.startsWith('.')) return (node.className || '').split(/\s+/).includes(part.slice(1));
    return node.tagName === part.toUpperCase();
}

// --- compound + combinator selector support (additive, backward-compatible) ---
// matchesPart above stays the single-token LEAF matcher ('*', tag, .class, [attr],
// [attr*=val], [attr=val]). The helpers below let El.matches/closest/querySelectorAll
// understand the real selectors the production recipes ship: #id, tag#id / tag.class
// compounds, and descendant (' ') / child ('>') combinators (e.g.
// 'yt-lockup-metadata-view-model h3 .…__title', '#description-inline-expander #snippet',
// 'ytd-text-inline-expander > #content'). A comma-list is split into selector-strings;
// each string into combinator-separated STEPS; each step into compound SUB-TOKENS,
// every sub-token funnelled back through matchesPart.
//
// BACKWARD-COMPAT (load-bearing): for any selector with no whitespace and no '>'
// (every single-part selector the other suites pass — 'code', '.hljs',
// '[class*="code"]', '[style*="anthropicons" i]', …) matchesSelector -> matchesCompound
// -> splitCompound yields exactly one part and returns the IDENTICAL single
// matchesPart(node, part) call as before. So single-part behavior is unchanged.
// NOT supported: :is()/:not()/sibling(~,+)/pseudo-classes — no project selector uses
// them today; a future one would silently mis-match in tests (note for maintainers).
function splitCompound(compound) {
    const out = [];
    const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|(\[[^\]]+\])/g;
    let m;
    while ((m = re.exec(compound)) !== null) {
        if (m[1]) out.push(m[1]);                   // tag
        else if (m[2]) out.push(`[id="${m[2]}"]`);  // #id -> exact-attr form matchesPart supports
        else if (m[3]) out.push(`.${m[3]}`);        // .class
        else if (m[4]) out.push(m[4]);              // [attr...] verbatim
    }
    return out;
}
function matchesCompound(node, compound) {
    if (!node || node.nodeType !== 1) return false;
    const trimmed = String(compound).trim();
    if (trimmed === '*') return true; // universal selector — splitCompound drops it, so handle here
    const parts = splitCompound(trimmed);
    if (!parts.length) return false;
    return parts.every(part => matchesPart(node, part));
}
function parseSteps(selector) {
    // -> [{ compound, combinator }] where combinator is the relation to the step on its LEFT.
    const steps = [];
    let pendingChild = false;
    for (const tok of String(selector).trim().split(/\s+/)) {
        if (tok === '>') { pendingChild = true; continue; }
        steps.push({ compound: tok, combinator: pendingChild ? 'child' : 'descendant' });
        pendingChild = false;
    }
    return steps;
}
function matchesComplex(node, selector) {
    const steps = parseSteps(selector);
    if (!steps.length) return false;
    if (!matchesCompound(node, steps[steps.length - 1].compound)) return false; // rightmost = the node itself
    let current = node.parentElement;
    for (let i = steps.length - 2; i >= 0; i -= 1) {
        const combinator = steps[i + 1].combinator; // combinator lives on the RIGHT step
        const target = steps[i].compound;
        if (combinator === 'child') {
            if (!current || !matchesCompound(current, target)) return false;
            current = current.parentElement;
        } else { // descendant: any ancestor matching target
            let walk = current, found = null;
            while (walk) { if (matchesCompound(walk, target)) { found = walk; break; } walk = walk.parentElement; }
            if (!found) return false;
            current = found.parentElement;
        }
    }
    return true;
}
function matchesSelector(node, selector) {
    return String(selector).split(',').map(s => s.trim()).filter(Boolean)
        .some(sel => (/[\s>]/.test(sel) ? matchesComplex(node, sel) : matchesCompound(node, sel)));
}

class ClassList {
    constructor(node) {
        this.node = node;
        this.values = new Set();
    }
    add(value) {
        this.values.add(value);
        this.sync();
    }
    remove(value) {
        this.values.delete(value);
        this.sync();
    }
    contains(value) {
        return this.values.has(value);
    }
    sync() {
        this.node.className = Array.from(this.values).join(' ');
    }
}

class El {
    constructor(tag, opts = {}) {
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this.className = opts.cls || '';
        this.classList = new ClassList(this);
        this.className.split(/\s+/).filter(Boolean).forEach(className => this.classList.add(className));
        this.role = opts.role || '';
        this.hidden = !!opts.hidden;
        this.isConnected = opts.isConnected !== false;
        this.style = opts.style || {};
        this.__computedStyle = opts.computedStyle || this.style;
        this.__attrs = opts.attrs || {};
        if (opts.ariaHidden !== undefined) this.__attrs['aria-hidden'] = String(opts.ariaHidden);
        this.__code = !!opts.code;
        this.childNodes = [];
        this.parentElement = null;
    }
    append(...kids) {
        for (const k of kids) {
            k.parentElement = this;
            this.childNodes.push(k);
        }
        return this;
    }
    // Climbs ancestors like the real Element.closest, now via matchesSelector so a
    // compound / descendant / child selector (e.g. 'input#search',
    // 'ytd-searchbox input[type="text"]') resolves correctly, not just single parts.
    closest(selector) {
        let node = this;
        while (node) {
            if (matchesSelector(node, selector)) return node;
            node = node.parentElement;
        }
        return null;
    }
    matches(selector) {
        return matchesSelector(this, selector);
    }
    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.__attrs, name) ? this.__attrs[name] : null;
    }
    setAttribute(name, value) {
        this.__attrs[name] = String(value);
    }
    removeAttribute(name) {
        delete this.__attrs[name];
    }
    hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.__attrs, name) || (name === 'hidden' && this.hidden);
    }
    querySelectorAll(selector) {
        const out = [];
        const visit = node => {
            if (!node || !node.childNodes) return;
            for (const child of node.childNodes) {
                if (child.nodeType === 1) {
                    if (matchesSelector(child, selector)) out.push(child);
                    visit(child);
                }
            }
        };
        visit(this);
        out.forEach = Array.prototype.forEach.bind(out);
        return out;
    }
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
    // --- child-mutation primitives (exercised by bidi-isolate.test.js) ---
    get parentNode() {
        return this.parentElement;
    }
    get firstChild() {
        return this.childNodes[0] || null;
    }
    get ownerDocument() {
        return this.__ownerDocument || null;
    }
    appendChild(node) {
        const incoming = expandNode(node);
        incoming.forEach(detach);
        incoming.forEach(child => {
            child.parentElement = this;
            this.childNodes.push(child);
        });
        return node;
    }
    insertBefore(newNode, refNode) {
        const incoming = expandNode(newNode);
        incoming.forEach(detach);
        const idx = refNode ? this.childNodes.indexOf(refNode) : -1;
        const at = idx < 0 ? this.childNodes.length : idx;
        incoming.forEach(child => { child.parentElement = this; });
        this.childNodes.splice(at, 0, ...incoming);
        return newNode;
    }
    replaceChild(newNode, oldNode) {
        const incoming = expandNode(newNode);
        incoming.forEach(detach);
        const idx = this.childNodes.indexOf(oldNode);
        if (idx < 0) throw new Error('replaceChild: node is not a child');
        incoming.forEach(child => { child.parentElement = this; });
        this.childNodes.splice(idx, 1, ...incoming);
        oldNode.parentElement = null;
        return oldNode;
    }
    removeChild(node) {
        const idx = this.childNodes.indexOf(node);
        if (idx < 0) throw new Error('removeChild: node is not a child');
        this.childNodes.splice(idx, 1);
        node.parentElement = null;
        return node;
    }
    normalize() {
        const merged = [];
        let lastText = null;
        for (const node of this.childNodes) {
            if (node.nodeType === 3) {
                if (!node.textContent) continue;
                if (lastText) {
                    lastText.textContent += node.textContent;
                    node.parentElement = null;
                } else {
                    lastText = node;
                    merged.push(node);
                }
            } else {
                lastText = null;
                merged.push(node);
            }
        }
        this.childNodes = merged;
    }
}

// A DocumentFragment is a transient container: appendChild/insertBefore/
// replaceChild splice in ITS children, not the fragment node itself.
class Frag {
    constructor() {
        this.nodeType = 11;
        this.childNodes = [];
    }
    appendChild(node) {
        for (const child of expandNode(node)) {
            child.parentElement = null;
            this.childNodes.push(child);
        }
        return node;
    }
}

function expandNode(node) {
    if (node && node.nodeType === 11) {
        const kids = node.childNodes.slice();
        node.childNodes.length = 0;
        kids.forEach(kid => { kid.parentElement = null; });
        return kids;
    }
    return [node];
}

// Real DOM insertion moves a node out of its current parent first; mirror that so
// `while (node.firstChild) parent.insertBefore(node.firstChild, node)` terminates.
function detach(child) {
    const parent = child && child.parentElement;
    if (parent && Array.isArray(parent.childNodes)) {
        const idx = parent.childNodes.indexOf(child);
        if (idx >= 0) parent.childNodes.splice(idx, 1);
    }
    if (child) child.parentElement = null;
}

class Txt {
    constructor(text) {
        this.nodeType = 3;
        this.textContent = text;
        this.parentElement = null;
        this.__ownerDocument = null;
    }
    get parentNode() {
        return this.parentElement;
    }
    get ownerDocument() {
        return this.__ownerDocument || null;
    }
}

const el = (tag, opts, ...kids) => {
    const node = new El(tag, opts);
    node.append(...kids);
    return node;
};
const t = text => new Txt(text);

// A minimal document factory so a sandboxed module can create real harness nodes
// via document.createElement / createTextNode / createDocumentFragment. Created
// nodes carry __ownerDocument so the module's ownerDocument fallback resolves.
function makeDocument() {
    const doc = {
        createElement(tag) {
            const node = new El(tag);
            node.__ownerDocument = doc;
            return node;
        },
        createTextNode(text) {
            const node = new Txt(text);
            node.__ownerDocument = doc;
            return node;
        },
        createDocumentFragment() {
            return new Frag();
        }
    };
    return doc;
}

// --- load the real engine into a sandbox ---
const ENGINE_PATH = path.join(__dirname, '..', 'src', 'core', 'rtl-engine.js');
const source = fs.readFileSync(ENGINE_PATH, 'utf8');

function buildContext() {
    const ctx = {
        requestAnimationFrame: () => 0,
        setTimeout,
        clearTimeout,
        document: { body: null, documentElement: null },
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
        Element: El,
        getComputedStyle: node => node.__computedStyle || {},
        console
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return ctx;
}

const sandbox = buildContext();

function makeEngine(config) {
    return new sandbox.RTLEngine(config || {});
}

// A second sandbox that loads BOTH bidi-isolate.js and rtl-engine.js, plus a
// document factory so the engine's inline-isolation chokepoint can actually
// create <bdi> wrappers. Used by the Part 2 integration test.
const BIDI_PATH = path.join(__dirname, '..', 'src', 'core', 'bidi-isolate.js');
const bidiSource = fs.readFileSync(BIDI_PATH, 'utf8');

const isolatingDocument = makeDocument();
isolatingDocument.body = null;
isolatingDocument.documentElement = null;
const isolatingMutationObservers = [];

function buildIsolatingContext() {
    const ctx = {
        requestAnimationFrame: () => 0,
        setTimeout,
        clearTimeout,
        document: isolatingDocument,
        MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
                this.target = null;
                this.options = null;
                this.disconnected = false;
                isolatingMutationObservers.push(this);
            }
            observe(target, options) {
                this.target = target;
                this.options = options || {};
            }
            disconnect() {
                this.disconnected = true;
            }
            trigger(records) {
                if (this.disconnected) return;
                this.callback(Array.isArray(records) ? records : [records]);
            }
        },
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
        Element: El,
        getComputedStyle: node => node.__computedStyle || {},
        console
    };
    vm.createContext(ctx);
    vm.runInContext(bidiSource, ctx);
    vm.runInContext(source, ctx);
    return ctx;
}

const isolatingSandbox = buildIsolatingContext();

function makeIsolatingEngine(config) {
    return new isolatingSandbox.RTLEngine(config || {});
}

module.exports = {
    makeEngine,
    makeIsolatingEngine,
    El, Txt, Frag, el, t,
    makeDocument,
    isolatingDocument,
    isolatingMutationObservers,
    RastChinBidi: isolatingSandbox.RastChinBidi
};
