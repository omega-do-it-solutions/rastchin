'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeIsolatingEngine, El, el, t } = require('./engine-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'platforms', 'copilot-rtl.js'), 'utf8');
let exported;
let recipe;

function createTreeWalker(root) {
    const nodes = [];
    const visit = node => {
        if (node.nodeType === 3) nodes.push(node);
        else (node.childNodes || []).forEach(visit);
    };
    visit(root);
    let index = 0;
    return { nextNode: () => nodes[index++] || null };
}

const ctx = {
    window: {
        location: { hostname: 'copilot.microsoft.com' },
        getComputedStyle: node => node.__computedStyle || {},
        __COPILOT_RTL_TEST__(value) { exported = value; }
    },
    document: { createTreeWalker },
    NodeFilter: { SHOW_TEXT: 4 },
    HTMLElement: El,
    Element: El,
    RastChinRecipe: { runPlatformRecipe(value) { recipe = value; } },
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

function makeEngine() {
    return makeIsolatingEngine({
        messageSelectors: recipe.messageSelectors,
        excludeSelectors: [...recipe.excludeSelectors, ...recipe.codeGuardSelectors],
        textSelectors: recipe.textSelectors,
        rtlRegex: recipe.rtlRegex,
        rtlClass: recipe.rtlClass,
        rtlStyle: recipe.rtlStyle,
        inlineIsolate: recipe.inlineIsolate,
        isCodeLike: recipe.isCodeLike,
        applyToMessage: recipe.applyToMessage
    });
}

check('recipe: current AI message selector', recipe.messageSelectors.includes('[data-testid="ai-message"]'), true);
check('recipe: current AI body selector', recipe.messageSelectors.includes('[data-testid="ai-message-body"]'), true);
check('recipe: avoids broad class*=code guard', exported.codeSelector.includes('[class*="code"]'), false);

{
    const span = el('span', { cls: 'font-ligatures-none whitespace-pre-wrap', computedStyle: { display: 'inline' } }, t('این پاسخ فارسی است'));
    const paragraph = el('p', { computedStyle: { display: 'block' } }, span);
    const itemSpan = el('span', { cls: 'font-ligatures-none whitespace-pre-wrap', computedStyle: { display: 'inline' } }, t('پاک کردن کش مرورگر'));
    const itemParagraph = el('p', { computedStyle: { display: 'block' } }, itemSpan);
    const item = el('li', { cls: 'ps-2', computedStyle: { display: 'list-item' } }, itemParagraph);
    const list = el('ol', { role: 'list', computedStyle: { display: 'flex' } }, item);
    const body = el('div', { attrs: { 'data-testid': 'ai-message-body' }, computedStyle: { display: 'block' } }, paragraph, list);
    const article = el('div', {
        role: 'article', attrs: { 'data-testid': 'ai-message', 'data-content': 'ai-message' },
        computedStyle: { display: 'block' }
    }, body);

    recipe.applyToMessage(article, makeEngine());

    check('paragraph: RTL applied to P', paragraph.getAttribute('dir'), 'rtl');
    check('paragraph: inline span untouched', span.getAttribute('dir'), null);
    check('list: OL receives RTL for marker geometry', list.getAttribute('dir'), 'rtl');
    check('list: LI receives RTL', item.getAttribute('dir'), 'rtl');
    check('list: nested P remains untouched when LI owns direction', itemParagraph.getAttribute('dir'), null);
    check('message: body layout remains untouched', body.getAttribute('dir'), null);
    check('message: article remains untouched', article.getAttribute('dir'), null);
}

{
    const code = el('code', { computedStyle: { display: 'inline' } }, t('const title = "متن فارسی";'));
    const paragraph = el('p', { computedStyle: { display: 'block' } }, code);
    const body = el('div', { attrs: { 'data-testid': 'ai-message-body' }, computedStyle: { display: 'block' } }, paragraph);
    recipe.applyToMessage(body, makeEngine());
    check('code: code subtree stays LTR', code.getAttribute('dir'), null);
    check('code: code-only paragraph stays untouched', paragraph.getAttribute('dir'), null);
}

const css = recipe.globalCss(recipe.codeGuardSelectors.join(', '));
check('css: RTL and font are scoped to Copilot class', css.includes('.rastchin-copilot-rtl[dir="rtl"]'), true);
check('css: no bare page-wide dir selector', /\[dir="rtl"\]\s+(?:button|a|li|ul|ol)/.test(css), false);
check('css: list padding uses logical properties', css.includes('padding-inline-start: 1.5rem'), true);

if (failures) {
    console.error(`${failures}/${total} Copilot checks failed`);
    process.exit(1);
}
console.log(`✓ copilot-rtl: ${total} checks passed`);
