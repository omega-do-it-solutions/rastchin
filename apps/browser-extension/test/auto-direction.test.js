'use strict';
// Regression suite for auto-direction.js direction-detection logic.
// Run: `node test/auto-direction.test.js` (or `pnpm test`). Exits non-zero on failure.
// Covers: contenteditable RTL/LTR/empty handling, !important application, Gemini skip.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- minimal DOM mock for auto-direction.js ---

class StyleMap {
    constructor() { this._props = new Map(); }
    setProperty(name, value, priority) {
        this._props.set(name, { value, priority: priority || '' });
    }
    removeProperty(name) { this._props.delete(name); }
    getProperty(name) { return this._props.get(name) || null; }
    get direction() { return (this._props.get('direction') || {}).value || ''; }
    get textAlign() { return (this._props.get('text-align') || {}).value || ''; }
    set direction(v) { this._props.set('direction', { value: v, priority: '' }); }
    set textAlign(v) { this._props.set('text-align', { value: v, priority: '' }); }
    getPriority(name) { return (this._props.get(name) || {}).priority || ''; }
}

class MockElement {
    constructor(tag, opts = {}) {
        this.tagName = String(tag).toUpperCase();
        this.nodeType = 1;
        this._attrs = new Map();
        this._children = [];
        this._text = opts.text || '';
        this.value = opts.value ?? opts.text ?? '';
        this.type = opts.type || '';
        this.isContentEditable = !!opts.contenteditable;
        if (opts.contenteditable) this._attrs.set('contenteditable', 'true');
        if (opts.role) this._attrs.set('role', opts.role);
        this.style = new StyleMap();
        this._geminiSkip = !!opts.geminiSkip;
        this._claudeSkip = !!opts.claudeSkip;
        this._chatgptSkip = !!opts.chatgptSkip;
        this.className = opts.className || '';
        this.parentElement = opts.parent || null;
        this.shadowRoot = opts.shadowRoot || null;
    }
    getAttribute(name) { return this._attrs.get(name) ?? null; }
    setAttribute(name, value) { this._attrs.set(name, value); }
    removeAttribute(name) { this._attrs.delete(name); }
    get dir() { return this._attrs.get('dir') || ''; }
    set dir(v) { this._attrs.set('dir', v); }
    matches(selector) {
        if (!selector) return false;
        if (selector.startsWith('.')) {
            return this.className.split(/\s+/).includes(selector.slice(1));
        }
        // Support [contenteditable]:not([contenteditable="false"])
        if (selector.includes('[contenteditable]')) {
            const ce = this._attrs.get('contenteditable');
            return ce != null && ce !== 'false';
        }
        if (selector.includes('[role="textbox"]')) {
            return this._attrs.get('role') === 'textbox';
        }
        const attrEquals = selector.match(/^\[([\w-]+)=["']?([^"'\]]+)["']?\]$/);
        if (attrEquals) return this._attrs.get(attrEquals[1]) === attrEquals[2];
        return false;
    }
    closest(selector) {
        // Simplified: check if this element or ancestors match any of the selector parts
        const parts = String(selector).split(',').map(s => s.trim());
        let node = this;
        while (node) {
            for (const part of parts) {
                if (node.matches?.(part)) return node;
                if (part.startsWith('[data-test-id=') || part.startsWith('[data-test-id =')) {
                    const m = part.match(/\[data-test-id=["']?([^"'\]]+)["']?\]/);
                    if (m && node._attrs && node._attrs.get('data-test-id') === m[1]) return node;
                }
                if (node._geminiSkip && (part.includes('gem-sidenav') || part.includes('mat-nav-list'))) return node;
                if (node._geminiSkip && part.includes('conversations-list')) return node;
                if (node._claudeSkip && part.includes('font-claude-message')) return node;
                if (node._claudeSkip && part.includes('font-claude-response')) return node;
                if (node._claudeSkip && part.includes('data-test-render-count')) return node;
                if (node._chatgptSkip && part.includes('data-message-author-role')) return node;
                if (node._chatgptSkip && part.includes('conversation-turn')) return node;
            }
            node = node.parentElement;
        }
        return null;
    }
    addEventListener() {}
    removeEventListener() {}
    append(...children) {
        children.forEach(child => {
            child.parentElement = this;
            this._children.push(child);
        });
        return this;
    }
    querySelectorAll(selector) {
        return queryDescendants(this, selector);
    }
}

class MockShadowRoot {
    constructor() {
        this._children = [];
    }
    append(...children) {
        this._children.push(...children);
        return this;
    }
    querySelectorAll(selector) {
        return queryDescendants(this, selector);
    }
}

function queryDescendants(root, selector) {
    const out = [];
    function visit(node) {
        for (const child of (node._children || [])) {
            if (selector === '*' || child.matches?.(selector)) {
                out.push(child);
            }
            visit(child);
        }
    }
    visit(root);
    return out;
}

// Text node walker for contenteditable
function makeTreeWalker(root) {
    const texts = [];
    function collect(node) {
        if (node._text) texts.push({ textContent: node._text });
        for (const child of (node._children || [])) collect(child);
    }
    collect(root);
    let idx = -1;
    return { nextNode() { idx++; return texts[idx] || null; } };
}

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'core', 'auto-direction.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function loadAutoDir(hostname) {
    let exports_ = null;
    const ctx = {
        window: {
            location: { hostname: hostname || 'claude.ai' },
            addEventListener() {},
            chatbotConfig: undefined,
            __AUTO_DIR_TEST__(fns) { exports_ = fns; }
        },
        document: {
            documentElement: new MockElement('html'),
            body: new MockElement('body'),
            addEventListener() {},
            removeEventListener() {},
            querySelectorAll() { return []; },
            createTreeWalker(root) { return makeTreeWalker(root); }
        },
        MutationObserver: class { observe() {} disconnect() {} },
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
        NodeFilter: { SHOW_TEXT: 4 },
        HTMLElement: MockElement,
        HTMLInputElement: class extends MockElement { constructor(o) { super('input', o); } },
        HTMLTextAreaElement: class extends MockElement { constructor(o) { super('textarea', o); } },
        Document: class {},
        DocumentFragment: class {},
        ShadowRoot: MockShadowRoot,
        console
    };
    // window must equal the outer object for `window.__AUTO_DIR_TEST__` to work
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    if (exports_) {
        exports_.HTMLInputElement = ctx.HTMLInputElement;
        exports_.HTMLTextAreaElement = ctx.HTMLTextAreaElement;
    }
    return exports_;
}

// --- test runner ---
let failures = 0;
let total = 0;
function check(label, got, expected) {
    total++;
    const ok = got === expected;
    if (!ok) {
        failures++;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

// Load once for claude.ai tests
const fn = loadAutoDir('claude.ai');

if (!fn) {
    console.error('FATAL: __AUTO_DIR_TEST__ hook not called — check auto-direction.js export');
    process.exit(1);
}

// 1. empty contenteditable → dir="auto"
{
    const el = new MockElement('div', { contenteditable: true, text: '' });
    fn.updateDirection(el);
    check('empty contenteditable → dir="auto"', el.getAttribute('dir'), 'auto');
    check('empty contenteditable → direction removed', el.style.direction, '');
    check('empty contenteditable → textAlign removed', el.style.textAlign, '');
}

// 2. Persian text → dir="rtl" + direction:rtl!important
{
    const el = new MockElement('div', { contenteditable: true, text: 'سلام دنیا' });
    fn.updateDirection(el);
    check('Persian → dir="rtl"', el.getAttribute('dir'), 'rtl');
    check('Persian → direction !important', el.style.getPriority('direction'), 'important');
    check('Persian → direction value', el.style.direction, 'rtl');
    check('Persian → textAlign !important', el.style.getPriority('text-align'), 'important');
}

// 3. LTR English text → dir="ltr" + styles removed
{
    const el = new MockElement('div', { contenteditable: true, text: 'Hello world' });
    fn.updateDirection(el);
    check('LTR → dir="ltr"', el.getAttribute('dir'), 'ltr');
    check('LTR → direction removed', el.style.direction, '');
    check('LTR → textAlign removed', el.style.textAlign, '');
}

// 3b. Textarea with Persian text gets explicit RTL, not only native dir=auto
{
    const textarea = new fn.HTMLTextAreaElement({ value: 'سلام در textarea' });
    fn.updateDirection(textarea);
    check('Persian textarea → dir="rtl"', textarea.getAttribute('dir'), 'rtl');
    check('Persian textarea → direction !important', textarea.style.getPriority('direction'), 'important');
}

// 3c. Empty textarea stays native auto
{
    const textarea = new fn.HTMLTextAreaElement({ value: '' });
    fn.updateDirection(textarea);
    check('empty textarea → dir="auto"', textarea.getAttribute('dir'), 'auto');
    check('empty textarea → direction removed', textarea.style.direction, '');
}

// 3d. ARIA textbox without contenteditable still gets explicit RTL
{
    const textbox = new MockElement('div', { role: 'textbox', text: 'سلام در role textbox' });
    fn.updateDirection(textbox);
    check('role=textbox Persian → dir="rtl"', textbox.getAttribute('dir'), 'rtl');
    check('role=textbox Persian → direction !important', textbox.style.getPriority('direction'), 'important');
}

// 3e. child event targets resolve to closest role=textbox editor
{
    const textbox = new MockElement('div', { role: 'textbox', text: 'سلام' });
    const child = new MockElement('span', { parent: textbox });
    textbox.append(child);
    check('child inside role=textbox → editable target', fn.resolveEditableTarget(child), textbox);
}

// 4. URL-only text → dir="ltr" (first strong char is ASCII)
{
    const el = new MockElement('div', { contenteditable: true, text: 'https://example.com/path' });
    fn.updateDirection(el);
    check('URL-only → dir="ltr"', el.getAttribute('dir'), 'ltr');
}

// 5. Email-like text → dir="ltr"
{
    const el = new MockElement('div', { contenteditable: true, text: 'user@example.com' });
    fn.updateDirection(el);
    check('email-like → dir="ltr"', el.getAttribute('dir'), 'ltr');
}

// 6. Code-like text → dir="ltr"
{
    const el = new MockElement('div', { contenteditable: true, text: 'const x = 5;' });
    fn.updateDirection(el);
    check('code-like → dir="ltr"', el.getAttribute('dir'), 'ltr');
}

// 7. Previously dir="rtl", then cleared → dir="auto" (not stuck in rtl)
{
    const el = new MockElement('div', { contenteditable: true, text: 'سلام' });
    fn.updateDirection(el);
    check('setup: Persian → rtl', el.getAttribute('dir'), 'rtl');
    el._text = '';
    fn.updateDirection(el);
    check('cleared → dir="auto" (not stuck in rtl)', el.getAttribute('dir'), 'auto');
}

// 8. shouldSkipElement: element with gemini skip marker on gemini.google.com
{
    const fnGemini = loadAutoDir('gemini.google.com');
    const geminiParent = new MockElement('div', { geminiSkip: true });
    const child = new MockElement('div', { contenteditable: true, text: 'سلام' });
    child.parentElement = geminiParent;
    const skipped = fnGemini.shouldSkipElement(child);
    check('Gemini UI element → shouldSkipElement=true', skipped, true);

    const fnClaude = loadAutoDir('claude.ai');
    const normalEl = new MockElement('div', { contenteditable: true, text: 'سلام' });
    check('non-Gemini element → shouldSkipElement=false', fnClaude.shouldSkipElement(normalEl), false);
}

// 8b. Claude response subtree is skipped, but the composer (outside it) is not
{
    const fnClaude = loadAutoDir('claude.ai');

    const responseContainer = new MockElement('div', { claudeSkip: true });
    const responseEditable = new MockElement('div', { contenteditable: true, text: 'سلام', parent: responseContainer });
    check('Claude response editable → shouldSkipElement=true', fnClaude.shouldSkipElement(responseEditable), true);

    const articleContainer = new MockElement('div', { role: 'article' });
    const articleEditable = new MockElement('div', { contenteditable: true, text: 'سلام', parent: articleContainer });
    check('Claude role=article fallback editable → shouldSkipElement=true', fnClaude.shouldSkipElement(articleEditable), true);

    const composer = new MockElement('div', { contenteditable: true, text: 'سلام' });
    check('Claude composer editable → shouldSkipElement=false', fnClaude.shouldSkipElement(composer), false);

    // claude.ai renamed the assistant wrapper; pin the new class in the skip list.
    check('Claude skip list covers renamed .font-claude-response wrapper',
        /CLAUDE_RESPONSE_SKIP[\s\S]{0,200}font-claude-response/.test(source), true);

    // Scanning a response container must not attach/track its editables.
    fnClaude.scanEditableNodes(responseContainer);
    check('Claude response editable → not given a direction', responseEditable.getAttribute('dir'), null);
    fnClaude.scanEditableNodes(articleContainer);
    check('Claude role=article editable → not given a direction', articleEditable.getAttribute('dir'), null);
}

// 8c. ChatGPT response turns are skipped, but the composer (outside them) is not
{
    const fnGpt = loadAutoDir('chatgpt.com');

    const turn = new MockElement('div', { chatgptSkip: true });
    const turnEditable = new MockElement('div', { contenteditable: true, text: 'سلام' });
    turn.append(turnEditable);
    check('ChatGPT response editable → response subtree still skipped', fnGpt.shouldSkipElement(turnEditable), true);
    check('ChatGPT response editable → editable itself is allowed', fnGpt.shouldSkipEditable(turnEditable), false);

    const composer = new MockElement('div', { contenteditable: true, text: 'سلام' });
    check('ChatGPT composer editable → shouldSkipElement=false', fnGpt.shouldSkipElement(composer), false);

    fnGpt.scanEditableNodes(turn);
    check('ChatGPT inline edit bubble → gets rtl direction', turnEditable.getAttribute('dir'), 'rtl');

    // chat.openai.com host is treated the same way.
    const fnLegacy = loadAutoDir('chat.openai.com');
    const legacyTurn = new MockElement('div', { chatgptSkip: true });
    const legacyEditable = new MockElement('div', { contenteditable: true, text: 'سلام' });
    legacyTurn.append(legacyEditable);
    check('chat.openai.com response editable → response subtree still skipped', fnLegacy.shouldSkipElement(legacyEditable), true);
    check('chat.openai.com response editable → editable itself is allowed', fnLegacy.shouldSkipEditable(legacyEditable), false);
}

// 8d. Linear's multi-block ProseMirror editor is handled paragraph-by-paragraph
// by the Linear adapter, while ordinary text inputs keep auto-direction.
{
    const fnLinear = loadAutoDir('linear.app');
    const editor = new MockElement('div', {
        className: 'ProseMirror',
        contenteditable: true,
        text: 'متن فارسی\nEnglish paragraph'
    });
    check('Linear ProseMirror → shouldSkipEditable=true', fnLinear.shouldSkipEditable(editor), true);
    check('Linear ProseMirror → shouldSkipElement=true', fnLinear.shouldSkipElement(editor), true);
    fnLinear.scanEditableNodes(editor);
    check('Linear ProseMirror → root direction remains adapter-owned', editor.getAttribute('dir'), null);

    const titleInput = new fnLinear.HTMLInputElement({ value: 'عنوان فارسی' });
    check('Linear title input → shouldSkipEditable=false', fnLinear.shouldSkipEditable(titleInput), false);
    fnLinear.updateDirection(titleInput);
    check('Linear title input → receives RTL', titleInput.getAttribute('dir'), 'rtl');
}

// 9. scanEditableNodes enters existing open shadow roots on initial scan
{
    const host = new MockElement('div');
    const shadowRoot = new MockShadowRoot();
    const editable = new MockElement('div', { contenteditable: true, text: 'سلام از شادو' });
    shadowRoot.append(editable);
    host.shadowRoot = shadowRoot;

    fn.scanEditableNodes(host);
    check('existing shadow-root editable → dir="rtl"', editable.getAttribute('dir'), 'rtl');
    check('existing shadow-root editable → direction !important', editable.style.getPriority('direction'), 'important');
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
