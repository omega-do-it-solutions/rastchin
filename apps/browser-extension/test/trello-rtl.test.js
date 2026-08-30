'use strict';
// Regression suite for Trello's scoped card-modal recipe contract.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'trello-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

class HTMLElement {}

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        getComputedStyle() {
            return {
                display: 'block',
                visibility: 'visible',
                contentVisibility: 'visible'
            };
        },
        __TRELLO_RTL_TEST__(api) { exported = api; }
    },
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
    console.error('FATAL: Trello recipe test hook did not run');
    process.exit(1);
}

function selectorParts(selector) {
    return String(selector || '').split(',').map(part => part.trim()).filter(Boolean);
}

function makeClassList() {
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
        getPropertyValue(prop) { return store.get(prop) || ''; },
        getPropertyPriority() { return ''; }
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
        parentElement: null,
        _children: [],
        get children() { return this._children; },
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
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
    };
    el.classList = makeClassList();
    Object.setPrototypeOf(el, HTMLElement.prototype);
    (options.children || []).forEach(child => {
        child.parentElement = el;
        el._children.push(child);
    });
    return el;
}

check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'trelloEnabled');
check('recipe: host trello.com', registeredRecipe.hosts.includes('trello.com'), true);
check('recipe: host www.trello.com', registeredRecipe.hosts.includes('www.trello.com'), true);
check('recipe: uses modal/dialog selectors', registeredRecipe.messageSelectors.includes('[role="dialog"]'), true);
check('recipe: uses exact board card title selector', registeredRecipe.messageSelectors.includes('a[data-testid="card-name"]'), true);
check('recipe: uses exact card-modal title selector', registeredRecipe.messageSelectors.includes('#card-back-name'), true);
check('recipe: uses exact visible card-title textarea selector', registeredRecipe.messageSelectors.includes('textarea[data-testid="card-back-title-input"]'), true);
check('recipe: uses exact checklist item selector', registeredRecipe.messageSelectors.includes('[data-testid="check-item-container"]'), true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has scoped code guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: includes unscoped current-comment selector', exported.commentRootSelectors.includes('.current-comment'), true);
check('recipe: exports home feed renderer selector', exported.homeFeedCommentDocumentSelectors.includes('.ak-renderer-document'), true);
check('recipe: exports home feed preview selector', exported.homeFeedPreviewTextTargetSelectors.includes('a[href*="/c/"]'), true);
check('recipe: exports home feed composer selector', exported.homeFeedComposerSelectors.includes('.ProseMirror[role="textbox"][contenteditable="true"]'), true);
check('recipe: exports list card composer selector', exported.homeFeedComposerSelectors.includes('[data-testid="list-card-composer-textarea"][contenteditable="true"]'), true);
check('recipe: exports exact current checklist text selector', exported.checklistTextSelectors.includes('[data-testid="check-item-name"] .ak-renderer-document p'), true);

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: keeps code guard LTR', css.includes('code, pre') && css.includes('direction: ltr'), true);
check('css: scope class for modified Trello blocks', css.includes('rastchin-trello-rtl'), true);
check('css: forces nested comment text right aligned', css.includes('rastchin-trello-rtl') && css.includes('span') && css.includes('text-align: right'), true);
check('css: covers heading blocks inside Trello composer', css.includes('.rastchin-trello-rtl h1'), true);

const cardTitle = makeElement({
    tagName: 'H2',
    matchSelectors: ['#card-back-name', '[data-testid="card-back-title"]', 'h2'],
    attrs: { id: 'card-back-name', 'data-testid': 'card-back-title' },
    textContent: 'دریافت پروژه Bot جدید (لینوکسی)'
});
const cardDescription = makeElement({
    matchSelectors: ['[data-testid="card-back-description"]'],
    attrs: { 'data-testid': 'card-back-description' },
    textContent: 'توضیحات کارت'
});
const checklistItemLabel = makeElement({
    tagName: 'P',
    matchSelectors: ['[data-testid="check-item-name"] .ak-renderer-document p', '[data-testid="check-item-name"] [data-renderer-start-pos]', 'p'],
    textContent: 'تایید یا عدم تایید لینک ریپو که با آخرین فایل‌های داریک یکی هست یا نه؟'
});
const checklistItemCheckbox = makeElement({
    tagName: 'INPUT',
    matchSelectors: ['input[type="checkbox"]'],
    attrs: { type: 'checkbox' }
});
const checklistItem = makeElement({
    matchSelectors: ['[data-testid="check-item-container"]', 'div'],
    attrs: { 'data-testid': 'check-item-container' },
    textContent: checklistItemLabel.textContent,
    children: [checklistItemCheckbox, checklistItemLabel]
});
const cardDialog = makeElement({
    matchSelectors: ['[role="dialog"]'],
    attrs: { role: 'dialog' },
    textContent: `${cardTitle.textContent} ${cardDescription.textContent} ${checklistItem.textContent}`,
    children: [cardTitle, cardDescription, checklistItem]
});
check('regression: card dialog with a title and checklist is recognised',
    registeredRecipe.isMessageElement(cardDialog), true);
registeredRecipe.applyToMessage(cardDialog, {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return element.textContent || ''; },
    isolateInline() {},
    clearInline() {}
});
registeredRecipe.applyToMessage(checklistItem, {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return element.textContent || ''; },
    isolateInline() {},
    clearInline() {}
});
check('regression: Persian checklist label gets Vazirmatn scope',
    checklistItemLabel.getAttribute('data-rastchin-trello-rtl'), 'true');
check('regression: checklist row with its checkbox remains layout-neutral',
    checklistItem.getAttribute('data-rastchin-trello-rtl'), null);

const boardCardTitle = makeElement({
    tagName: 'A',
    matchSelectors: ['a[data-testid="card-name"]'],
    attrs: { 'data-testid': 'card-name' },
    textContent: 'کامبیز: ارسال pdf و ویدیو'
});
check('regression: board card title is recognised as a Trello message surface',
    registeredRecipe.isMessageElement(boardCardTitle), true);
registeredRecipe.applyToMessage(boardCardTitle, {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return element.textContent || ''; },
    isolateInline() {},
    clearInline() {}
});
check('regression: board card title gets Vazirmatn scope',
    boardCardTitle.getAttribute('data-rastchin-trello-rtl'), 'true');

const cardBackTitle = makeElement({
    tagName: 'H2',
    matchSelectors: ['#card-back-name', 'h2'],
    attrs: { id: 'card-back-name' },
    textContent: 'دریافت پروژه Bot جدید (لینوکسی)'
});
check('regression: card-modal title is recognised independent of its dialog root',
    registeredRecipe.isMessageElement(cardBackTitle), true);
registeredRecipe.applyToMessage(cardBackTitle, {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return element.textContent || ''; },
    isolateInline() {},
    clearInline() {}
});
check('regression: card-modal title gets Vazirmatn scope independent of its dialog root',
    cardBackTitle.getAttribute('data-rastchin-trello-rtl'), 'true');

const cardBackTitleInput = makeElement({
    tagName: 'TEXTAREA',
    matchSelectors: ['textarea[data-testid="card-back-title-input"]'],
    attrs: { 'data-testid': 'card-back-title-input' },
    textContent: 'فاکتور جدید دکتر مافی'
});
check('regression: visible card-title textarea is recognised independently',
    registeredRecipe.isMessageElement(cardBackTitleInput), true);
registeredRecipe.applyToMessage(cardBackTitleInput, {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return element.textContent || ''; },
    isolateInline() {},
    clearInline() {}
});
check('regression: visible card-title textarea gets Vazirmatn scope',
    cardBackTitleInput.getAttribute('data-rastchin-trello-rtl'), 'true');
check('regression: visible card-title textarea gets RTL direction',
    cardBackTitleInput.style.getPropertyValue('direction'), 'rtl');

const homeFeedCommentText = makeElement({
    tagName: 'P',
    matchSelectors: ['p', 'p[data-renderer-start-pos]'],
    textContent: 'باید تحقیق کنیم که این کامنت راست‌چین شود'
});
const homeFeedRenderer = makeElement({
    matchSelectors: ['.ak-renderer-document'],
    textContent: homeFeedCommentText.textContent,
    children: [homeFeedCommentText]
});
const actionsButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button[aria-label="Actions"]'],
    attrs: { 'aria-label': 'Actions' }
});
const reactionButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button[aria-label="Add reaction"]'],
    attrs: { 'aria-label': 'Add reaction' }
});
const replyButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button'],
    textContent: 'Reply'
});
const homeFeedCard = makeElement({
    tagName: 'SECTION',
    textContent: homeFeedCommentText.textContent,
    children: [actionsButton, homeFeedRenderer, reactionButton, replyButton]
});

const engine = {
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    collectDirectionText(element) { return element.textContent || ''; },
    isolateInline() {},
    clearInline() {}
};

check('regression: Home feed section recognised as Trello message surface',
    registeredRecipe.isMessageElement(homeFeedCard), true);
check('regression: Home feed card finds ak-renderer root',
    exported.findHomeFeedCommentRoots(homeFeedCard)[0], homeFeedRenderer);
registeredRecipe.applyToMessage(homeFeedCard, engine);
check('regression: Home feed Persian comment gets rtl dir',
    homeFeedCommentText.getAttribute('dir'), 'rtl');
check('regression: Home feed Persian comment gets right alignment',
    homeFeedCommentText.style.getPropertyValue('text-align'), 'right');
check('regression: Home feed Persian comment marked by Trello recipe',
    homeFeedCommentText.getAttribute('data-rastchin-trello-rtl'), 'true');

const genericRendererSection = makeElement({
    tagName: 'SECTION',
    textContent: 'این فقط یک renderer عمومی است',
    children: [homeFeedRenderer]
});
check('regression: generic renderer section without Trello actions ignored',
    registeredRecipe.isMessageElement(genericRendererSection), false);

const previewTitle = makeElement({
    matchSelectors: ['div'],
    textContent: 'دریافت پروژه Bot جدید (لینوکسی)'
});
const previewChecklist = makeElement({
    matchSelectors: ['[data-test-class="checklist-badge"]'],
    attrs: { 'data-test-class': 'checklist-badge' },
    textContent: '0/2'
});
const previewAvatar = makeElement({
    matchSelectors: ['[title]'],
    attrs: { title: 'Behnam Bahmanyar (behnambahmanyar)' }
});
const previewLink = makeElement({
    tagName: 'A',
    matchSelectors: ['a[href*="/c/"]'],
    attrs: { href: 'https://trello.com/c/44qlAEDE/320-demo' },
    textContent: 'دریافت پروژه Bot جدید (لینوکسی) 0/2',
    children: [previewTitle, previewChecklist, previewAvatar]
});
check('regression: Home feed preview link recognised as Trello surface',
    registeredRecipe.isMessageElement(previewLink), true);
registeredRecipe.applyToMessage(previewLink, engine);
check('regression: Home feed preview title gets rtl dir',
    previewTitle.getAttribute('dir'), 'rtl');
check('regression: Home feed preview title gets right alignment',
    previewTitle.style.getPropertyValue('text-align'), 'right');
check('regression: checklist badge remains untouched',
    previewChecklist.getAttribute('dir'), null);

const plainCardLink = makeElement({
    tagName: 'A',
    matchSelectors: ['a[href*="/c/"]'],
    attrs: { href: 'https://trello.com/c/44qlAEDE/321-demo' },
    textContent: 'Plain English card'
});
check('regression: plain card link without Trello feed signals ignored',
    registeredRecipe.isMessageElement(plainCardLink), false);

const composer = makeElement({
    tagName: 'DIV',
    matchSelectors: ['.ProseMirror[role="textbox"][contenteditable="true"]', '#ak-editor-textarea[contenteditable="true"]'],
    attrs: { role: 'textbox', contenteditable: 'true', id: 'ak-editor-textarea' },
    textContent: '@momikaeli سلام مهندس این رو test میکنیم'
});
const clickWrapper = makeElement({
    matchSelectors: ['[data-testid="click-wrapper"]', '[data-editor-click-wrapper="true"]'],
    attrs: { 'data-testid': 'click-wrapper', 'data-editor-click-wrapper': 'true' },
    children: [composer]
});
const saveButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button'],
    textContent: 'Save'
});
const cancelButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button'],
    textContent: 'Cancel'
});
const composerShell = makeElement({
    children: [clickWrapper, saveButton, cancelButton]
});
check('regression: Home feed composer recognised as Trello surface',
    registeredRecipe.isMessageElement(composer), true);
registeredRecipe.applyToMessage(composer, engine);
check('regression: Home feed composer gets rtl dir',
    composer.getAttribute('dir'), 'rtl');
check('regression: Home feed composer gets right alignment',
    composer.style.getPropertyValue('text-align'), 'right');
check('regression: Home feed composer marked by Trello recipe',
    composer.getAttribute('data-rastchin-trello-rtl'), 'true');

const headingComposerHeading = makeElement({
    tagName: 'H1',
    matchSelectors: ['h1'],
    textContent: 'شسیبشسرش [awsioefacxv شسکیمنبت'
});
const headingComposer = makeElement({
    tagName: 'DIV',
    matchSelectors: ['.ProseMirror[role="textbox"][contenteditable="true"]', '#ak-editor-textarea[contenteditable="true"]'],
    attrs: { role: 'textbox', contenteditable: 'true', id: 'ak-editor-textarea' },
    textContent: headingComposerHeading.textContent,
    children: [headingComposerHeading]
});
const headingClickWrapper = makeElement({
    matchSelectors: ['[data-testid="click-wrapper"]', '[data-editor-click-wrapper="true"]'],
    attrs: { 'data-testid': 'click-wrapper', 'data-editor-click-wrapper': 'true' },
    children: [headingComposer]
});
const headingSaveButton = makeElement({
    tagName: 'BUTTON',
    matchSelectors: ['button'],
    textContent: 'Save'
});
const headingComposerShell = makeElement({
    children: [headingClickWrapper, headingSaveButton]
});
check('regression: heading composer recognised as Trello surface',
    registeredRecipe.isMessageElement(headingComposer), true);
registeredRecipe.applyToMessage(headingComposer, engine);
check('regression: heading composer root gets rtl dir',
    headingComposer.getAttribute('dir'), 'rtl');

const looseComposer = makeElement({
    tagName: 'DIV',
    matchSelectors: ['.ProseMirror[role="textbox"][contenteditable="true"]'],
    attrs: { role: 'textbox', contenteditable: 'true' },
    textContent: 'Loose editor'
});
check('regression: generic ProseMirror editor without Trello actions ignored',
    registeredRecipe.isMessageElement(looseComposer), false);

const listCardComposer = makeElement({
    tagName: 'DIV',
    matchSelectors: ['[data-testid="list-card-composer-textarea"][contenteditable="true"]'],
    attrs: {
        role: 'textbox',
        contenteditable: 'true',
        'data-testid': 'list-card-composer-textarea'
    },
    textContent: 'DXSfت تشسیب شث'
});
check('regression: list card composer recognised as Trello surface',
    registeredRecipe.isMessageElement(listCardComposer), true);
registeredRecipe.applyToMessage(listCardComposer, engine);
check('regression: list card composer gets rtl dir',
    listCardComposer.getAttribute('dir'), 'rtl');
check('regression: list card composer gets right alignment',
    listCardComposer.style.getPropertyValue('text-align'), 'right');
check('regression: list card composer marked by Trello recipe',
    listCardComposer.getAttribute('data-rastchin-trello-rtl'), 'true');

const cardCommentComposer = makeElement({
    tagName: 'DIV',
    matchSelectors: ['.ProseMirror[role="textbox"][contenteditable="true"]', '#ak-editor-textarea[contenteditable="true"]'],
    attrs: {
        role: 'textbox',
        contenteditable: 'true',
        id: 'ak-editor-textarea'
    },
    textContent: 'شسیبت 2w0o3e asd;fkja sdf شسیبکمنتشسی'
});
const cardCommentEditorContainer = makeElement({
    matchSelectors: ['[data-testid="editor-content-container"]', '.ak-editor-content-area'],
    attrs: { 'data-testid': 'editor-content-container' },
    children: [cardCommentComposer]
});
check('regression: card comment composer recognised via editor-content-container',
    registeredRecipe.isMessageElement(cardCommentComposer), true);
registeredRecipe.applyToMessage(cardCommentComposer, engine);
check('regression: card comment composer gets rtl dir',
    cardCommentComposer.getAttribute('dir'), 'rtl');
check('regression: card comment composer gets right alignment',
    cardCommentComposer.style.getPropertyValue('text-align'), 'right');
check('regression: card comment composer marked by Trello recipe',
    cardCommentComposer.getAttribute('data-rastchin-trello-rtl'), 'true');

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
