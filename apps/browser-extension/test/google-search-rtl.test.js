'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'platforms', 'google-search-rtl.js'),
    'utf8'
);

let exported = null;
let registeredRecipe = null;
const documentListeners = {};
const documentMarkedElements = [];

class HTMLElement {}

function selectorParts(selector) {
    return String(selector || '').split(',').map(part => part.trim()).filter(Boolean);
}

function makeClassList() {
    const values = new Set();
    return {
        add(...names) { names.forEach(name => values.add(name)); },
        remove(...names) { names.forEach(name => values.delete(name)); },
        contains(name) { return values.has(name); }
    };
}

function makeElement(options = {}) {
    const attrs = new Map(Object.entries(options.attrs || {}));
    const matchSet = new Set(options.matchSelectors || []);
    const element = {
        tagName: options.tagName || 'DIV',
        isConnected: true,
        value: options.value,
        textContent: options.textContent || '',
        innerText: options.textContent || '',
        parentElement: null,
        childNodes: [],
        classList: makeClassList(),
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        matches(selector) {
            return selectorParts(selector).some(part => matchSet.has(part));
        },
        closest(selector) {
            const parts = selectorParts(selector);
            let current = element;
            while (current) {
                if (parts.some(part => current.matches(part))) return current;
                current = current.parentElement;
            }
            return null;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const found = [];
            const visit = node => {
                (node.childNodes || []).forEach(child => {
                    if (child.nodeType === 1 && child.matches(selector)) found.push(child);
                    if (child.nodeType === 1) visit(child);
                });
            };
            visit(element);
            found.forEach = Array.prototype.forEach.bind(found);
            return found;
        }
    };
    Object.setPrototypeOf(element, HTMLElement.prototype);
    (options.children || []).forEach(child => {
        child.parentElement = element;
        child.nodeType = 1;
        element.childNodes.push(child);
    });
    if (options.directText) {
        element.childNodes.unshift({ nodeType: 3, textContent: options.directText });
    }
    return element;
}

const documentMock = {
    addEventListener(type, listener, capture) {
        documentListeners[type] = { listener, capture };
    },
    removeEventListener(type, listener) {
        if (documentListeners[type]?.listener === listener) delete documentListeners[type];
    },
    querySelectorAll() {
        const result = [...documentMarkedElements];
        result.forEach = Array.prototype.forEach.bind(result);
        return result;
    }
};

const context = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'www.google.com' },
        __GOOGLE_SEARCH_RTL_TEST__(api) { exported = api; }
    },
    document: documentMock,
    HTMLElement,
    RastChinRecipe: {
        runPlatformRecipe(recipe) { registeredRecipe = recipe; }
    },
    console
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context);

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: Google Search recipe test hook did not run');
    process.exit(1);
}

const snapshots = new WeakMap();
const scheduled = [];
const engine = {
    stripLtrTokens(text) {
        return String(text || '')
            .replace(/https?:\/\/\S+/gu, ' ')
            .replace(/`[^`]*`/gu, ' ');
    },
    collectDirectionText(element) {
        return typeof element.value === 'string' ? element.value : (element.textContent || '');
    },
    applyRTL(element) {
        if (!snapshots.has(element)) snapshots.set(element, element.getAttribute('dir'));
        element.setAttribute('dir', 'rtl');
        element.classList.add('rastchin-google-search-rtl');
    },
    restoreElement(element) {
        if (!snapshots.has(element)) return;
        const original = snapshots.get(element);
        if (original === null) element.removeAttribute('dir');
        else element.setAttribute('dir', original);
        element.classList.remove('rastchin-google-search-rtl');
        snapshots.delete(element);
    },
    scheduleScan(element) { scheduled.push(element); }
};

// Recipe and host contract.
check('recipe: storage key', registeredRecipe.storageKey, 'googleSearchEnabled');
check('recipe: www.google.com host', registeredRecipe.hosts.includes('www.google.com'), true);
check('recipe: bare google.com host', registeredRecipe.hosts.includes('google.com'), true);
check('recipe: search textarea selector', registeredRecipe.messageSelectors.includes('textarea[name="q"]'), true);
check('recipe: result title selector', registeredRecipe.messageSelectors.includes('#search h3'), true);
check('recipe: AI Overview list selector', registeredRecipe.messageSelectors.includes('#Odp5De li'), true);
check('recipe: custom first-strong direction', typeof registeredRecipe.needsRTL, 'function');
check('recipe: input listener hook', typeof registeredRecipe.onEnable, 'function');
check('recipe: restoration hook', typeof registeredRecipe.onDisable, 'function');
check('recipe: inline DOM isolation disabled', registeredRecipe.inlineIsolate, false);
check('host: unrelated Google product excluded', exported.isSupportedHost('docs.google.com'), false);
check('host: arbitrary subdomain excluded', exported.isSupportedHost('maps.google.com'), false);

// Direction is based on the first strong letter after shared URL/code stripping.
check('direction: Persian-first is RTL', exported.startsWithRtlText('بهترین روش JavaScript', engine), true);
check('direction: English-first stays LTR', exported.startsWithRtlText('JavaScript و آموزش فارسی', engine), false);
check('direction: leading numbers do not hide Persian', exported.startsWithRtlText('۱۴۰۵ بهترین نتیجه', engine), true);
check('direction: URL before Persian is ignored', exported.startsWithRtlText('https://example.com راهنمای فارسی', engine), true);
check('direction: Persian URL alone stays LTR', exported.startsWithRtlText('https://example.com/راهنما', engine), false);

const searchRoot = makeElement({ matchSelectors: ['#search'] });
const persianTitle = makeElement({
    tagName: 'H3',
    matchSelectors: ['h3', '#search h3'],
    textContent: 'آموزش جاوااسکریپت'
});
persianTitle.parentElement = searchRoot;
check('scope: organic title recognized', exported.isGoogleSearchTextBlock(persianTitle), true);
registeredRecipe.applyToMessage(persianTitle, engine);
check('title: marked RTL', persianTitle.getAttribute('data-rastchin-google-search'), 'rtl');
check('title: dir applied', persianTitle.getAttribute('dir'), 'rtl');

const englishTitle = makeElement({
    tagName: 'H3',
    matchSelectors: ['h3', '#search h3'],
    textContent: 'JavaScript guide with متن فارسی'
});
englishTitle.parentElement = searchRoot;
registeredRecipe.applyToMessage(englishTitle, engine);
check('title: English-first remains unmarked', englishTitle.getAttribute('data-rastchin-google-search'), null);

// A dynamic content change must restore the original LTR state.
persianTitle.textContent = 'JavaScript documentation';
persianTitle.innerText = persianTitle.textContent;
registeredRecipe.applyToMessage(persianTitle, engine);
check('dynamic title: RTL mark removed', persianTitle.getAttribute('data-rastchin-google-search'), null);
check('dynamic title: original dir restored', persianTitle.getAttribute('dir'), null);

const aiRoot = makeElement({ matchSelectors: ['#Odp5De'] });
const aiParagraph = makeElement({
    directText: 'این پاسخ هوش مصنوعی دربارهٔ JavaScript است.',
    matchSelectors: ['div'],
    textContent: 'این پاسخ هوش مصنوعی دربارهٔ JavaScript است.'
});
aiParagraph.parentElement = aiRoot;
check('scope: AI leaf prose recognized', exported.isAiTextTarget(aiParagraph), true);
registeredRecipe.applyToMessage(aiParagraph, engine);
check('AI paragraph: marked RTL', aiParagraph.getAttribute('data-rastchin-google-search'), 'rtl');

const aiListItem = makeElement({
    tagName: 'LI',
    matchSelectors: ['li'],
    textContent: 'اولین نتیجهٔ فارسی'
});
aiListItem.parentElement = aiRoot;
registeredRecipe.applyToMessage(aiListItem, engine);
check('AI list: list item itself marked for right-side marker', aiListItem.classList.contains('rastchin-google-search-rtl'), true);

const nestedParagraph = makeElement({
    tagName: 'P',
    matchSelectors: ['p'],
    textContent: 'متن فارسی'
});
const aiLayout = makeElement({
    matchSelectors: ['div'],
    children: [nestedParagraph],
    textContent: 'متن فارسی'
});
aiLayout.parentElement = aiRoot;
check('scope: AI layout wrapper stays untouched', exported.isAiTextTarget(aiLayout), false);

const code = makeElement({
    tagName: 'CODE',
    matchSelectors: ['code'],
    textContent: 'متغیر فارسی'
});
code.parentElement = aiRoot;
check('scope: code is excluded', exported.isGoogleSearchTextBlock(code), false);

// Query editing schedules immediate rescans for both typing and IME completion.
const query = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea[name="q"]'],
    value: 'جستجوی فارسی'
});
registeredRecipe.onEnable(engine);
check('input: capture listener attached', documentListeners.input?.capture, true);
check('input: composition listener attached', documentListeners.compositionend?.capture, true);
documentListeners.input.listener({ target: query });
check('input: query scheduled for rescan', scheduled.at(-1), query);
registeredRecipe.applyToMessage(query, engine);
check('input: Persian query marked RTL', query.getAttribute('data-rastchin-google-search'), 'rtl');

// CSS is scoped and owns list-marker direction through the LI itself.
const css = registeredRecipe.globalCss();
check('css: embeds local Vazirmatn', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scoped RTL class', css.includes('.rastchin-google-search-rtl'), true);
check('css: right-side list marker rule', css.includes('li.rastchin-google-search-rtl'), true);
check('css: no whole-body direction override', /body\s*\{/.test(css), false);

documentMarkedElements.push(query);
registeredRecipe.onDisable(engine);
check('disable: input listener removed', documentListeners.input, undefined);
check('disable: composition listener removed', documentListeners.compositionend, undefined);
check('disable: query mark removed', query.getAttribute('data-rastchin-google-search'), null);
check('disable: AI paragraph mark removed', aiParagraph.getAttribute('data-rastchin-google-search'), null);
check('disable: list item mark removed', aiListItem.getAttribute('data-rastchin-google-search'), null);

if (failures === 0) {
    console.log(`ALL PASS (${total} Google Search RTL checks)`);
} else {
    console.error(`${failures} FAILED of ${total}`);
    process.exit(1);
}
