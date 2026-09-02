'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEngine, el, t } = require('./engine-harness');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'platforms', 'meta-ai-rtl.js'),
    'utf8'
);

let exported = null;
let registeredRecipe = null;
const ctx = {
    window: {
        __META_AI_RTL_TEST__(api) { exported = api; }
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
    console.error('FATAL: Meta AI recipe test hook did not run');
    process.exit(1);
}

function makeMetaAiEngine() {
    return makeEngine({
        textSelectors: registeredRecipe.textSelectors,
        excludeSelectors: [...registeredRecipe.excludeSelectors, ...registeredRecipe.codeGuardSelectors],
        rtlRegex: registeredRecipe.rtlRegex,
        rtlClass: registeredRecipe.rtlClass,
        rtlStyle: registeredRecipe.rtlStyle,
        needsRTL: registeredRecipe.needsRTL,
        isCodeLike: node => registeredRecipe.codeGuardSelectors.some(selector => node.closest?.(selector))
    });
}

check('recipe: storage key', registeredRecipe.storageKey, 'metaAiEnabled');
check('recipe: meta.ai host', registeredRecipe.hosts.includes('meta.ai'), true);
check('recipe: www.meta.ai host', registeredRecipe.hosts.includes('www.meta.ai'), true);
check('recipe: custom block walker', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: React/editor text nodes are not structurally wrapped', registeredRecipe.inlineIsolate, false);
check('recipe: dedicated RTL marker', registeredRecipe.rtlClass, 'rastchin-meta-ai-rtl');
check('selectors: message-id fallback', exported.messageSelectors.includes('[data-message-id]'), true);
check('selectors: semantic article fallback', exported.messageSelectors.includes('main article'), true);
check('selectors: direct main paragraph fallback', exported.messageSelectors.includes('main p'), true);
check('selectors: document surface fallback', exported.messageSelectors.includes('[role="document"]'), true);
check('guards: code is protected', exported.codeGuardSelectors.includes('code'), true);
check('guards: composer is protected', exported.uiGuardSelectors.includes('[data-testid*="composer"]'), true);

const css = registeredRecipe.globalCss(registeredRecipe.codeGuardSelectors.join(', '));
check('css: marked Persian blocks override host alignment', css.includes('html body .rastchin-meta-ai-rtl[dir="rtl"]'), true);
check('css: Persian blocks use Vazirmatn', css.includes('font-family: "Vazirmatn"'), true);
check('css: code remains LTR and monospace', css.includes('direction: ltr !important') && css.includes('ui-monospace'), true);
check('css: table geometry stays LTR', css.includes('table:has(.rastchin-meta-ai-rtl[dir="rtl"])'), true);

{
    const english = el('p', {}, t('Here is the answer.'));
    const persian = el('p', {}, t('سلام، این پاسخ فارسی است. This is a mixed sentence.'));
    const code = el('pre', {}, el('code', {}, t('const greeting = "سلام";')));
    const button = el('button', {}, t('Copy'));
    const response = el(
        'article',
        { attrs: { 'data-message-id': 'response-1' } },
        english,
        persian,
        code,
        button
    );
    const engine = makeMetaAiEngine();
    registeredRecipe.applyToMessage(response, engine);

    check('chat: response layout remains untouched', response.getAttribute('dir'), null);
    check('chat: English paragraph remains native', english.getAttribute('dir'), null);
    check('chat: Persian-first mixed paragraph becomes RTL', persian.getAttribute('dir'), 'rtl');
    check('chat: Persian paragraph aligns right', persian.style.textAlign, 'right');
    check('chat: Persian paragraph gets marker class', persian.classList.contains('rastchin-meta-ai-rtl'), true);
    check('chat: code remains untouched', code.getAttribute('dir'), null);
    check('chat: action control remains untouched', button.getAttribute('dir'), null);
}

{
    const englishFirst = el('p', {}, t('English first, then یک عبارت فارسی.'));
    const response = el('div', { attrs: { 'data-testid': 'assistant-response' } }, englishFirst);
    registeredRecipe.applyToMessage(response, makeMetaAiEngine());
    check('mixed text: English-first paragraph remains native', englishFirst.getAttribute('dir'), null);
}

{
    const bareMessage = el('div', { attrs: { 'data-testid': 'message-text' } }, t('این پاسخ بدون تگ پاراگراف است.'));
    registeredRecipe.applyToMessage(bareMessage, makeMetaAiEngine());
    check('bare message: direct Persian div becomes RTL', bareMessage.getAttribute('dir'), 'rtl');
}

{
    const prompt = el('div', { attrs: { 'data-testid': 'message-composer' } },
        el('p', {}, t('این متن در composer است.'))
    );
    registeredRecipe.applyToMessage(prompt, makeMetaAiEngine());
    check('composer: wrapper remains untouched', prompt.getAttribute('dir'), null);
    check('composer: nested paragraph remains untouched', prompt.querySelector('p').getAttribute('dir'), null);
}

{
    const textNode = t('متن فارسی اولیه');
    const paragraph = el('p', {}, textNode);
    const response = el('article', {}, paragraph);
    const engine = makeMetaAiEngine();
    registeredRecipe.applyToMessage(response, engine);
    textNode.textContent = 'English replacement';
    registeredRecipe.applyToMessage(response, engine);
    check('dynamic update: changed English content restores direction', paragraph.getAttribute('dir'), null);
    check('dynamic update: marker class is restored', paragraph.classList.contains('rastchin-meta-ai-rtl'), false);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
}

console.log(`${failures} FAILURE(S) of ${total} assertions`);
process.exit(1);
