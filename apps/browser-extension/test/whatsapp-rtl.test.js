'use strict';
// Focused regression suite for WhatsApp Web's scoped RTL recipe.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'whatsapp-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;
const documentListeners = {};

class HTMLElement {}

const documentMock = {
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
        location: { hostname: 'web.whatsapp.com' },
        getComputedStyle(element) {
            return element?._computedStyle || {
                display: 'block',
                visibility: 'visible',
                contentVisibility: 'visible',
                flexDirection: 'column'
            };
        },
        __WHATSAPP_RTL_TEST__(api) { exported = api; }
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
    if (got !== expected) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: WhatsApp recipe test hook did not run');
    process.exit(1);
}

function selectorParts(selector) {
    return String(selector || '').split(',').map(part => part.trim()).filter(Boolean);
}

function makeClassList(el) {
    return {
        _set: new Set(),
        add(...names) { names.forEach(name => this._set.add(name)); el._classNames = Array.from(this._set); },
        remove(...names) { names.forEach(name => this._set.delete(name)); el._classNames = Array.from(this._set); },
        contains(name) { return this._set.has(name); }
    };
}

function makeStyle() {
    const store = new Map();
    const priorities = new Map();
    return {
        setProperty(prop, value, priority) {
            store.set(prop, value);
            priorities.set(prop, priority || '');
        },
        removeProperty(prop) { store.delete(prop); priorities.delete(prop); },
        getPropertyValue(prop) { return store.get(prop) || ''; },
        getPropertyPriority(prop) { return priorities.get(prop) || ''; }
    };
}

function makeElement(options = {}) {
    const attrs = new Map(Object.entries(options.attrs || {}));
    const matchSet = new Set(options.matchSelectors || []);
    const el = {
        tagName: options.tagName || 'DIV',
        isConnected: options.isConnected !== false,
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
            flexDirection: 'column'
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
        },
        contains(target) {
            if (target === el) return true;
            return (el._children || []).some(child => child === target || child.contains?.(target));
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
    collectDirectionText(element) {
        if (typeof element.value === 'string') return element.value;
        return element.textContent || '';
    },
    scheduleScan() {}
};

// --- recipe contract ---------------------------------------------------------
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'whatsappEnabled');
check('recipe: host web.whatsapp.com', registeredRecipe.hosts.includes('web.whatsapp.com'), true);
check('recipe: single host only', registeredRecipe.hosts.length, 1);
check('recipe: message container selector', registeredRecipe.messageSelectors.includes('[data-testid="msg-container"]'), true);
check('recipe: message text selector', registeredRecipe.messageSelectors.includes('span.selectable-text'), true);
check('recipe: composer selector', registeredRecipe.messageSelectors.includes('[contenteditable="true"][role="textbox"]'), true);
check('recipe: search selector', registeredRecipe.messageSelectors.includes('input[aria-label*="Search"]'), true);
check('recipe: list title selector', registeredRecipe.messageSelectors.includes('[role="listitem"] span[title]'), true);
check('recipe: no broad body selector', registeredRecipe.messageSelectors.includes('body'), false);
check('recipe: no broad app selector', registeredRecipe.messageSelectors.includes('#app'), false);
check('recipe: textSelectors disabled for custom scoped walk', registeredRecipe.textSelectors.length, 0);
check('recipe: inline isolation disabled for live messaging DOM', registeredRecipe.inlineIsolate, false);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has input rescan hook', typeof registeredRecipe.onEnable, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: excludes code', registeredRecipe.excludeSelectors.includes('code'), true);
check('recipe: guards toolbar', exported.outOfScopeSelectors.includes('[role="toolbar"]'), true);
check('recipe: does not replace live text nodes', source.includes('replaceChild'), false);
check('recipe: does not inject wrapper elements', source.includes('createElement('), false);

check('host: web.whatsapp.com supported', exported.isSupportedHost('web.whatsapp.com'), true);
check('host: whatsapp.com unsupported', exported.isSupportedHost('whatsapp.com'), false);
check('host: unrelated unsupported', exported.isSupportedHost('example.com'), false);

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scope class present', css.includes('rastchin-whatsapp-rtl'), true);
check('css: code guard stays LTR', /direction:\s*ltr\s*!important/.test(css), true);
check('css: does not target whole body', /body\s*\{/.test(css), false);

// --- message bubble: target leaf only, not app chrome -------------------------
const messageText = makeElement({
    matchSelectors: ['span.selectable-text'],
    textContent: 'سلام از واتساپ Web'
});
const messageBubble = makeElement({
    matchSelectors: ['[data-testid="msg-container"]'],
    textContent: 'سلام از واتساپ Web',
    children: [messageText]
});
check('isMessageElement: message bubble matches', registeredRecipe.isMessageElement(messageBubble), true);
check('targets: finds message leaf', exported.getTextTargets(messageBubble).includes(messageText), true);
registeredRecipe.applyToMessage(messageBubble, engine);
check('apply: message leaf gets dir rtl', messageText.getAttribute('dir'), 'rtl');
check('apply: message leaf gets class', messageText.classList.contains('rastchin-whatsapp-rtl'), true);
check('apply: message leaf gets Vazirmatn', messageText.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
check('apply: message container not modified', messageBubble.getAttribute('data-rastchin-whatsapp-rtl'), null);

const toolbar = makeElement({
    matchSelectors: ['[role="toolbar"]'],
    textContent: 'سلام',
    children: [makeElement({
        matchSelectors: ['span.selectable-text'],
        textContent: 'سلام'
    })]
});
const toolbarText = toolbar._children[0];
check('scope: toolbar text target is ignored', registeredRecipe.isMessageElement(toolbarText), false);

// --- composer/search/list targets -------------------------------------------
const composer = makeElement({
    matchSelectors: ['[contenteditable="true"][role="textbox"]'],
    textContent: 'پیام فارسی برای ارسال'
});
check('isMessageElement: composer matches', registeredRecipe.isMessageElement(composer), true);
registeredRecipe.applyToMessage(composer, engine);
check('apply: composer gets rtl', composer.getAttribute('dir'), 'rtl');

const search = makeElement({
    tagName: 'INPUT',
    matchSelectors: ['input[aria-label*="Search"]'],
    value: 'گفتگو',
    textContent: ''
});
registeredRecipe.applyToMessage(search, engine);
check('apply: search input value gets rtl', search.getAttribute('dir'), 'rtl');

const listButton = makeElement({
    matchSelectors: ['[role="button"]'],
    textContent: 'مریم',
    children: [makeElement({
        matchSelectors: ['[role="listitem"] span[title]'],
        textContent: 'مریم'
    })]
});
const chatTitle = listButton._children[0];
check('scope: chat-list title inside button remains targetable', registeredRecipe.isMessageElement(chatTitle), true);
registeredRecipe.applyToMessage(chatTitle, engine);
check('apply: chat-list title gets rtl', chatTitle.getAttribute('dir'), 'rtl');

chatTitle.textContent = 'Mary';
chatTitle.innerText = 'Mary';
registeredRecipe.applyToMessage(chatTitle, engine);
check('restore: English chat-list title removes dir', chatTitle.getAttribute('dir'), null);
check('restore: English chat-list title removes class', chatTitle.classList.contains('rastchin-whatsapp-rtl'), false);

// --- chrome / timestamps must NOT be flipped ---------------------------------
// A message bubble carries a meta timestamp that is plain text with no
// selectable-text/message selector, so it must never be flipped.
const bubbleText = makeElement({
    matchSelectors: ['span.selectable-text'],
    textContent: 'پیام فارسی'
});
const bubbleTime = makeElement({
    matchSelectors: ['[data-testid="msg-meta"]'],
    textContent: '10:45 AM'
});
const bubbleWithTime = makeElement({
    matchSelectors: ['[data-testid="msg-container"]'],
    textContent: 'پیام فارسی 10:45 AM',
    children: [bubbleText, bubbleTime]
});
check('timestamp: only the message leaf is a target', exported.getTextTargets(bubbleWithTime).includes(bubbleTime), false);
registeredRecipe.applyToMessage(bubbleWithTime, engine);
check('timestamp: message leaf flipped', bubbleText.getAttribute('dir'), 'rtl');
check('timestamp: msg-meta time NOT flipped', bubbleTime.getAttribute('dir'), null);

const iconLabel = makeElement({
    matchSelectors: ['[data-icon]'],
    textContent: 'ارسال'
});
check('chrome: icon label is not a text block', registeredRecipe.isMessageElement(iconLabel), false);
registeredRecipe.applyToMessage(iconLabel, engine);
check('chrome: icon label not flipped', iconLabel.getAttribute('dir'), null);

const menuItem = makeElement({
    matchSelectors: ['[role="menuitem"]'],
    textContent: 'حذف',
    children: [makeElement({ matchSelectors: ['span.selectable-text'], textContent: 'حذف' })]
});
const menuItemText = menuItem._children[0];
check('chrome: text under menuitem is out of scope', registeredRecipe.isMessageElement(menuItemText), false);
registeredRecipe.applyToMessage(menuItem, engine);
check('chrome: menuitem text not flipped', menuItemText.getAttribute('dir'), null);

// Dead-CSS regression: globalCss must emit a real code-guard selector even when
// recipe-runner passes an empty codeGuard arg (recipe sets excludeSelectors, not
// codeGuardSelectors, so the runner's codeGuard string is '').
const emptyArgCss = registeredRecipe.globalCss('');
check('css: code guard rule has real selector with empty arg', /code[^{]*\{\s*direction:\s*ltr\s*!important/.test(emptyArgCss), true);
check('css: no empty selector rule head', /(^|\})\s*\{\s*direction:\s*ltr/.test(emptyArgCss), false);

// --- input rescans and cleanup -----------------------------------------------
let scheduled = null;
const scanningEngine = { ...engine, scheduleScan(target) { scheduled = target; } };
registeredRecipe.onEnable(scanningEngine);
check('onEnable: input listener registered', typeof documentListeners.input?.listener, 'function');
check('onEnable: input listener capture mode', documentListeners.input?.capture, true);
documentListeners.input.listener({ target: composer });
check('input: schedules composer scan', scheduled, composer);

registeredRecipe.onDisable();
check('onDisable: input listener removed', documentListeners.input, undefined);
check('onDisable: message leaf restored', messageText.getAttribute('dir'), null);
check('onDisable: composer restored', composer.getAttribute('dir'), null);

// --- timestamp/checkmark overlap guard ---------------------------------------
// The recipe reserves space on the marked message-text leaf so WhatsApp's
// absolutely-positioned time + read receipts (rendered at the bottom inline-end
// of .message-in / .message-out bubbles) do not sit on top of the flipped
// Persian text. The reserved space MUST be scoped to real bubble contexts and
// MUST NOT change font-size.
const overlapCss = registeredRecipe.globalCss('code, pre');
check('overlap: reserves space for incoming bubble text',
    /\.message-in\s+\.rastchin-whatsapp-rtl/.test(overlapCss), true);
check('overlap: reserves space for outgoing bubble text',
    /\.message-out\s+\.rastchin-whatsapp-rtl/.test(overlapCss), true);
check('overlap: reserves space for copyable-text message variant',
    /\.copyable-text\.rastchin-whatsapp-rtl/.test(overlapCss), true);
check('overlap: padding-bottom clears metadata row',
    /padding-bottom:\s*[\d.]+em/.test(overlapCss), true);
check('overlap: padding-inline-end keeps trailing glyph clear',
    /padding-inline-end:\s*[\d.]+em/.test(overlapCss), true);
// The spacing must be bubble-scoped: the bare class must NOT carry padding, so
// chat-list previews / composer / search keep their native spacing.
const bareClassRules = overlapCss.match(/(^|[},\s])\.rastchin-whatsapp-rtl\s*\{[^}]*\}/g) || [];
const bareClassHasPadding = bareClassRules.some(rule => /padding(-bottom|-inline-end)?:/.test(rule));
check('overlap: bare class carries no reserved-space padding', bareClassHasPadding, false);
// Font size must remain untouched anywhere in the emitted CSS.
check('overlap: css does not change font-size', /font-size/.test(overlapCss), false);

// Behavioral: INCOMING bubble (.message-in) with Persian text + a timestamp /
// checkmark metadata node -> only the text leaf is marked, meta is never marked.
const inText = makeElement({
    matchSelectors: ['span.selectable-text', '.selectable-text.copyable-text'],
    textContent: 'سلام دوست من'
});
const inMeta = makeElement({
    matchSelectors: ['[data-icon]'],
    textContent: '10:45 AM ✓✓'
});
const incomingBubble = makeElement({
    matchSelectors: ['.message-in', '[data-testid="msg-container"]'],
    textContent: 'سلام دوست من 10:45 AM',
    children: [inText, inMeta]
});
registeredRecipe.applyToMessage(incomingBubble, engine);
check('incoming: message text leaf flipped', inText.getAttribute('dir'), 'rtl');
check('incoming: message text leaf gets class', inText.classList.contains('rastchin-whatsapp-rtl'), true);
check('incoming: timestamp/checkmark meta NOT flipped', inMeta.getAttribute('dir'), null);
check('incoming: bubble container NOT modified', incomingBubble.getAttribute('data-rastchin-whatsapp-rtl'), null);

// Behavioral: OUTGOING bubble (.message-out) with Persian text + timestamp /
// checkmark -> text marked, meta untouched.
const outText = makeElement({
    matchSelectors: ['span.selectable-text', '.selectable-text.copyable-text'],
    textContent: 'پیام ارسالی من'
});
const outMeta = makeElement({
    matchSelectors: ['[data-icon]'],
    textContent: '11:02 AM ✓✓'
});
const outgoingBubble = makeElement({
    matchSelectors: ['.message-out', '[data-testid="msg-container"]'],
    textContent: 'پیام ارسالی من 11:02 AM',
    children: [outText, outMeta]
});
registeredRecipe.applyToMessage(outgoingBubble, engine);
check('outgoing: message text leaf flipped', outText.getAttribute('dir'), 'rtl');
check('outgoing: message text leaf gets class', outText.classList.contains('rastchin-whatsapp-rtl'), true);
check('outgoing: timestamp/checkmark meta NOT flipped', outMeta.getAttribute('dir'), null);
check('outgoing: bubble container NOT modified', outgoingBubble.getAttribute('data-rastchin-whatsapp-rtl'), null);

// Voice notes / media / stickers / reactions live under svg / img / [data-icon]
// (HARD_CHROME_SELECTORS), so even Persian-labelled chrome inside a bubble must
// never be flipped.
const voiceNote = makeElement({
    matchSelectors: ['span.selectable-text'],
    textContent: 'پیام صوتی',
    children: []
});
voiceNote.parentElement = makeElement({ matchSelectors: ['svg'] });
check('media: voice-note text under <svg> is out of scope',
    registeredRecipe.isMessageElement(voiceNote), false);
registeredRecipe.applyToMessage(voiceNote, engine);
check('media: voice-note text not flipped', voiceNote.getAttribute('dir'), null);

const stickerImg = makeElement({
    matchSelectors: ['span.selectable-text'],
    textContent: 'استیکر'
});
stickerImg.parentElement = makeElement({ matchSelectors: ['img'] });
check('media: sticker/image text under <img> is out of scope',
    registeredRecipe.isMessageElement(stickerImg), false);
registeredRecipe.applyToMessage(stickerImg, engine);
check('media: sticker/image text not flipped', stickerImg.getAttribute('dir'), null);

const reaction = makeElement({
    matchSelectors: ['span.selectable-text'],
    textContent: 'واکنش'
});
reaction.parentElement = makeElement({ matchSelectors: ['[data-icon]'] });
check('media: reaction text under [data-icon] is out of scope',
    registeredRecipe.isMessageElement(reaction), false);
registeredRecipe.applyToMessage(reaction, engine);
check('media: reaction text not flipped', reaction.getAttribute('dir'), null);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
