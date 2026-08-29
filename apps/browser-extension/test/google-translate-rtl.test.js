'use strict';
// Regression suite for Google Translate's scoped RTL recipe.
// The contract is leaf-level: Persian source/target text gets RTL + Vazirmatn,
// but Google Translate chrome and English panels must not be flipped.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'google-translate-rtl.js');
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
        location: { hostname: 'translate.google.com' },
        getComputedStyle(element) {
            return element?._computedStyle || {
                display: 'block',
                visibility: 'visible',
                contentVisibility: 'visible',
                flexDirection: 'row'
            };
        },
        __GOOGLE_TRANSLATE_RTL_TEST__(api) { exported = api; }
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
    console.error('FATAL: Google Translate recipe test hook did not run');
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
        direction: '',
        textAlign: '',
        unicodeBidi: '',
        setProperty(prop, value, priority) {
            store.set(prop, value);
            priorities.set(prop, priority || '');
        },
        removeProperty(prop) { store.delete(prop); priorities.delete(prop); },
        getPropertyValue(prop) {
            if (prop === 'direction') return this.direction || store.get(prop) || '';
            if (prop === 'text-align') return this.textAlign || store.get(prop) || '';
            if (prop === 'unicode-bidi') return this.unicodeBidi || store.get(prop) || '';
            return store.get(prop) || '';
        },
        getPropertyPriority(prop) { return priorities.get(prop) || ''; }
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
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.unicodeBidi = 'plaintext';
    },
    restoreElement(element) {
        element.removeAttribute('dir');
        element.style.direction = '';
        element.style.textAlign = '';
        element.style.unicodeBidi = '';
    }
};

function makeStatefulEngine(rtlClass) {
    const snapshots = new WeakMap();
    return {
        ...engine,
        applyRTL(element) {
            if (!snapshots.has(element)) {
                snapshots.set(element, {
                    dir: element.getAttribute('dir'),
                    direction: element.style.getPropertyValue('direction'),
                    textAlign: element.style.getPropertyValue('text-align'),
                    unicodeBidi: element.style.getPropertyValue('unicode-bidi'),
                    hadRtlClass: element.classList.contains(rtlClass)
                });
            }
            engine.applyRTL(element);
            element.classList.add(rtlClass);
        },
        restoreElement(element) {
            const snapshot = snapshots.get(element);
            if (!snapshot) return;
            if (snapshot.dir === null) element.removeAttribute('dir');
            else element.setAttribute('dir', snapshot.dir);
            element.style.direction = snapshot.direction;
            element.style.textAlign = snapshot.textAlign;
            element.style.unicodeBidi = snapshot.unicodeBidi;
            if (snapshot.hadRtlClass) element.classList.add(rtlClass);
            else element.classList.remove(rtlClass);
            snapshots.delete(element);
        }
    };
}

// --- recipe contract ---------------------------------------------------------
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'googleTranslateEnabled');
check('recipe: host translate.google.com', registeredRecipe.hosts.includes('translate.google.com'), true);
check('recipe: single host only', registeredRecipe.hosts.length, 1);
check('recipe: textarea selector', registeredRecipe.messageSelectors.includes('textarea[aria-label]'), true);
check('recipe: output span selector', registeredRecipe.messageSelectors.includes('.ryNqvb'), true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has scoped code/out-of-scope guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: has input rescan hook', typeof registeredRecipe.onEnable, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: inline isolation disabled for Google Translate performance', registeredRecipe.inlineIsolate, false);
check('recipe: characterData observer disabled for Google Translate performance', registeredRecipe.observeCharacterData, false);
check('recipe: rtlRegex ignores English output', registeredRecipe.rtlRegex.test('Strategic brief and English output'), false);
check('recipe: rtlRegex detects Persian text', registeredRecipe.rtlRegex.test('متن فارسی'), true);
check('recipe: excludes code', registeredRecipe.excludeSelectors.includes('code'), true);
check('recipe: excludes pre', registeredRecipe.excludeSelectors.includes('pre'), true);
check('recipe: guards buttons', exported.outOfScopeSelectors.includes('button'), true);
check('recipe: guards language tabs', exported.outOfScopeSelectors.includes('[role="tab"]'), true);
check('recipe: guards tab lists', exported.outOfScopeSelectors.includes('[role="tablist"]'), true);
check('recipe: guards toolbar', exported.outOfScopeSelectors.includes('[role="toolbar"]'), true);
check('recipe: guards swap control', exported.outOfScopeSelectors.includes('[aria-label*="Swap languages"]'), true);
check('recipe: guards copy control', exported.outOfScopeSelectors.includes('[aria-label*="Copy translation"]'), true);
check('recipe: does not replace live text nodes', source.includes('replaceChild'), false);
check('recipe: generic paragraphs are not broad text targets', exported.textTargetSelectors.includes('p'), false);
check('recipe: generic spans are not broad text targets', exported.textTargetSelectors.includes('span'), false);

check('host: translate.google.com supported', exported.isSupportedHost('translate.google.com'), true);
check('host: docs.google.com unsupported', exported.isSupportedHost('docs.google.com'), false);
check('host: google.com unsupported', exported.isSupportedHost('google.com'), false);

const genericWrapper = makeElement({
    tagName: 'DIV',
    textContent: 'متن فارسی داخل wrapper عمومی',
    children: [makeElement({
        tagName: 'SPAN',
        matchSelectors: ['.ryNqvb'],
        textContent: 'متن فارسی داخل wrapper عمومی'
    })]
});
check('isMessageElement: generic wrapper with text target is not a broad candidate', registeredRecipe.isMessageElement(genericWrapper), false);

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scope class for modified text', css.includes('rastchin-google-translate-rtl'), true);
check('css: forces RTL only on modified class', css.includes('.rastchin-google-translate-rtl') && css.includes('direction: rtl'), true);
check('css: does not target whole body', /body\s*\{/.test(css), false);
check('css: does not override Google Translate font-size', /font-size\s*:/i.test(css), false);
check('css: does not use font metric adjustment on Google Translate', /size-adjust\s*:/i.test(css), false);

// --- source textarea: Persian text gets RTL + font ---------------------------
const sourceText = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea[aria-label]'],
    value: 'سلام، این متن برای ترجمه است. STRATEGIC_BRIEF',
    textContent: ''
});
check('isMessageElement: source textarea matches', registeredRecipe.isMessageElement(sourceText), true);
registeredRecipe.applyToMessage(sourceText, engine);
check('apply: Persian source gets dir rtl', sourceText.getAttribute('dir'), 'rtl');
check('apply: Persian source text-align right', sourceText.style.getPropertyValue('text-align'), 'right');
check('apply: Persian source unicode-bidi plaintext', sourceText.style.getPropertyValue('unicode-bidi'), 'plaintext');
check('apply: Persian source gets Vazirmatn', sourceText.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
check('apply: Persian source marked', sourceText.getAttribute('data-rastchin-google-translate'), 'true');

const repeatedSourceText = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea[aria-label]'],
    value: 'این متن فارسی در حال تایپ است.',
    textContent: ''
});
let repeatedApplyCount = 0;
let repeatedNeedsCount = 0;
const countingEngine = {
    ...engine,
    needsRTL(text) {
        repeatedNeedsCount += 1;
        return engine.needsRTL(text);
    },
    applyRTL(element) {
        repeatedApplyCount += 1;
        engine.applyRTL(element);
    }
};
registeredRecipe.applyToMessage(repeatedSourceText, countingEngine);
repeatedSourceText.value = 'این متن فارسی در حال تایپ است و ادامه دارد.';
registeredRecipe.applyToMessage(repeatedSourceText, countingEngine);
registeredRecipe.applyToMessage(repeatedSourceText, countingEngine);
check('perf: repeated Persian source input does not rewrite RTL styles', repeatedApplyCount, 1);
check('perf: unchanged Persian source input reuses direction decision', repeatedNeedsCount, 2);
check('perf: repeated Persian source remains marked', repeatedSourceText.getAttribute('data-rastchin-google-translate'), 'true');

const sourceLanguageSwitch = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea[aria-label]'],
    value: 'این متن اول فارسی است.',
    textContent: ''
});
const statefulEngine = makeStatefulEngine(registeredRecipe.rtlClass);
registeredRecipe.applyToMessage(sourceLanguageSwitch, statefulEngine);
check('apply: language-switch source starts RTL', sourceLanguageSwitch.getAttribute('dir'), 'rtl');
check('apply: language-switch source starts marked', sourceLanguageSwitch.getAttribute('data-rastchin-google-translate'), 'true');
check('apply: language-switch source starts with rtl class', sourceLanguageSwitch.classList.contains('rastchin-google-translate-rtl'), true);
sourceLanguageSwitch.value = 'This source box is now English only.';
registeredRecipe.applyToMessage(sourceLanguageSwitch, statefulEngine);
check('restore: English-only source removes mark', sourceLanguageSwitch.getAttribute('data-rastchin-google-translate'), null);
check('restore: English-only source removes dir', sourceLanguageSwitch.getAttribute('dir'), null);
check('restore: English-only source removes text-align', sourceLanguageSwitch.style.getPropertyValue('text-align'), '');
check('restore: English-only source removes font', sourceLanguageSwitch.style.getPropertyValue('font-family'), '');
check('restore: English-only source removes rtl class', sourceLanguageSwitch.classList.contains('rastchin-google-translate-rtl'), false);

const sourceClear = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea[aria-label]'],
    value: 'این متن بعداً پاک می‌شود.',
    textContent: ''
});
registeredRecipe.applyToMessage(sourceClear, statefulEngine);
check('apply: clear source starts RTL', sourceClear.getAttribute('dir'), 'rtl');
sourceClear.value = '';
registeredRecipe.applyToMessage(sourceClear, statefulEngine);
check('restore: empty source removes mark', sourceClear.getAttribute('data-rastchin-google-translate'), null);
check('restore: empty source removes dir', sourceClear.getAttribute('dir'), null);
check('restore: empty source removes rtl class', sourceClear.classList.contains('rastchin-google-translate-rtl'), false);

let scheduledInputTarget = null;
registeredRecipe.onEnable({ ...engine, scheduleScan(element) { scheduledInputTarget = element; } });
check('onEnable: input listener registered in capture phase', documentListeners.input?.capture, true);
documentListeners.input.listener({ target: sourceText });
check('onEnable: input listener rescans edited textarea', scheduledInputTarget, sourceText);
sourceText.value = '';
scheduledInputTarget = null;
documentListeners.input.listener({ target: sourceText });
check('onEnable: input listener rescans modified textarea after clear', scheduledInputTarget, sourceText);
scheduledInputTarget = null;
documentListeners.input.listener({ target: makeElement({
    tagName: 'SPAN',
    matchSelectors: ['.ryNqvb'],
    textContent: 'متن خروجی فارسی'
}) });
check('onEnable: input listener ignores non-editable text nodes', scheduledInputTarget, null);

// --- English panel: no Persian signal, no style ------------------------------
const englishOutput = makeElement({
    tagName: 'SPAN',
    matchSelectors: ['.ryNqvb'],
    textContent: 'STRATEGIC BRIEF - English summary and dates'
});
registeredRecipe.applyToMessage(englishOutput, engine);
check('apply: English output not marked', englishOutput.getAttribute('data-rastchin-google-translate'), null);
check('apply: English output no dir', englishOutput.getAttribute('dir'), null);
check('apply: English output no font', englishOutput.style.getPropertyValue('font-family'), '');

// --- mixed layout container: do not flip the two-column parent ----------------
const persianLeaf = makeElement({
    tagName: 'SPAN',
    matchSelectors: ['.ryNqvb'],
    textContent: 'متن فارسی سمت چپ'
});
const englishLeaf = makeElement({
    tagName: 'SPAN',
    matchSelectors: ['.ryNqvb'],
    textContent: 'English target panel'
});
const twoColumnParent = makeElement({
    tagName: 'DIV',
    matchSelectors: ['[data-language-for-alternatives]'],
    textContent: 'متن فارسی سمت چپ English target panel',
    computedStyle: {
        display: 'flex',
        visibility: 'visible',
        contentVisibility: 'visible',
        flexDirection: 'row'
    },
    children: [persianLeaf, englishLeaf]
});
registeredRecipe.applyToMessage(twoColumnParent, engine);
check('apply: two-column parent not flipped', twoColumnParent.getAttribute('dir'), null);
check('apply: Persian child in mixed parent flips', persianLeaf.getAttribute('dir'), 'rtl');
check('apply: English child in mixed parent stays LTR', englishLeaf.getAttribute('dir'), null);

// --- Google chrome/toolbar: Persian label inside a button remains untouched ---
const toolbarText = makeElement({
    tagName: 'SPAN',
    matchSelectors: ['.ryNqvb'],
    textContent: 'فارسی'
});
const toolbarButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button'],
    textContent: 'فارسی',
    children: [toolbarText]
});
check('isMessageElement: toolbar button ignored', registeredRecipe.isMessageElement(toolbarButton), false);
check('isMessageElement: text inside toolbar button ignored', registeredRecipe.isMessageElement(toolbarText), false);
registeredRecipe.applyToMessage(toolbarText, engine);
check('apply: toolbar text not marked', toolbarText.getAttribute('data-rastchin-google-translate'), null);
check('apply: toolbar text no dir', toolbarText.getAttribute('dir'), null);

// --- disable restores modified elements --------------------------------------
registeredRecipe.onDisable(engine);
check('onDisable: source mark removed', sourceText.getAttribute('data-rastchin-google-translate'), null);
check('onDisable: source dir removed', sourceText.getAttribute('dir'), null);
check('onDisable: source font removed', sourceText.style.getPropertyValue('font-family'), '');
check('onDisable: Persian child dir removed', persianLeaf.getAttribute('dir'), null);
check('onDisable: input listener removed', documentListeners.input, undefined);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
