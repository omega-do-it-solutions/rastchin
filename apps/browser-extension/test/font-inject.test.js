'use strict';
// Regression suite for font-inject.js font-family application/restoration.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class StyleMap {
    constructor() {
        this._props = new Map();
    }
    setProperty(name, value, priority) {
        this._props.set(name, { value, priority: priority || '' });
    }
    removeProperty(name) {
        this._props.delete(name);
    }
    getPropertyValue(name) {
        return (this._props.get(name) || {}).value || '';
    }
    getPropertyPriority(name) {
        return (this._props.get(name) || {}).priority || '';
    }
    get fontFamily() {
        return this.getPropertyValue('font-family');
    }
    set fontFamily(value) {
        this.setProperty('font-family', value, '');
    }
}

class MockElement {
    constructor(tag = 'div', opts = 'Inter, sans-serif') {
        const options = typeof opts === 'string' ? { computedFont: opts } : opts;
        this.tagName = tag.toUpperCase();
        this.nodeType = 1;
        this.style = new StyleMap();
        this.isConnected = true;
        this.__computedFont = options.computedFont || 'Inter, sans-serif';
        this.parentElement = options.parentElement || null;
        this._contenteditable = !!options.contenteditable;
        this._role = options.role || null;
        this.className = options.className || '';
        this._attrs = new Map(Object.entries(options.attrs || {}));
        this.textContent = options.textContent || '';
        this.innerText = options.innerText || this.textContent;
    }
    getAttribute(name) {
        if (name === 'role') return this._role;
        return this._attrs.has(name) ? this._attrs.get(name) : null;
    }
    hasAttribute(name) {
        if (name === 'role') return this._role != null;
        return this._attrs.has(name);
    }
    matches(selector) {
        if (selector.includes(',')) {
            return selector.split(',').some(part => this.matches(part.trim()));
        }
        if (selector.includes('[contenteditable]')) return this._contenteditable;
        if (selector.includes('[role="textbox"]')) return this._role === 'textbox';
        if (selector.startsWith('.')) return this.className.split(/\s+/).filter(Boolean).includes(selector.slice(1));
        const attrEquals = selector.match(/^\[([\w-]+)=["']?([^"'\]]+)["']?\]$/);
        if (attrEquals) return this.getAttribute(attrEquals[1]) === attrEquals[2];
        const attrOnly = selector.match(/^\[([\w-]+)\]$/);
        if (attrOnly) return this._attrs.has(attrOnly[1]);
        return this.tagName === selector.toUpperCase();
    }
    closest(selector) {
        let node = this;
        while (node) {
            if (node.matches?.(selector)) return node;
            node = node.parentElement;
        }
        return null;
    }
}

class MockTextNode {
    constructor(text, parentElement) {
        this.nodeType = 3;
        this.textContent = text;
        this.parentElement = parentElement;
    }
}

let exports_;
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'font-inject.js'), 'utf8');
const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        addEventListener() {},
        chatbotConfig: { subscribe() { return () => {}; } },
        __FONT_INJECT_TEST__(fns) { exports_ = fns; }
    },
    document: {},
    HTMLElement: MockElement,
    HTMLInputElement: class extends MockElement {},
    HTMLTextAreaElement: class extends MockElement {},
    CSSStyleSheet: undefined,
    ShadowRoot: class {},
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: el => ({ fontFamily: el.__computedFont }),
    console
};
ctx.window.window = ctx.window;
ctx.window.getComputedStyle = ctx.getComputedStyle;
vm.createContext(ctx);
vm.runInContext(source, ctx);

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (got !== expected) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exports_) {
    console.error('FATAL: __FONT_INJECT_TEST__ hook not called');
    process.exit(1);
}

{
    const el = new MockElement('div', 'Inter, sans-serif');
    exports_.applyFontToElement(el);
    check('font apply: prepends Vazirmatn', el.style.getPropertyValue('font-family').startsWith('"Vazirmatn", Inter'), true);
    check('font apply: uses important priority', el.style.getPropertyPriority('font-family'), 'important');
    exports_.removeFontFromElement(el);
    check('font restore: removes property when no original inline', el.style.getPropertyValue('font-family'), '');
}

{
    const el = new MockElement('div', 'Inter, sans-serif');
    el.style.setProperty('font-family', 'CustomFont', 'important');
    exports_.applyFontToElement(el);
    exports_.removeFontFromElement(el);
    check('font restore: restores original value', el.style.getPropertyValue('font-family'), 'CustomFont');
    check('font restore: restores original priority', el.style.getPropertyPriority('font-family'), 'important');
}

{
    const host = new MockElement('div', { computedFont: 'HostFont', contenteditable: true });
    const child = new MockElement('span', { computedFont: 'ChildFont', parentElement: host });
    const text = new MockTextNode('سلام در پرپلکسیتی', child);
    exports_.evaluateTextNode(text);
    check('contenteditable nested text: child gets Vazirmatn', child.style.getPropertyValue('font-family').startsWith('"Vazirmatn", ChildFont'), true);
    check('contenteditable nested text: host also gets Vazirmatn', host.style.getPropertyValue('font-family').startsWith('"Vazirmatn", HostFont'), true);
}

{
    const textbox = new MockElement('div', {
        computedFont: 'RoleFont',
        role: 'textbox',
        textContent: 'سلام در role textbox'
    });
    exports_.updateElementFont(textbox);
    check('role textbox Persian text: gets Vazirmatn', textbox.style.getPropertyValue('font-family').startsWith('"Vazirmatn", RoleFont'), true);
    check('role textbox Persian text: uses important priority', textbox.style.getPropertyPriority('font-family'), 'important');
}

{
    // Array-target cleanup: a Persian text node under a nested editable applies font
    // to BOTH the inner element and the contenteditable host. When that text node is
    // removed, cleanupRemoved must decrement BOTH (the old instanceof-HTMLElement
    // guard rejected the array, so the injected font was never cleaned up).
    const host = new MockElement('div', { computedFont: 'HostFont', contenteditable: true });
    const child = new MockElement('span', { computedFont: 'ChildFont', parentElement: host });
    const text = new MockTextNode('سلام آرایه‌ای', child);

    exports_.evaluateTextNode(text);
    check('array targets: child element got Vazirmatn', child.style.getPropertyValue('font-family').startsWith('"Vazirmatn", ChildFont'), true);
    check('array targets: contenteditable host got Vazirmatn', host.style.getPropertyValue('font-family').startsWith('"Vazirmatn", HostFont'), true);

    exports_.cleanupRemoved(text);
    check('array targets cleanup: child font removed on node removal', child.style.getPropertyValue('font-family'), '');
    check('array targets cleanup: host font removed on node removal', host.style.getPropertyValue('font-family'), '');
}

{
    // Claude response content must NOT receive inline font mutation (redundant with
    // the recipe stylesheet and a streaming-time hazard), but the composer and other
    // editables outside the response containers must keep working.
    ctx.window.location = { hostname: 'claude.ai' };

    const response = new MockElement('div', { className: 'font-claude-message' });
    const para = new MockElement('p', { computedFont: 'ResponseFont', parentElement: response });
    const responseText = new MockTextNode('پاسخ فارسی مدل', para);
    exports_.evaluateTextNode(responseText);
    check('claude response text: no inline font mutation', para.style.getPropertyValue('font-family'), '');

    // claude.ai renamed the assistant wrapper to .font-claude-response; the
    // skip list must cover the new class even outside a turn wrapper.
    const renamedResponse = new MockElement('div', { className: 'font-claude-response' });
    const renamedPara = new MockElement('p', { computedFont: 'ResponseFont', parentElement: renamedResponse });
    const renamedText = new MockTextNode('پاسخ فارسی در DOM جدید کلود', renamedPara);
    exports_.evaluateTextNode(renamedText);
    check('claude renamed response wrapper: no inline font mutation', renamedPara.style.getPropertyValue('font-family'), '');

    const article = new MockElement('div', { role: 'article' });
    const articlePara = new MockElement('p', { computedFont: 'ArticleFont', parentElement: article });
    const articleText = new MockTextNode('پاسخ فارسی با fallback article', articlePara);
    exports_.evaluateTextNode(articleText);
    check('claude role=article fallback: no inline font mutation', articlePara.style.getPropertyValue('font-family'), '');

    const table = new MockElement('table');
    const tableCell = new MockElement('td', { computedFont: 'ClaudeTableFont', parentElement: table });
    const tableText = new MockTextNode('باشگاه مشتریان / CRM', tableCell);
    exports_.evaluateTextNode(tableText);
    check('claude direct table rescue: no inline font mutation', tableCell.style.getPropertyValue('font-family'), '');

    const ariaTable = new MockElement('div', { role: 'table' });
    const ariaCell = new MockElement('div', { computedFont: 'ClaudeAriaTableFont', parentElement: ariaTable });
    const ariaText = new MockTextNode('اتصال به POS / کاسه', ariaCell);
    exports_.evaluateTextNode(ariaText);
    check('claude direct ARIA table rescue: no inline font mutation', ariaCell.style.getPropertyValue('font-family'), '');

    const composer = new MockElement('div', { computedFont: 'ComposerFont', contenteditable: true });
    const composerText = new MockTextNode('سلام در composer', composer);
    exports_.evaluateTextNode(composerText);
    check('claude composer text: still gets Vazirmatn', composer.style.getPropertyValue('font-family').startsWith('"Vazirmatn", ComposerFont'), true);

    delete ctx.window.location;
}

{
    // ChatGPT response turns must also skip inline font mutation (recipe stylesheet
    // supplies the Persian font); the composer outside the turns keeps working.
    ctx.window.location = { hostname: 'chatgpt.com' };

    const turn = new MockElement('div', { attrs: { 'data-message-author-role': 'assistant' } });
    const para = new MockElement('p', { computedFont: 'TurnFont', parentElement: turn });
    const turnText = new MockTextNode('پاسخ فارسی ChatGPT', para);
    exports_.evaluateTextNode(turnText);
    check('chatgpt response text: no inline font mutation', para.style.getPropertyValue('font-family'), '');

    const langPara = new MockElement('p', {
        computedFont: 'LangFont',
        parentElement: turn,
        attrs: { lang: 'fa' }
    });
    exports_.updateElementFont(langPara);
    check('chatgpt response lang=fa: no inline font mutation', langPara.style.getPropertyValue('font-family'), '');

    const responseTextbox = new MockElement('div', {
        computedFont: 'RoleFont',
        role: 'textbox',
        textContent: 'سلام در edit bubble',
        parentElement: turn
    });
    exports_.updateElementFont(responseTextbox);
    check('chatgpt response role=textbox: no inline font mutation', responseTextbox.style.getPropertyValue('font-family'), '');

    const composer = new MockElement('div', { computedFont: 'GptComposer', contenteditable: true });
    const composerText = new MockTextNode('سلام در composer', composer);
    exports_.evaluateTextNode(composerText);
    check('chatgpt composer text: still gets Vazirmatn', composer.style.getPropertyValue('font-family').startsWith('"Vazirmatn", GptComposer'), true);

    delete ctx.window.location;
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
