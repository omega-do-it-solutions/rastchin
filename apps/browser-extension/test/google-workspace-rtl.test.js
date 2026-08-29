'use strict';
// Google Docs/Sheets comment UI support. The recipe must stay scoped to comment
// composer/thread text and avoid flipping Google Docs/Sheets application chrome.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'google-workspace-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;
const documentListeners = {};

class HTMLElement {}

const documentMock = {
    referrer: '',
    addEventListener(type, listener, capture) {
        documentListeners[type] = { listener, capture };
    },
    removeEventListener(type, listener) {
        if (documentListeners[type]?.listener === listener) delete documentListeners[type];
    },
    querySelectorAll() {
        const out = [];
        out.forEach = Array.prototype.forEach.bind(out);
        return out;
    }
};

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'docs.google.com' },
        getComputedStyle(element) {
            return element?._computedStyle || {
                display: 'block',
                visibility: 'visible',
                contentVisibility: 'visible',
                flexDirection: 'row'
            };
        },
        __GOOGLE_WORKSPACE_RTL_TEST__(api) { exported = api; }
    },
    document: documentMock,
    HTMLElement,
    RastChinRecipe: {
        runPlatformRecipe(recipe) { registeredRecipe = recipe; }
    },
    console
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(source, ctx);

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (got === expected) return;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: Google Workspace recipe test hook did not run');
    process.exit(1);
}

function selectorParts(selector) {
    return String(selector || '').split(',').map(part => part.trim()).filter(Boolean);
}

function makeClassList(el) {
    return {
        _set: new Set(),
        add(...names) { names.forEach(name => this._set.add(name)); },
        remove(...names) { names.forEach(name => this._set.delete(name)); },
        contains(name) { return this._set.has(name); }
    };
}

function makeStyle() {
    const store = new Map();
    return {
        setProperty(prop, value) { store.set(prop, value); },
        removeProperty(prop) { store.delete(prop); },
        getPropertyValue(prop) { return store.get(prop) || ''; }
    };
}

function makeElement(options = {}) {
    const attrs = new Map(Object.entries(options.attrs || {}));
    const matchSet = new Set(options.matchSelectors || []);
    const el = {
        tagName: options.tagName || 'DIV',
        isConnected: true,
        hidden: false,
        textContent: options.textContent || '',
        innerText: options.textContent || '',
        value: options.value,
        parentElement: null,
        _children: [],
        _computedStyle: options.computedStyle || {
            display: 'block',
            visibility: 'visible',
            contentVisibility: 'visible',
            flexDirection: 'row'
        },
        style: makeStyle(),
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        matches(selector) {
            return selectorParts(selector).some(part => matchSet.has(part));
        },
        closest(selector) {
            const parts = selectorParts(selector);
            let current = el;
            while (current) {
                if (parts.some(part => current.matches(part))) return current;
                current = current.parentElement;
            }
            return null;
        },
        querySelectorAll(selector) {
            const out = [];
            const visit = node => {
                (node._children || []).forEach(child => {
                    if (child.matches(selector)) out.push(child);
                    visit(child);
                });
            };
            visit(el);
            out.forEach = Array.prototype.forEach.bind(out);
            return out;
        }
    };
    el.classList = makeClassList(el);
    Object.setPrototypeOf(el, HTMLElement.prototype);
    (options.children || []).forEach(child => {
        child.parentElement = el;
        el._children.push(child);
    });
    return el;
}

const engine = {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return typeof element.value === 'string' ? element.value : (element.textContent || ''); },
    applyRTL(element) {
        element.setAttribute('dir', 'rtl');
        element.style.setProperty('direction', 'rtl');
        element.style.setProperty('text-align', 'right');
        element.style.setProperty('unicode-bidi', 'plaintext');
        element.classList.add('rastchin-google-workspace-rtl');
    },
    restoreElement(element) {
        element.removeAttribute('dir');
        element.style.removeProperty('direction');
        element.style.removeProperty('text-align');
        element.style.removeProperty('unicode-bidi');
        element.classList.remove('rastchin-google-workspace-rtl');
    },
    scheduleScan() {}
};

check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'googleWorkspaceEnabled');
check('recipe: host docs.google.com', registeredRecipe.hosts.includes('docs.google.com'), true);
check('recipe: host about:blank frame', registeredRecipe.hosts.includes(''), true);
check('recipe: only docs and about:blank hosts', registeredRecipe.hosts.length, 2);
check('recipe: has Docs comment selector', registeredRecipe.messageSelectors.includes('.docos-comment-text'), true);
check('recipe: has anchored comment container selector', registeredRecipe.messageSelectors.includes('.docos-anchoreddocoview'), true);
check('recipe: has Docs contenteditable composer selector', registeredRecipe.messageSelectors.includes('.docos-input-contenteditable[contenteditable="true"]'), true);
check('recipe: has comment composer selector', registeredRecipe.messageSelectors.includes('[class*="docos"] [role="textbox"][contenteditable="true"]'), true);
check('recipe: has dialog textarea selector', registeredRecipe.messageSelectors.includes('[role="dialog"] textarea'), true);
check('recipe: has broad dialog textbox selector', registeredRecipe.messageSelectors.includes('[role="dialog"] [role="textbox"]'), true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has isMessageElement', typeof registeredRecipe.isMessageElement, 'function');
check('recipe: has input listener hook', typeof registeredRecipe.onEnable, 'function');
check('recipe: inline isolation enabled', registeredRecipe.inlineIsolate, true);
check('recipe: guards Google chrome', exported.outOfScopeSelectors.includes('.docs-toolbar-wrapper'), true);
check('recipe: guards Sheets chrome', exported.outOfScopeSelectors.includes('.waffle-toolbar'), true);
check('recipe: guards Docs editor iframe', exported.outOfScopeSelectors.includes('.docs-texteventtarget-iframe'), true);

check('host: docs.google.com supported', exported.isSupportedHost('docs.google.com'), true);
check('host: drive.google.com unsupported', exported.isSupportedHost('drive.google.com'), false);
check('host: mail.google.com unsupported', exported.isSupportedHost('mail.google.com'), false);
check('host: empty hostname without docs ancestor unsupported', exported.isSupportedHost(''), false);
documentMock.referrer = 'https://docs.google.com/document/d/example/edit';
check('host: about:blank docs referrer supported', exported.isSupportedHost(''), true);
documentMock.referrer = '';
ctx.window.location.ancestorOrigins = ['https://docs.google.com'];
check('host: about:blank docs ancestor supported', exported.isSupportedHost(''), true);
ctx.window.location.ancestorOrigins = [];

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scope class for modified comments', css.includes('rastchin-google-workspace-rtl'), true);
check('css: descendants inherit Vazirmatn font', /\.rastchin-google-workspace-rtl\s+\*/.test(css), true);
// The bare `body` element selector must never be styled. Use a boundary so the
// `.docos-comment-body { ... }` comment class (which legitimately ends in -body)
// is not a false positive.
check('css: does not target whole body', /(^|[\s,>~+])body\s*[,{]/m.test(css), false);

const commentText = makeElement({
    matchSelectors: ['.docos-comment-text'],
    textContent: 'این کامنت فارسی باید راست‌چین شود'
});
check('isMessageElement: Docs existing comment matches', registeredRecipe.isMessageElement(commentText), true);
registeredRecipe.applyToMessage(commentText, engine);
check('applyToMessage: comment gets rtl dir', commentText.getAttribute('dir'), 'rtl');
check('applyToMessage: comment marked', commentText.getAttribute('data-rastchin-google-workspace'), 'true');
check('applyToMessage: comment gets rtl style', commentText.style.getPropertyValue('direction'), 'rtl');
check('applyToMessage: comment gets right alignment', commentText.style.getPropertyValue('text-align'), 'right');

const composer = makeElement({
    matchSelectors: ['[class*="docos"] [role="textbox"][contenteditable="true"]'],
    attrs: { role: 'textbox', contenteditable: 'true' },
    textContent: 'توی رزومه جمله جدید اضافه کنیم'
});
check('isMessageElement: Docs composer textbox matches', registeredRecipe.isMessageElement(composer), true);
registeredRecipe.applyToMessage(composer, engine);
check('applyToMessage: composer gets rtl dir', composer.getAttribute('dir'), 'rtl');

const dialogTextarea = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['[role="dialog"] textarea'],
    attrs: { role: 'textbox' },
    value: 'تست متن فارسی برای کامنت'
});
check('isMessageElement: dialog textarea matches', registeredRecipe.isMessageElement(dialogTextarea), true);
registeredRecipe.applyToMessage(dialogTextarea, engine);
check('applyToMessage: dialog textarea gets rtl dir', dialogTextarea.getAttribute('dir'), 'rtl');
check('applyToMessage: dialog textarea gets font class', dialogTextarea.classList.contains('rastchin-google-workspace-rtl'), true);

const modernTextbox = makeElement({
    tagName: 'DIV',
    matchSelectors: ['[role="textbox"]', '[contenteditable="plaintext-only"]'],
    attrs: { role: 'textbox', contenteditable: 'plaintext-only' },
    textContent: 'کامنت تستی'
});
const modernDialog = makeElement({
    matchSelectors: ['[role="dialog"]'],
    attrs: { role: 'dialog' },
    textContent: 'کامنت تستی',
    children: [modernTextbox]
});
check('isMessageElement: modern dialog composer textbox matches',
    registeredRecipe.isMessageElement(modernTextbox), true);
registeredRecipe.applyToMessage(modernTextbox, engine);
check('applyToMessage: modern dialog composer gets rtl dir', modernTextbox.getAttribute('dir'), 'rtl');
check('applyToMessage: modern dialog composer gets font class',
    modernTextbox.classList.contains('rastchin-google-workspace-rtl'), true);

const modernCommentText = makeElement({
    tagName: 'SPAN',
    matchSelectors: ['span'],
    textContent: 'کامنت تستی'
});
const modernCommentCard = makeElement({
    matchSelectors: ['[aria-label*="Comment" i]'],
    attrs: { 'aria-label': 'Comment by Mo. Mikaeli' },
    textContent: 'Mo. Mikaeli 17:04 Today کامنت تستی',
    children: [modernCommentText]
});
check('isMessageElement: modern comment card recognised',
    registeredRecipe.isMessageElement(modernCommentCard), true);
check('isMessageElement: modern comment card text leaf recognised',
    registeredRecipe.isMessageElement(modernCommentText), true);
registeredRecipe.applyToMessage(modernCommentCard, engine);
check('applyToMessage: modern comment text gets rtl dir', modernCommentText.getAttribute('dir'), 'rtl');
check('applyToMessage: modern comment text marked',
    modernCommentText.getAttribute('data-rastchin-google-workspace'), 'true');

let scheduled = null;
const scanningEngine = { ...engine, scheduleScan(target) { scheduled = target; } };
registeredRecipe.onEnable(scanningEngine);
check('onEnable: input listener registered', typeof documentListeners.input?.listener, 'function');
check('onEnable: input listener capture mode', documentListeners.input?.capture, true);
check('onEnable: focus listener registered', typeof documentListeners.focusin?.listener, 'function');
documentListeners.input.listener({ target: dialogTextarea });
check('input: schedules dialog textarea scan', scheduled, dialogTextarea);
scheduled = null;
documentListeners.input.listener({ target: modernTextbox });
check('input: schedules modern dialog textbox scan', scheduled, modernTextbox);
registeredRecipe.onDisable(scanningEngine);
check('onDisable: input listener removed', documentListeners.input, undefined);
check('onDisable: focus listener removed', documentListeners.focusin, undefined);

const englishComment = makeElement({
    matchSelectors: ['.docos-comment-text'],
    textContent: 'This comment stays English'
});
registeredRecipe.applyToMessage(englishComment, engine);
check('applyToMessage: English comment untouched', englishComment.getAttribute('dir'), null);

const toolbar = makeElement({
    matchSelectors: ['.docs-toolbar-wrapper'],
    textContent: 'نظر'
});
check('isMessageElement: toolbar ignored', registeredRecipe.isMessageElement(toolbar), false);

// ---------------------------------------------------------------------------
// REGRESSION: real Docs/Sheets comment surfaces that the original recipe missed.
// Each block below fails against the pre-fix recipe (missing selectors / scoped
// CSS) and passes after the fix.
// ---------------------------------------------------------------------------

// 1) Docs reply text uses `.docos-replyview-static` (the rendered static
//    comment/reply wrapper). The pre-fix recipe lacked this selector, so a
//    Persian reply painted there never flipped.
const replyStatic = makeElement({
    matchSelectors: ['.docos-replyview-static'],
    textContent: 'این پاسخ به کامنت باید راست‌چین شود'
});
check('regression: .docos-replyview-static is a message selector',
    registeredRecipe.messageSelectors.includes('.docos-replyview-static'), true);
check('regression: reply-static recognised as comment block',
    registeredRecipe.isMessageElement(replyStatic), true);
registeredRecipe.applyToMessage(replyStatic, engine);
check('regression: reply-static gets rtl dir', replyStatic.getAttribute('dir'), 'rtl');
check('regression: reply-static gets right alignment', replyStatic.style.getPropertyValue('text-align'), 'right');
check('regression: reply-static marked', replyStatic.getAttribute('data-rastchin-google-workspace'), 'true');

// 2) Anchored reply comment surface (`.docos-anchoredreplyview-comment`) was
//    missing too.
const anchoredReply = makeElement({
    matchSelectors: ['.docos-anchoredreplyview-comment'],
    textContent: 'پاسخ لنگرشده فارسی'
});
check('regression: .docos-anchoredreplyview-comment is a message selector',
    registeredRecipe.messageSelectors.includes('.docos-anchoredreplyview-comment'), true);
registeredRecipe.applyToMessage(anchoredReply, engine);
check('regression: anchored reply gets rtl dir', anchoredReply.getAttribute('dir'), 'rtl');

// 3) Thread CONTAINER is the matched element but the Persian prose lives in a
//    nested `.docos-replyview-comment` child. The recipe must flip the inner
//    text target, not just the container.
const innerReply = makeElement({
    matchSelectors: ['.docos-replyview-comment'],
    textContent: 'متن کامنت داخل کانتینر فارسی است'
});
const threadContainer = makeElement({
    matchSelectors: ['.docos-anchoreddocoview'],
    textContent: 'متن کامنت داخل کانتینر فارسی است',
    children: [innerReply]
});
check('regression: thread container recognised',
    registeredRecipe.isMessageElement(threadContainer), true);
registeredRecipe.applyToMessage(threadContainer, engine);
check('regression: nested reply text gets rtl dir', innerReply.getAttribute('dir'), 'rtl');
check('regression: nested reply text marked',
    innerReply.getAttribute('data-rastchin-google-workspace'), 'true');

// 4) Docs comment composer (contenteditable textbox) flips when Persian is typed.
const ceComposer = makeElement({
    matchSelectors: ['.docos-input-contenteditable[contenteditable="true"]'],
    attrs: { contenteditable: 'true', role: 'textbox' },
    textContent: 'دارم یک کامنت فارسی می‌نویسم'
});
check('regression: contenteditable composer recognised',
    registeredRecipe.isMessageElement(ceComposer), true);
registeredRecipe.applyToMessage(ceComposer, engine);
check('regression: contenteditable composer gets rtl dir', ceComposer.getAttribute('dir'), 'rtl');
check('regression: contenteditable composer gets font class',
    ceComposer.classList.contains('rastchin-google-workspace-rtl'), true);

// 5) Sheets comments reuse the shared `.docos-*` discussion widget. A
//    `.docos-replyview-comment` reply on a spreadsheet must flip the same way.
const sheetsComment = makeElement({
    matchSelectors: ['.docos-replyview-comment'],
    textContent: 'کامنت روی شیت گوگل فارسی'
});
check('regression: sheets comment recognised',
    registeredRecipe.isMessageElement(sheetsComment), true);
registeredRecipe.applyToMessage(sheetsComment, engine);
check('regression: sheets comment gets rtl dir', sheetsComment.getAttribute('dir'), 'rtl');

// 6) globalCss must carry scoped `!important` rules + Vazirmatn for comment text
//    and the composer, and must reach the known comment-text child classes.
check('regression: css forces rtl on marked scope with !important',
    /rastchin-google-workspace-rtl[^]*direction:\s*rtl\s*!important/.test(css), true);
check('regression: css right-aligns marked scope with !important',
    /rastchin-google-workspace-rtl[^]*text-align:\s*right\s*!important/.test(css), true);
check('regression: css fonts marked descendants with Vazirmatn !important',
    /\.rastchin-google-workspace-rtl\s+\*[^]*?Vazirmatn[^]*?!important/.test(css), true);
check('regression: css targets reply-comment text node',
    css.includes('.docos-replyview-comment'), true);
check('regression: css targets reply-static text node',
    css.includes('.docos-replyview-static'), true);
check('regression: css scopes via engine-set dir=rtl',
    /\[dir="rtl"\]/.test(css), true);
check('regression: css directly fonts live docos reply body',
    /\.docos-replyview-body,[^]*?font-family:\s*"Vazirmatn"[^]*?!important/.test(css), true);
check('regression: css directly right-aligns live docos reply body',
    /\.docos-replyview-body,[^]*?text-align:\s*right\s*!important/.test(css), true);
check('regression: css directly fonts live docos comment composer',
    /\.docos-input-textarea,[^]*?font-family:\s*"Vazirmatn"[^]*?!important/.test(css), true);
check('regression: css directly right-aligns live docos comment composer',
    /\.docos-input-textarea,[^]*?text-align:\s*right\s*!important/.test(css), true);
check('regression: css directly preserves descendant comment font',
    /\.docos-replyview-body\s+\*[^]*?font-family:\s*"Vazirmatn"[^]*?!important/.test(css), true);

// 7) NEGATIVE: the document editor, Sheets grid, toolbar, menu, and buttons must
//    NEVER be treated as comment surfaces or flipped — even with Persian text.
const editorPage = makeElement({ matchSelectors: ['.kix-page'], textContent: 'متن سند ویرایشگر' });
check('regression: Docs editor page never a comment block',
    registeredRecipe.isMessageElement(editorPage), false);
registeredRecipe.applyToMessage(editorPage, engine);
check('regression: Docs editor page not flipped', editorPage.getAttribute('dir'), null);

const grid = makeElement({ matchSelectors: ['.waffle'], textContent: 'سلول شیت فارسی' });
check('regression: Sheets grid never a comment block',
    registeredRecipe.isMessageElement(grid), false);
registeredRecipe.applyToMessage(grid, engine);
check('regression: Sheets grid not flipped', grid.getAttribute('dir'), null);

const cellInput = makeElement({ matchSelectors: ['.cell-input'], textContent: 'ورودی سلول فارسی' });
check('regression: Sheets cell input never a comment block',
    registeredRecipe.isMessageElement(cellInput), false);
registeredRecipe.applyToMessage(cellInput, engine);
check('regression: Sheets cell input not flipped', cellInput.getAttribute('dir'), null);

const docsToolbar = makeElement({ matchSelectors: ['#docs-toolbar'], textContent: 'نظر' });
check('regression: Docs toolbar never a comment block',
    registeredRecipe.isMessageElement(docsToolbar), false);

const menu = makeElement({ matchSelectors: ['[role="menu"]'], textContent: 'افزودن نظر' });
check('regression: menu never a comment block',
    registeredRecipe.isMessageElement(menu), false);

const button = makeElement({ matchSelectors: ['button'], textContent: 'ارسال' });
check('regression: button never a comment block',
    registeredRecipe.isMessageElement(button), false);
registeredRecipe.applyToMessage(button, engine);
check('regression: button not flipped', button.getAttribute('dir'), null);

// 8) Editor/grid/toolbar guards are present in the recipe's exclude config.
check('regression: excludeSelectors guard kix editor',
    registeredRecipe.excludeSelectors.includes('.kix-page'), true);
check('regression: excludeSelectors guard waffle grid',
    registeredRecipe.excludeSelectors.includes('.waffle'), true);
check('regression: excludeSelectors guard cell input',
    registeredRecipe.excludeSelectors.includes('.cell-input'), true);
check('regression: excludeSelectors guard docs toolbar',
    registeredRecipe.excludeSelectors.includes('#docs-toolbar'), true);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
