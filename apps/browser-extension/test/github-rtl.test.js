'use strict';
// Regression suite for GitHub's scoped Persian prose recipe.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'github-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;
const documentListeners = new Map();

class HTMLElement {}

function makeClassList(element) {
    const names = new Set();
    return {
        add(...values) { values.forEach(value => names.add(value)); },
        remove(...values) { values.forEach(value => names.delete(value)); },
        contains(value) { return names.has(value); },
        values() { return Array.from(names); }
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
        innerText: options.textContent || '',
        children: options.children || [],
        value: options.value,
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
            const matches = (element.children || []).filter(child => child.matches?.(selector));
            matches.forEach = Array.prototype.forEach.bind(matches);
            return matches;
        }
    });
    element.classList = makeClassList(element);
    return element;
}

const ctx = {
    HTMLElement,
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'github.com', pathname: '/owner/repo/issues/1' },
        getComputedStyle() {
            return { display: 'block', visibility: 'visible', contentVisibility: 'visible' };
        },
        __GITHUB_RTL_TEST__(api) { exported = api; }
    },
    document: {
        addEventListener(type, listener) {
            const listeners = documentListeners.get(type) || [];
            listeners.push(listener);
            documentListeners.set(type, listeners);
        },
        removeEventListener(type, listener) {
            const listeners = documentListeners.get(type) || [];
            documentListeners.set(type, listeners.filter(item => item !== listener));
        },
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
    console.error('FATAL: GitHub recipe test hook did not run');
    process.exit(1);
}

const engine = {
    isolated: [],
    cleared: [],
    collectDirectionText(element) { return element.textContent || element.value || ''; },
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    isolateInline(element) { this.isolated.push(element); },
    clearInline(element) { this.cleared.push(element); }
};

// Recipe and scope contract.
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'githubEnabled');
check('recipe: exact GitHub host', registeredRecipe.hosts.join(','), 'github.com');
check('recipe: inline bidi isolation enabled', registeredRecipe.inlineIsolate, true);
check('recipe: has custom message predicate', typeof registeredRecipe.isMessageElement, 'function');
check('recipe: has custom message handler', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has enable hook for editors', typeof registeredRecipe.onEnable, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('scope: current React Markdown selector included', exported.markdownRootSelectors.includes('[data-testid="markdown-body"]'), true);
check('scope: legacy Markdown selector included', exported.markdownRootSelectors.includes('.markdown-body'), true);
check('scope: issue title selector included', exported.titleSelectors.includes('[data-testid="issue-title"]'), true);
check('scope: comment textarea selector included', exported.editorSelectors.includes('textarea.js-comment-field'), true);
check('scope: generic GitHub textarea fallback included', exported.editorSelectors.includes('textarea'), true);
check('scope: rich textbox fallback included', exported.editorSelectors.includes('[contenteditable="true"][role="textbox"]'), true);
check('scope: current repository About selector included',
    exported.repositoryAboutSelectors.includes('[class*="SidebarAbout-module__description__"]'), true);
check('scope: legacy repository About selector included',
    exported.repositoryAboutSelectors.includes('.BorderGrid-cell > p.f4.my-3'), true);
check('scope: organization repository descriptions included',
    exported.repositoryPreviewSelectors.includes('#org-repositories [itemprop="description"]'), true);
check('scope: React organization repository directory descriptions included',
    exported.repositoryPreviewSelectors.includes('[data-listview-repos-list] .repos-list-description'), true);
check('scope: user repository descriptions included',
    exported.repositoryPreviewSelectors.includes('#user-repositories-list [itemprop="description"]'), true);
check('scope: pinned repository descriptions included',
    exported.repositoryPreviewSelectors.includes('.pinned-item-list-item .pinned-item-desc'), true);
check('guard: code elements excluded', exported.codeGuardSelectors.includes('code'), true);
check('guard: diff lines excluded', exported.codeGuardSelectors.includes('[data-testid="diff-line"]'), true);

// GitHub Copilot stays supported, but only on its route and under GitHub's key.
const copilotMessage = makeElement({
    matchSelectors: ['[data-content="ai-message"]'],
    textContent: 'پاسخ فارسی'
});
check('copilot: message selector ignored on repository path', exported.isCopilotMessage(copilotMessage), false);
ctx.window.location.pathname = '/copilot/chat';
check('copilot: message selector accepted on Copilot path', exported.isCopilotMessage(copilotMessage), true);
ctx.window.location.pathname = '/owner/repo/issues/1';

// Issue/PR titles are styled directly.
const persianTitle = makeElement({
    tagName: 'H1',
    matchSelectors: ['[data-testid="issue-title"]', 'h1'],
    textContent: 'رفع مشکل نمایش فارسی'
});
check('title: recognised as a GitHub title', exported.isTitle(persianTitle), true);
check('title: recognised as message surface', exported.isMessageElement(persianTitle), true);
registeredRecipe.applyToMessage(persianTitle, engine);
check('title: Persian direction is RTL', persianTitle.getAttribute('dir'), 'rtl');
check('title: Persian alignment is right', persianTitle.style.getPropertyValue('text-align'), 'right');
check('title: Vazirmatn applied', persianTitle.style.getPropertyValue('font-family').includes('Vazirmatn'), true);

// Repository About descriptions are prose even though they are outside Markdown.
const repositoryAbout = makeElement({
    tagName: 'P',
    matchSelectors: ['[class*="SidebarAbout-module__description__"]'],
    textContent: 'افزونهٔ فارسی برای خوانایی بهتر متن'
});
check('about: current React description recognised', exported.isRepositoryAbout(repositoryAbout), true);
check('about: description recognised as message surface', exported.isMessageElement(repositoryAbout), true);
registeredRecipe.applyToMessage(repositoryAbout, engine);
check('about: Persian description becomes RTL', repositoryAbout.getAttribute('dir'), 'rtl');
check('about: Persian description uses Vazirmatn', repositoryAbout.style.getPropertyValue('font-family').includes('Vazirmatn'), true);

const legacyRepositoryAbout = makeElement({
    tagName: 'P',
    matchSelectors: ['.BorderGrid-cell > p.f4.my-3'],
    textContent: 'توضیح فارسی مخزن'
});
check('about: legacy description recognised', exported.isRepositoryAbout(legacyRepositoryAbout), true);
registeredRecipe.applyToMessage(legacyRepositoryAbout, engine);
check('about: legacy description becomes RTL', legacyRepositoryAbout.getAttribute('dir'), 'rtl');

// Organization/profile repository cards keep metadata LTR; only their prose
// description receives Persian typography and direction.
const persianRepositoryPreview = makeElement({
    tagName: 'P',
    matchSelectors: ['#org-repositories [itemprop="description"]'],
    textContent: 'افزونه فارسی‌محور برای خوانایی متن ترکیبی فارسی و انگلیسی'
});
check('repository preview: organization description recognised',
    exported.isRepositoryPreview(persianRepositoryPreview), true);
check('repository preview: description is a message surface',
    exported.isMessageElement(persianRepositoryPreview), true);
registeredRecipe.applyToMessage(persianRepositoryPreview, engine);
check('repository preview: Persian description becomes RTL',
    persianRepositoryPreview.getAttribute('dir'), 'rtl');
check('repository preview: Persian description aligns right',
    persianRepositoryPreview.style.getPropertyValue('text-align'), 'right');
check('repository preview: Persian description uses Vazirmatn',
    persianRepositoryPreview.style.getPropertyValue('font-family').includes('Vazirmatn'), true);

// GitHub's /orgs/:org/repositories React page uses the same semantic
// description class in both default and compact list layouts. Filter and sort
// updates replace these nodes, so the selector must also be registered with
// the recipe for the shared MutationObserver to discover new results.
const reactRepositoryPreview = makeElement({
    tagName: 'DIV',
    matchSelectors: ['[data-listview-repos-list] .repos-list-description'],
    textContent: 'راست‌چین — افزونه فارسی‌محور برای ابزارهای کاری و هوش مصنوعی'
});
check('repository preview: React organization directory description recognised',
    exported.isRepositoryPreview(reactRepositoryPreview), true);
check('repository preview: React selector registered for dynamic results',
    registeredRecipe.messageSelectors.includes('[data-listview-repos-list] .repos-list-description'), true);
registeredRecipe.applyToMessage(reactRepositoryPreview, engine);
check('repository preview: React directory description becomes RTL',
    reactRepositoryPreview.getAttribute('dir'), 'rtl');
check('repository preview: React directory description aligns right',
    reactRepositoryPreview.style.getPropertyValue('text-align'), 'right');
check('repository preview: React directory description uses Vazirmatn',
    reactRepositoryPreview.style.getPropertyValue('font-family').includes('Vazirmatn'), true);

const englishRepositoryPreview = makeElement({
    tagName: 'P',
    matchSelectors: ['#user-repositories-list [itemprop="description"]'],
    textContent: 'English-only repository description'
});
registeredRecipe.applyToMessage(englishRepositoryPreview, engine);
check('repository preview: English description remains untouched',
    englishRepositoryPreview.getAttribute('dir'), null);

const repositoryMetadata = makeElement({
    tagName: 'DIV',
    matchSelectors: ['.color-fg-muted.f6'],
    textContent: 'JavaScript 3 stars Updated 5 minutes ago'
});
check('repository preview: metadata is not a preview surface',
    exported.isRepositoryPreview(repositoryMetadata), false);
check('repository preview: metadata is not a message surface',
    exported.isMessageElement(repositoryMetadata), false);

// Rendered Markdown is handled leaf-by-leaf, leaving English and code alone.
const persianParagraph = makeElement({
    tagName: 'P',
    matchSelectors: ['p'],
    textContent: 'این توضیح فارسی است'
});
const englishParagraph = makeElement({
    tagName: 'P',
    matchSelectors: ['p'],
    textContent: 'English documentation only'
});
const codeBlock = makeElement({
    tagName: 'CODE',
    matchSelectors: ['code'],
    textContent: 'const title = "سلام";'
});
const markdown = makeElement({
    matchSelectors: ['.markdown-body'],
    textContent: 'این توضیح فارسی است English documentation only const title = "سلام";',
    children: [persianParagraph, englishParagraph, codeBlock]
});
check('markdown: recognised as content surface', exported.isMarkdownRoot(markdown), true);
check('markdown: code is classified as protected', exported.isCodeLike(codeBlock), true);
registeredRecipe.applyToMessage(markdown, engine);
check('markdown: Persian paragraph becomes RTL', persianParagraph.getAttribute('dir'), 'rtl');
check('markdown: English paragraph stays untouched', englishParagraph.getAttribute('dir'), null);
check('markdown: code stays untouched', codeBlock.getAttribute('dir'), null);

// Editors update from their value through the delegated input listener.
const editor = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea'],
    value: '',
    textContent: ''
});
check('editor: recognised even while empty', exported.isMessageElement(editor), true);
check('editor: generic new-issue textarea recognised', exported.isEditor(editor), true);
registeredRecipe.onEnable(engine);
check('editor: input listener attached', (documentListeners.get('input') || []).length, 1);
check('editor: composition listener attached', (documentListeners.get('compositionend') || []).length, 1);
editor.value = 'یک کامنت فارسی';
(documentListeners.get('input') || [])[0]({ target: editor });
check('editor: Persian value becomes RTL', editor.getAttribute('dir'), 'rtl');
check('editor: Persian value uses Vazirmatn', editor.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
editor.value = 'English comment';
(documentListeners.get('input') || [])[0]({ target: editor });
check('editor: returning to English restores direction', editor.getAttribute('dir'), null);

const codeEditorTextarea = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea', '.cm-editor'],
    value: 'const label = "سلام";',
    textContent: ''
});
check('editor guard: textarea inside code editor is code-like', exported.isCodeLike(codeEditorTextarea), true);
check('editor guard: code-editor textarea is not a message surface', exported.isMessageElement(codeEditorTextarea), false);
check('editor guard: code-editor textarea is not handled as prose', exported.processEditor(codeEditorTextarea, engine), false);
check('editor guard: code-editor textarea stays untouched', codeEditorTextarea.getAttribute('dir'), null);
registeredRecipe.onDisable(engine);
check('editor: input listener removed on disable', (documentListeners.get('input') || []).length, 0);
check('cleanup: title direction restored on disable', persianTitle.getAttribute('dir'), null);
check('cleanup: Markdown paragraph restored on disable', persianParagraph.getAttribute('dir'), null);
check('cleanup: repository About restored on disable', repositoryAbout.getAttribute('dir'), null);
check('cleanup: repository preview restored on disable', persianRepositoryPreview.getAttribute('dir'), null);
check('cleanup: React repository preview restored on disable', reactRepositoryPreview.getAttribute('dir'), null);

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: keeps guarded code LTR', /code, pre[\s\S]*direction:\s*ltr !important/.test(css), true);
check('css: modified content is RTL', css.includes('.rastchin-github-rtl') && css.includes('direction: rtl !important'), true);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
