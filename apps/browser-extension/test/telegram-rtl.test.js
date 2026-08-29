'use strict';
// Focused regression suite for Telegram Web's scoped RTL recipe.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'telegram-rtl.js');
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
        location: { hostname: 'web.telegram.org' },
        getComputedStyle(element) {
            return element?._computedStyle || {
                display: 'block',
                visibility: 'visible',
                contentVisibility: 'visible',
                flexDirection: 'column'
            };
        },
        __TELEGRAM_RTL_TEST__(api) { exported = api; }
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
    console.error('FATAL: Telegram recipe test hook did not run');
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
check('recipe: storage key', registeredRecipe.storageKey, 'telegramEnabled');
check('recipe: host web.telegram.org', registeredRecipe.hosts.includes('web.telegram.org'), true);
check('recipe: single host only', registeredRecipe.hosts.length, 1);
check('recipe: message container selector', registeredRecipe.messageSelectors.includes('.Message'), true);
check('recipe: message text selector', registeredRecipe.messageSelectors.includes('.Message .text-content'), true);
check('recipe: composer selector', registeredRecipe.messageSelectors.includes('#editable-message-text'), true);
check('recipe: search selector', registeredRecipe.messageSelectors.includes('input[placeholder*="Search"]'), true);
check('recipe: scoped chat-list selector', registeredRecipe.messageSelectors.includes('.chatlist .title'), true);
check('recipe: no bare title selector', registeredRecipe.messageSelectors.includes('.title'), false);
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

check('host: web.telegram.org supported', exported.isSupportedHost('web.telegram.org'), true);
check('host: telegram.org unsupported', exported.isSupportedHost('telegram.org'), false);
check('host: unrelated unsupported', exported.isSupportedHost('example.com'), false);

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scope class present', css.includes('rastchin-telegram-rtl'), true);
check('css: code guard stays LTR', /direction:\s*ltr\s*!important/.test(css), true);
check('css: does not target whole body', /body\s*\{/.test(css), false);

// --- scoped spacing + font-size on message text only -------------------------
// The metadata-overlap fix and the one-step font-size reduction must land on the
// marked message-text leaf only, never on chat-list rows or the .time/views/
// reaction chrome. globalCss takes no args for this recipe; call it bare.
const scopedCss = registeredRecipe.globalCss();
const messageScope = exported.messageTextScopeSelectors;
check('css: exposes message-text scope selectors', Array.isArray(messageScope) && messageScope.length > 0, true);
check('css: scope selectors qualify the leaf with the marker class',
    messageScope.every(sel => sel.endsWith('.rastchin-telegram-rtl')), true);
check('css: K bubble message leaf in scope',
    messageScope.includes('.bubble .message.rastchin-telegram-rtl'), true);
check('css: A/Z text-content leaf in scope',
    messageScope.includes('.Message .text-content.rastchin-telegram-rtl'), true);
check('css: A/Z message-text leaf in scope',
    messageScope.includes('.Message .message-text.rastchin-telegram-rtl'), true);

// Spacing (gap) is added on the marked message-text scope, with reserved
// padding-bottom and trailing inline padding.
check('css: scoped block carries padding-bottom',
    /\.message\.rastchin-telegram-rtl[^{]*\{[^}]*padding-bottom/.test(scopedCss)
        || /\.text-content\.rastchin-telegram-rtl[^{]*\{[^}]*padding-bottom/.test(scopedCss), true);
check('css: scoped block reserves trailing inline space',
    /padding-inline-end/.test(scopedCss), true);

// Font-size reduction is scoped to message-text contexts, NOT the bare marker
// class (which is also on chat-list rows) and NOT to .time/views/reactions.
check('css: scoped block reduces font-size', /font-size:\s*0?\.9\d+em/.test(scopedCss), true);
// Bare marker class = preceded by whitespace/start, immediately followed by `{`
// (no other compound token in between). It must NOT carry a font-size, or the
// chat-list rows (same class) would shrink too.
check('css: no font-size on bare marker class (would shrink chat list)',
    /(?:^|\s)\.rastchin-telegram-rtl\s*\{[^}]*font-size/m.test(scopedCss), false);
check('css: no font-size on .time node', /\.time[^{,]*\{[^}]*font-size/.test(scopedCss), false);
check('css: no padding on .time node', /\.time[^{,]*\{[^}]*padding/.test(scopedCss), false);
// No CSS rule may be keyed on a reaction/views selector at all — those nodes are
// chrome and must keep native size/spacing. The scoped rules only ever name
// message-text leaves (.message / .text-content / .message-text). Strip CSS
// comments first so explanatory prose does not trip the selector check.
const scopedCssNoComments = scopedCss.replace(/\/\*[\s\S]*?\*\//g, '');
check('css: no rule keyed on a reaction selector', /reaction/i.test(scopedCssNoComments), false);
check('css: no rule keyed on a views selector', /\bviews?\b/i.test(scopedCssNoComments), false);

// --- channel post: text marked, time / views / reactions untouched -----------
// A channel post bundles the body text with a reactions row and a views/time
// footer. Only the text leaf may be marked + resized; chrome stays put.
const channelText = makeElement({
    matchSelectors: ['.bubble .message'],
    textContent: 'این یک پست کانال است'
});
const channelReactions = makeElement({
    matchSelectors: ['.reactions'],
    textContent: '12'
});
const channelViews = makeElement({
    matchSelectors: ['.time'],
    textContent: '1.2K  18:00'
});
const channelPost = makeElement({
    matchSelectors: ['.bubble'],
    textContent: 'این یک پست کانال است 1.2K 18:00',
    children: [channelText, channelReactions, channelViews]
});
check('channel: post bubble is a text block', registeredRecipe.isMessageElement(channelPost), true);
check('channel: only text leaf found as target', exported.getTextTargets(channelPost).includes(channelText), true);
check('channel: reactions not a target', exported.getTextTargets(channelPost).includes(channelReactions), false);
check('channel: views/time not a target', exported.getTextTargets(channelPost).includes(channelViews), false);
registeredRecipe.applyToMessage(channelPost, engine);
check('channel: text leaf marked rtl', channelText.getAttribute('dir'), 'rtl');
check('channel: text leaf gets class', channelText.classList.contains('rastchin-telegram-rtl'), true);
check('channel: reactions NOT marked', channelReactions.classList.contains('rastchin-telegram-rtl'), false);
check('channel: reactions dir untouched', channelReactions.getAttribute('dir'), null);
check('channel: views/time NOT marked', channelViews.classList.contains('rastchin-telegram-rtl'), false);
check('channel: views/time dir untouched', channelViews.getAttribute('dir'), null);
// No inline font-size is ever written by applyRTL (size comes from scoped CSS).
check('channel: no inline font-size on text leaf', channelText.style.getPropertyValue('font-size'), '');
check('channel: no inline font-size on views/time', channelViews.style.getPropertyValue('font-size'), '');

// --- normal bubble: Persian text + time --------------------------------------
const normalText = makeElement({
    matchSelectors: ['.bubble .message'],
    textContent: 'سلام، حالت چطوره؟'
});
const normalTime = makeElement({
    matchSelectors: ['.time'],
    textContent: '09:14'
});
const normalBubble = makeElement({
    matchSelectors: ['.bubble'],
    textContent: 'سلام، حالت چطوره؟ 09:14',
    children: [normalText, normalTime]
});
registeredRecipe.applyToMessage(normalBubble, engine);
check('normal: K .bubble .message recognized as text target',
    exported.getTextTargets(normalBubble).includes(normalText), true);
check('normal: text leaf marked rtl', normalText.getAttribute('dir'), 'rtl');
check('normal: .time not marked rtl', normalTime.getAttribute('dir'), null);
check('normal: .time has no marker class', normalTime.classList.contains('rastchin-telegram-rtl'), false);
check('normal: .time no inline font-size', normalTime.style.getPropertyValue('font-size'), '');

// A/Z .text-content leaf is recognized as a message text target.
const azText = makeElement({
    matchSelectors: ['.Message .text-content'],
    textContent: 'متن پیام در نسخه A'
});
const azMessage = makeElement({
    matchSelectors: ['.Message'],
    textContent: 'متن پیام در نسخه A',
    children: [azText]
});
check('A/Z: .Message .text-content recognized as text target',
    exported.getTextTargets(azMessage).includes(azText), true);

// A standalone .time node is never a text target and never marked.
const loneTime = makeElement({ matchSelectors: ['.time'], textContent: '23:59' });
check('time: standalone .time is not a text block', registeredRecipe.isMessageElement(loneTime), false);
check('time: standalone .time yields no targets', exported.getTextTargets(loneTime).length, 0);
registeredRecipe.applyToMessage(loneTime, engine);
check('time: standalone .time not marked', loneTime.getAttribute('dir'), null);

// --- message bubble: target leaf only, not app chrome -------------------------
const messageText = makeElement({
    matchSelectors: ['.Message .text-content'],
    textContent: 'سلام از تلگرام Web'
});
const messageBubble = makeElement({
    matchSelectors: ['.Message'],
    textContent: 'سلام از تلگرام Web',
    children: [messageText]
});
check('isMessageElement: message bubble matches', registeredRecipe.isMessageElement(messageBubble), true);
check('targets: finds message leaf', exported.getTextTargets(messageBubble).includes(messageText), true);
registeredRecipe.applyToMessage(messageBubble, engine);
check('apply: message leaf gets dir rtl', messageText.getAttribute('dir'), 'rtl');
check('apply: message leaf gets class', messageText.classList.contains('rastchin-telegram-rtl'), true);
check('apply: message leaf gets Vazirmatn', messageText.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
check('apply: message container not modified', messageBubble.getAttribute('data-rastchin-telegram-rtl'), null);

const toolbar = makeElement({
    matchSelectors: ['[role="toolbar"]'],
    textContent: 'سلام',
    children: [makeElement({
        matchSelectors: ['.Message .text-content'],
        textContent: 'سلام'
    })]
});
const toolbarText = toolbar._children[0];
check('scope: toolbar text target is ignored', registeredRecipe.isMessageElement(toolbarText), false);

// --- composer/search/list targets -------------------------------------------
const composer = makeElement({
    matchSelectors: ['#editable-message-text'],
    textContent: 'پیام فارسی برای ارسال'
});
check('isMessageElement: composer matches', registeredRecipe.isMessageElement(composer), true);
registeredRecipe.applyToMessage(composer, engine);
check('apply: composer gets rtl', composer.getAttribute('dir'), 'rtl');

const search = makeElement({
    tagName: 'INPUT',
    matchSelectors: ['input[placeholder*="Search"]'],
    value: 'گفتگو',
    textContent: ''
});
registeredRecipe.applyToMessage(search, engine);
check('apply: search input value gets rtl', search.getAttribute('dir'), 'rtl');

const listButton = makeElement({
    matchSelectors: ['[role="button"]'],
    textContent: 'مریم',
    children: [makeElement({
        matchSelectors: ['.chatlist .title'],
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
check('restore: English chat-list title removes class', chatTitle.classList.contains('rastchin-telegram-rtl'), false);

// --- K layout (web.telegram.org/k, tweb) coverage ----------------------------
// In the K client, the bubble's `.message` element holds the text directly
// (no `.text-content` wrapper) alongside a `.time` timestamp child.
check('recipe: K bubble message text selector', registeredRecipe.messageSelectors.includes('.bubble .message'), true);
check('recipe: K peer-title chat-list selector', registeredRecipe.messageSelectors.includes('.chatlist .peer-title'), true);
check('recipe: K dialog-title chat-list selector', registeredRecipe.messageSelectors.includes('.chatlist .dialog-title'), true);
check('recipe: A/Z .Chat title selector', registeredRecipe.messageSelectors.includes('.Chat .title'), true);

const kBubbleText = makeElement({
    matchSelectors: ['.bubble .message'],
    textContent: 'سلام دوست من'
});
const kTimestamp = makeElement({
    matchSelectors: ['.time'],
    textContent: '12:30'
});
const kBubble = makeElement({
    matchSelectors: ['.bubble'],
    textContent: 'سلام دوست من 12:30',
    children: [kBubbleText, kTimestamp]
});
check('K: bubble matches text block', registeredRecipe.isMessageElement(kBubble), true);
check('K: finds .message leaf', exported.getTextTargets(kBubble).includes(kBubbleText), true);
registeredRecipe.applyToMessage(kBubble, engine);
check('K: .message leaf gets rtl', kBubbleText.getAttribute('dir'), 'rtl');
check('K: timestamp NOT flipped', kTimestamp.getAttribute('dir'), null);
check('K: timestamp keeps no rtl class', kTimestamp.classList.contains('rastchin-telegram-rtl'), false);

const kPeerTitle = makeElement({
    matchSelectors: ['.chatlist .peer-title'],
    textContent: 'گروه خانواده'
});
const kChatRow = makeElement({
    matchSelectors: ['.chatlist-chat'],
    textContent: 'گروه خانواده',
    children: [kPeerTitle]
});
check('K: chatlist peer-title is targetable', registeredRecipe.isMessageElement(kPeerTitle), true);
// The engine collects message-elements directly (isMessageElement walk), so the
// peer-title leaf is handed to applyToMessage on its own, exactly like A/Z titles.
registeredRecipe.applyToMessage(kPeerTitle, engine);
check('K: peer-title gets rtl', kPeerTitle.getAttribute('dir'), 'rtl');

// --- chrome must NOT be flipped ----------------------------------------------
// Buttons, icons, header and menu items carry no message/text selector, so
// even Persian-looking labels inside them must be left untouched.
const iconLabel = makeElement({
    matchSelectors: ['[data-icon]'],
    textContent: 'فرستادن'
});
check('chrome: icon label is not a text block', registeredRecipe.isMessageElement(iconLabel), false);
registeredRecipe.applyToMessage(iconLabel, engine);
check('chrome: icon label not flipped', iconLabel.getAttribute('dir'), null);

const menuItem = makeElement({
    matchSelectors: ['[role="menuitem"]'],
    textContent: 'حذف پیام',
    children: [makeElement({ matchSelectors: ['.Message .text-content'], textContent: 'حذف پیام' })]
});
const menuItemText = menuItem._children[0];
check('chrome: text under menuitem is out of scope', registeredRecipe.isMessageElement(menuItemText), false);
registeredRecipe.applyToMessage(menuItem, engine);
check('chrome: menuitem text not flipped', menuItemText.getAttribute('dir'), null);

const plainButton = makeElement({
    matchSelectors: ['button'],
    textContent: 'ارسال',
    children: [makeElement({ matchSelectors: ['.message .text-content'], textContent: 'ارسال' })]
});
const buttonText = plainButton._children[0];
check('chrome: text under button is out of scope', registeredRecipe.isMessageElement(buttonText), false);

// Dead-CSS regression: globalCss must emit a real code-guard selector even when
// recipe-runner passes an empty codeGuard arg (recipe sets excludeSelectors, not
// codeGuardSelectors, so the arg is '').
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

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
