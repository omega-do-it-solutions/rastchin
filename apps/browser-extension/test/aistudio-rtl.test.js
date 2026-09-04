'use strict';
// Regression suite for Google AI Studio compare-mode layout containment.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeIsolatingEngine, El, el, t } = require('./engine-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'platforms', 'aistudio-rtl.js'), 'utf8');
let exported = null;
let recipe = null;

function createTreeWalker(root) {
    const nodes = [];
    const visit = node => {
        if (!node) return;
        if (node.nodeType === 3) nodes.push(node);
        else for (const child of node.childNodes || []) visit(child);
    };
    visit(root);
    let index = 0;
    return { nextNode: () => nodes[index++] || null };
}

const ctx = {
    window: {
        location: { hostname: 'aistudio.google.com' },
        getComputedStyle: node => (node && node.__computedStyle) || {},
        __AISTUDIO_RTL_TEST__(api) { exported = api; }
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

if (!exported || !recipe) {
    console.error('FATAL: AI Studio recipe test hook did not run');
    process.exit(1);
}

function makeEngine() {
    return makeIsolatingEngine({
        messageSelectors: recipe.messageSelectors,
        excludeSelectors: [...(recipe.excludeSelectors || []), ...(recipe.codeGuardSelectors || [])],
        textSelectors: recipe.textSelectors,
        rtlRegex: recipe.rtlRegex,
        rtlClass: recipe.rtlClass,
        rtlStyle: recipe.rtlStyle,
        inlineIsolate: recipe.inlineIsolate,
        isCodeLike: recipe.isCodeLike,
        applyToMessage: recipe.applyToMessage
    });
}

check('recipe uses AI Studio toggle', recipe.storageKey, 'aistudioEnabled');
check('recipe follows default-on state before async settings resolve', recipe.enableBeforeSettings, true);
check('recipe scans incremental chunks before paint', recipe.scanBeforePaint, true);
check('recipe excludes app chrome', recipe.excludeSelectors.includes(exported.chromeSelector), true);
check('column flex is a layout container', exported.isLayoutContainer(el('div', {
    computedStyle: { display: 'flex', flexDirection: 'column' }
})), true);

// AI Studio places ordinary model prose below a layout helper whose class is
// `code-block-aligner`. A broad class*=code guard used to classify the entire
// turn as source code, leaving every Persian block untouched.
{
    const prose = el('div', {
        computedStyle: { display: 'block' }
    }, t('این پاسخ فارسی باید راست‌تراز شود'));
    const textChunk = el('ms-text-chunk', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, prose);
    el('div', {
        cls: 'chat-turn-container code-block-aligner model render',
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, textChunk);

    const engine = makeEngine();
    engine.applyToMessage(textChunk);

    check('code-block-aligner does not suppress Persian prose', prose.getAttribute('dir'), 'rtl');
    check('prose below code-block-aligner is right aligned', prose.style.textAlign, 'right');
    check('text chunk layout below code-block-aligner is untouched', textChunk.getAttribute('dir'), null);
}

// AI Studio renders Markdown prose through custom elements. Text alignment on
// their inline descendants has no visible effect, so the custom block itself
// must become the RTL target without leaking direction into the flex pane.
{
    const inlineText = el('span', {
        computedStyle: { display: 'inline' }
    }, t('جمع‌بندی کوتاه'));
    const markdownBlock = el('ms-cmark-node', {
        computedStyle: { display: 'block' }
    }, inlineText);
    const pane = el('ms-chat-session', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, markdownBlock);

    const engine = makeEngine();
    recipe.applyToMessage(pane, engine);

    check('AI Studio custom prose block becomes RTL', markdownBlock.getAttribute('dir'), 'rtl');
    check('AI Studio custom prose block is right aligned', markdownBlock.style.textAlign, 'right');
    check('Inline text is not used as the alignment target', inlineText.getAttribute('dir'), null);
    check('Custom prose does not change the flex pane', pane.getAttribute('dir'), null);
}

// Mirrors the screenshot: two native response panes inside a compare row. A
// Persian answer in one pane must never apply dir=rtl to either pane or row.
{
    const persian = el('p', {}, t('این پاسخ فارسی درباره Google AI Studio است'));
    const copyLabel = el('span', {}, t('کپی پاسخ'));
    const copyButton = el('button', {}, copyLabel);
    const persianPane = el('ms-chat-session', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, copyButton, persian);
    const english = el('p', {}, t('This response stays left to right.'));
    const englishPane = el('ms-chat-session', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, english);
    const compareRow = el('div', {
        cls: 'compare-responses',
        computedStyle: { display: 'grid' }
    }, persianPane, englishPane);

    const engine = makeEngine();
    recipe.applyToMessage(persianPane, engine);

    check('Persian prose leaf becomes RTL', persian.getAttribute('dir'), 'rtl');
    check('Persian prose leaf is right aligned', persian.style.textAlign, 'right');
    check('Persian response pane layout is untouched', persianPane.getAttribute('dir'), null);
    check('English response pane is untouched', englishPane.getAttribute('dir'), null);
    check('Compare grid is untouched', compareRow.getAttribute('dir'), null);
    check('Toolbar button is untouched', copyButton.getAttribute('dir'), null);
    check('Toolbar label is untouched', copyLabel.getAttribute('dir'), null);
}

// Code is intentionally LTR even when a string literal contains Persian.
{
    const code = el('code', {}, t('const title = "متن فارسی";'));
    const prose = el('p', {}, t('نمونه کد زیر باید چپ‌چین بماند'), code);
    const pane = el('ms-chat-session', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, prose);
    const engine = makeEngine();
    recipe.applyToMessage(pane, engine);
    check('Mixed prose is RTL', prose.getAttribute('dir'), 'rtl');
    check('Code subtree is not marked RTL', code.getAttribute('dir'), null);
}

// The marker follows the direction of LI, not a nested prose DIV. Target the
// semantic list and item so markers move right without touching page layout.
for (const listTag of ['ul', 'ol']) {
    const prose = el('div', {
        computedStyle: { display: 'block' }
    }, t('این مورد باید بولت سمت راست داشته باشد'));
    const item = el('li', {
        computedStyle: { display: 'list-item' }
    }, prose);
    const list = el(listTag, {
        computedStyle: { display: 'block' }
    }, item);
    const pane = el('ms-chat-session', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, list);

    const engine = makeEngine();
    recipe.applyToMessage(pane, engine);

    check(`${listTag}: Persian list item becomes RTL`, item.getAttribute('dir'), 'rtl');
    check(`${listTag}: Persian list item is right aligned`, item.style.textAlign, 'right');
    check(`${listTag}: owning Persian list becomes RTL`, list.getAttribute('dir'), 'rtl');
    check(`${listTag}: nested prose is not the marker target`, prose.getAttribute('dir'), null);
}

// Virtualized hosts can use LI outside the message as an application layout
// primitive. Target resolution must never climb beyond the current message.
{
    const prose = el('div', {
        computedStyle: { display: 'block' }
    }, t('این متن داخل پیام است نه آیتم فهرست بیرونی'));
    const message = el('ms-text-chunk', {
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, prose);
    const outerVirtualItem = el('li', {
        computedStyle: { display: 'list-item' }
    }, message);

    const engine = makeEngine();
    recipe.applyToMessage(message, engine);

    check('Message prose remains the local RTL target', prose.getAttribute('dir'), 'rtl');
    check('Outer virtual list item stays untouched', outerVirtualItem.getAttribute('dir'), null);
    check('Message flex layout stays untouched', message.getAttribute('dir'), null);
}

// CSS must not target arbitrary page-owned dir=rtl elements. The old bare
// selectors leaked into AI Studio chrome.
{
    const css = recipe.globalCss(recipe.codeGuardSelectors.join(', '));
    check('CSS has no bare dir=rtl button rule', /\[dir=["']rtl["']\]\s+button/.test(css), false);
    check('CSS has no bare dir=rtl anchor rule', /\[dir=["']rtl["']\]\s+a\b/.test(css), false);
    check('CSS list rules are class scoped', /\.rastchin-rtl-text\s+(?:ul|ol)/.test(css), true);
    check('CSS scopes list geometry to directly styled lists', /ul\.rastchin-rtl-text/.test(css), true);
    check('CSS avoids relational list selectors', /:has\(/.test(css), false);
    check('CSS contains list padding inside its width', /box-sizing:\s*border-box\s*!important/.test(css), true);
    check('CSS uses restrained logical RTL list indentation', /padding-inline-start:\s*1\.5rem\s*!important/.test(css), true);
    check('CSS removes opposite list indentation', /padding-inline-end:\s*0\s*!important/.test(css), true);
}

if (failures) {
    console.error(`\n${failures}/${total} AI Studio RTL checks failed`);
    process.exit(1);
}
console.log(`✓ aistudio-rtl: ${total} checks passed`);
