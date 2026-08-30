'use strict';
// Regression suite for Visual Studio Marketplace item-description support.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'visual-studio-marketplace-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

class HTMLElement {}

function makeClassList() {
    const values = new Set();
    return {
        add(...names) { names.forEach(name => values.add(name)); },
        remove(...names) { names.forEach(name => values.delete(name)); },
        contains(name) { return values.has(name); }
    };
}

function makeElement(options = {}) {
    const styleValues = new Map();
    const stylePriorities = new Map();
    const attrs = new Map(Object.entries(options.attrs || {}));
    const matchSelectors = new Set(options.matchSelectors || []);
    const element = Object.assign(new HTMLElement(), {
        tagName: String(options.tagName || 'DIV').toUpperCase(),
        isConnected: true,
        hidden: false,
        textContent: options.textContent || '',
        children: options.children || [],
        style: {
            setProperty(property, value, priority) {
                styleValues.set(property, value);
                stylePriorities.set(property, priority || '');
            },
            removeProperty(property) {
                styleValues.delete(property);
                stylePriorities.delete(property);
            },
            getPropertyValue(property) { return styleValues.get(property) || ''; },
            getPropertyPriority(property) { return stylePriorities.get(property) || ''; }
        },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        matches(selector) { return matchSelectors.has(selector); },
        closest(selectorList) {
            const selectors = String(selectorList).split(',').map(value => value.trim());
            return selectors.some(selector => matchSelectors.has(selector)) ? element : null;
        },
        querySelectorAll(selector) {
            const result = (element.children || []).filter(child => child.matches?.(selector));
            result.forEach = Array.prototype.forEach.bind(result);
            return result;
        }
    });
    element.classList = makeClassList();
    return element;
}

const ctx = {
    HTMLElement,
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'marketplace.visualstudio.com' },
        getComputedStyle() {
            return { display: 'block', visibility: 'visible', contentVisibility: 'visible' };
        },
        __VS_MARKETPLACE_RTL_TEST__(api) { exported = api; }
    },
    document: {
        querySelectorAll() {
            const result = [];
            result.forEach = Array.prototype.forEach.bind(result);
            return result;
        }
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
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: Visual Studio Marketplace recipe test hook did not run');
    process.exit(1);
}

const engine = {
    isolated: [],
    cleared: [],
    collectDirectionText(element) { return element.textContent || ''; },
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    isolateInline(element) { this.isolated.push(element); },
    clearInline(element) { this.cleared.push(element); }
};

// Recipe and live Marketplace structure contract.
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'vsMarketplaceEnabled');
check('recipe: exact Marketplace host', registeredRecipe.hosts.join(','), 'marketplace.visualstudio.com');
check('recipe: inline bidi isolation enabled', registeredRecipe.inlineIsolate, true);
check('recipe: custom content handler', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('scope: live Overview Markdown selector included',
    exported.contentRootSelectors.includes('#overviewTab .details-tab.itemdetails .markdown'), true);
check('scope: item short description included',
    exported.contentRootSelectors.includes('.item-details-control-root .ux-item-shortdesc'), true);
check('scope: dynamically loaded version history included',
    exported.contentRootSelectors.includes('#version-history-tab-content .markdown'), true);
check('guard: inline code protected', exported.codeGuardSelectors.includes('code'), true);
check('guard: preformatted code protected', exported.codeGuardSelectors.includes('pre'), true);
check('guard: install command protected', exported.codeGuardSelectors.includes('.vscode-command-input'), true);

const persianParagraph = makeElement({
    tagName: 'P',
    matchSelectors: ['p'],
    textContent: 'راست‌چین فقط برای زبان فارسی طراحی شده است'
});
const mixedHeading = makeElement({
    tagName: 'H2',
    matchSelectors: ['h2'],
    textContent: 'Update و بازیابی'
});
const englishParagraph = makeElement({
    tagName: 'P',
    matchSelectors: ['p'],
    textContent: 'English-only Marketplace copy'
});
const codeBlock = makeElement({
    tagName: 'PRE',
    matchSelectors: ['pre'],
    textContent: 'RastChin for VS Code: Disable / Restore Patches'
});
const overview = makeElement({
    matchSelectors: ['#overviewTab .details-tab.itemdetails .markdown'],
    textContent: 'راست‌چین فقط برای زبان فارسی طراحی شده است Update و بازیابی English-only Marketplace copy',
    children: [persianParagraph, mixedHeading, englishParagraph, codeBlock]
});

check('overview: live Markdown root recognised', exported.isContentRoot(overview), true);
check('overview: code block classified as protected', exported.isCodeLike(codeBlock), true);
registeredRecipe.applyToMessage(overview, engine);
check('overview: Persian paragraph becomes RTL', persianParagraph.getAttribute('dir'), 'rtl');
check('overview: Persian paragraph aligns right', persianParagraph.style.getPropertyValue('text-align'), 'right');
check('overview: Persian paragraph uses Vazirmatn', persianParagraph.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
check('overview: mixed Persian heading becomes RTL', mixedHeading.getAttribute('dir'), 'rtl');
check('overview: English paragraph remains untouched', englishParagraph.getAttribute('dir'), null);
check('overview: preformatted command remains untouched', codeBlock.getAttribute('dir'), null);

const shortDescription = makeElement({
    matchSelectors: ['.item-details-control-root .ux-item-shortdesc'],
    textContent: 'افزونه‌ای برای خوانایی بهتر فارسی'
});
check('short description: recognised as content root', exported.isContentRoot(shortDescription), true);
registeredRecipe.applyToMessage(shortDescription, engine);
check('short description: direct text becomes RTL', shortDescription.getAttribute('dir'), 'rtl');
check('short description: Vazirmatn applied', shortDescription.style.getPropertyValue('font-family').includes('Vazirmatn'), true);

registeredRecipe.onDisable(engine);
check('cleanup: paragraph direction restored', persianParagraph.getAttribute('dir'), null);
check('cleanup: heading direction restored', mixedHeading.getAttribute('dir'), null);
check('cleanup: short description restored', shortDescription.getAttribute('dir'), null);

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: guarded code forced LTR', /code, pre[\s\S]*direction:\s*ltr !important/.test(css), true);
check('css: modified Marketplace text forced RTL',
    css.includes('.rastchin-vs-marketplace-rtl') && css.includes('direction: rtl !important'), true);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
