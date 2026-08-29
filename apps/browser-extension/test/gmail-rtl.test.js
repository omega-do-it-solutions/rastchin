'use strict';
// Regression suite for Gmail's font-only recipe contract.
// Gmail must apply Vazirmatn to Persian text WITHOUT touching direction:
// no dir / direction / text-align is ever set (Gmail handles direction itself).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'gmail-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'mail.google.com' },
        getComputedStyle() {
            return { display: 'block', visibility: 'visible', contentVisibility: 'visible' };
        },
        __GMAIL_RTL_TEST__(api) { exported = api; }
    },
    document: {
        // cleanUpStyles() sweeps marked nodes via document.querySelectorAll; the
        // modifiedElements Set already covers our mock nodes, so an empty result
        // here is correct for the sandbox.
        querySelectorAll() { const out = []; out.forEach = Array.prototype.forEach.bind(out); return out; }
    },
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
    console.error('FATAL: Gmail recipe test hook did not run');
    process.exit(1);
}

// --- recipe contract ---
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'gmailEnabled');
check('recipe: host mail.google.com', registeredRecipe.hosts.includes('mail.google.com'), true);
check('recipe: single host only', registeredRecipe.hosts.length, 1);
check('recipe: no host suffixes', registeredRecipe.hostSuffixes, undefined);
check('recipe: list-row selector', registeredRecipe.messageSelectors.includes('.zA'), true);
check('recipe: message-body selector', registeredRecipe.messageSelectors.includes('.a3s'), true);
check('recipe: compose selector', registeredRecipe.messageSelectors.includes('.Am.Al.editable'), true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has isMessageElement', typeof registeredRecipe.isMessageElement, 'function');
check('recipe: has scoped code/out-of-scope guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: does not define RTL style overrides', registeredRecipe.rtlStyle, undefined);

// --- host gate ---
check('host: mail.google.com supported', exported.isSupportedHost('mail.google.com'), true);
check('host: bare google.com unsupported', exported.isSupportedHost('google.com'), false);
check('host: docs.google.com unsupported', exported.isSupportedHost('docs.google.com'), false);
check('host: unrelated host unsupported', exported.isSupportedHost('example.com'), false);
check('scope: exports out-of-scope selectors', exported.outOfScopeSelectors.includes('[role="navigation"]'), true);

// --- globalCss is font-only (the core Gmail requirement) ---
const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scope class for modified Gmail blocks', css.includes('rastchin-gmail-font'), true);
check('css: applies font-family', css.includes('font-family') && css.includes('!important'), true);
check('css: NEVER forces direction', /direction\s*:/.test(css), false);
check('css: NEVER forces text-align', /text-align\s*:/.test(css), false);
check('css: NEVER forces unicode-bidi', /unicode-bidi\s*:/.test(css), false);

// --- mock DOM helpers (mirror youtube harness style) ---
function makeClassList(el) {
    return {
        _set: new Set(),
        add(...names) { names.forEach(n => this._set.add(n)); el._classNames = Array.from(this._set); },
        remove(...names) { names.forEach(n => this._set.delete(n)); el._classNames = Array.from(this._set); },
        contains(name) { return this._set.has(name); }
    };
}

function makeElement(options) {
    const opts = options || {};
    const styleStore = new Map();
    const priorityStore = new Map();
    const attrs = new Map();
    const matchSet = new Set(opts.matchSelectors || []);
    const el = {
        _classNames: [],
        _children: opts.children || [],
        isConnected: true,
        hidden: false,
        textContent: opts.textContent || '',
        style: {
            setProperty(prop, value, priority) {
                styleStore.set(prop, value);
                priorityStore.set(prop, priority || '');
            },
            removeProperty(prop) { styleStore.delete(prop); priorityStore.delete(prop); },
            getPropertyValue(prop) { return styleStore.get(prop) || ''; },
            getPropertyPriority(prop) { return priorityStore.get(prop) || ''; }
        },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        setAttribute(name, value) { attrs.set(name, value); },
        removeAttribute(name) { attrs.delete(name); },
        matches(selector) { return matchSet.has(selector); },
        closest() { return null; },
        querySelectorAll(selector) {
            const out = (el._children || []).filter(c => c.matches && c.matches(selector));
            out.forEach = Array.prototype.forEach.bind(out);
            return out;
        }
    };
    el.classList = makeClassList(el);
    return el;
}

// Make the mock pass `instanceof HTMLElement`.
class HTMLElement {}
ctx.HTMLElement = HTMLElement;
function asHtmlElement(el) { Object.setPrototypeOf(el, HTMLElement.prototype); return el; }

// Engine stub: direction text is just the element's text.
const engine = { collectDirectionText(el) { return el.textContent || ''; } };

// --- isMessageElement on a Gmail message body ---
const bodyBlock = asHtmlElement(makeElement({ matchSelectors: ['.a3s'], textContent: 'سلام' }));
check('isMessageElement: message body matches', registeredRecipe.isMessageElement(bodyBlock), true);
const navEl = asHtmlElement(makeElement({ matchSelectors: ['.gb_T'], textContent: 'Inbox' }));
check('isMessageElement: chrome element ignored', registeredRecipe.isMessageElement(navEl), false);

// --- applyToMessage applies Vazirmatn to a Persian block but never flips direction ---
const persianTarget = asHtmlElement(makeElement({
    matchSelectors: ['p'],
    textContent: 'این یک ایمیل فارسی است'
}));
const persianBlock = asHtmlElement(makeElement({
    matchSelectors: ['.a3s'],
    textContent: 'این یک ایمیل فارسی است',
    children: [persianTarget]
}));
const handled = registeredRecipe.applyToMessage(persianBlock, engine);
check('applyToMessage: returns true (owns element)', handled, true);
check('applyToMessage: persian block gets Vazirmatn', persianBlock.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
check('applyToMessage: persian block marked', persianBlock.getAttribute('data-rastchin-gmail-font'), 'true');
check('applyToMessage: persian target gets Vazirmatn', persianTarget.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
// Font-only guarantees: no direction handling whatsoever.
check('applyToMessage: persian block no dir attribute', persianBlock.getAttribute('dir'), null);
check('applyToMessage: persian block no direction style', persianBlock.style.getPropertyValue('direction'), '');
check('applyToMessage: persian block no text-align style', persianBlock.style.getPropertyValue('text-align'), '');
check('applyToMessage: persian target no direction style', persianTarget.style.getPropertyValue('direction'), '');

// --- an English block is left untouched ---
const englishBlock = asHtmlElement(makeElement({
    matchSelectors: ['.a3s'],
    textContent: 'This is an English email'
}));
registeredRecipe.applyToMessage(englishBlock, engine);
check('applyToMessage: english block left untouched', englishBlock.getAttribute('data-rastchin-gmail-font'), null);
check('applyToMessage: english block no font-family', englishBlock.style.getPropertyValue('font-family'), '');

// --- onDisable restores ---
registeredRecipe.onDisable();
check('onDisable: persian block mark removed', persianBlock.getAttribute('data-rastchin-gmail-font'), null);
check('onDisable: persian block font-family cleared', persianBlock.style.getPropertyValue('font-family'), '');
check('onDisable: persian target font-family cleared', persianTarget.style.getPropertyValue('font-family'), '');

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
