'use strict';
// Gemini prose/table direction and restoration, using the production recipe
// and RTL engine with sanitized shapes from the Firefox smoke test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { El, el, t, makeEngine } = require('./engine-harness');

let recipe;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/platforms/gemini-rtl.js'), 'utf8'), {
    Element: El,
    HTMLElement: El,
    RastChinRecipe: { runPlatformRecipe(value) { recipe = value; } }
});
assert.equal(recipe.storageKey, 'geminiEnabled');

function engineFor(root) {
    const engine = makeEngine({
        ...recipe,
        excludeSelectors: [...recipe.excludeSelectors, ...recipe.codeGuardSelectors]
    });
    const scan = () => engine.applyToMessage(root);
    return { engine, scan };
}

function fixture(headers, values, tableOptions = {}) {
    const headerCells = headers.map(text => el('th', {}, t(text)));
    const valueCells = values.map(text => el('td', {}, t(text)));
    const table = el('table', tableOptions,
        el('thead', {}, el('tr', {}, ...headerCells)),
        el('tbody', {}, el('tr', {}, ...valueCells)));
    const english = el('p', {}, t('English paragraph ending with سلام'));
    const persian = el('p', {}, t('این پاراگراف فارسی است.'));
    const root = el('div', { attrs: { id: 'model-response-message-content-test', dir: 'ltr' } },
        persian, english, table);
    return { root, table, headerCells, valueCells, persian, english, ...engineFor(root) };
}

// Gemini can give the entire response dir=rtl. Restoring an English paragraph
// to an unset dir merely reintroduces that inherited RTL direction.
for (const inheritedDirection of ['rtl', 'ltr']) {
    const f = fixture(['نام', 'مقدار'], ['English', '123.45']);
    f.root.setAttribute('dir', inheritedDirection);
    f.scan();
    assert.equal(f.english.getAttribute('dir'), 'ltr', 'English prose has an explicit independent direction');
    assert.equal(f.english.style.direction, 'ltr');
    assert.equal(f.english.style.textAlign, 'left');
    assert.equal(f.english.style.unicodeBidi, 'isolate');
    assert.equal(f.persian.getAttribute('dir'), 'rtl');
    assert.equal(f.root.getAttribute('dir'), inheritedDirection, 'host response geometry is unchanged');
    const snapshots = f.engine.styledElements.size;
    f.scan();
    assert.equal(f.engine.styledElements.size, snapshots, 'English rescans keep the original snapshot');
    assert.equal(f.english.getAttribute('dir'), 'ltr');

    f.engine.restoreStyles();
    recipe.onDisable();
    assert.equal(f.english.getAttribute('dir'), null, 'disable removes the English override');
    assert.equal(f.english.style.textAlign, '');
    assert.equal(f.english.style.unicodeBidi, '');
    f.scan();
    assert.equal(f.english.getAttribute('dir'), 'ltr', 're-enable fixes inherited direction again');
}

{
    const text = t('This English paragraph ends with سلام.');
    const paragraph = el('p', { attrs: { dir: 'auto' }, style: { textAlign: 'center', unicodeBidi: 'plaintext' } }, text);
    const root = el('div', { attrs: { id: 'model-response-message-content-reused', dir: 'rtl' } }, paragraph);
    const { scan, engine } = engineFor(root);
    scan();
    assert.equal(paragraph.getAttribute('dir'), 'ltr');
    text.textContent = 'این یک پاراگراف فارسی است.';
    scan();
    assert.equal(paragraph.getAttribute('dir'), 'rtl', 'reused paragraph can switch to Persian');
    assert.equal(paragraph.style.textAlign, 'right');
    text.textContent = 'English again with سلام.';
    scan();
    assert.equal(paragraph.getAttribute('dir'), 'ltr', 'reused paragraph can switch back to English');
    assert.equal(paragraph.style.textAlign, 'left');
    text.textContent = '';
    scan();
    assert.equal(paragraph.getAttribute('dir'), 'auto', 'empty paragraph restores its original dir');
    assert.equal(paragraph.style.textAlign, 'center');
    assert.equal(paragraph.style.unicodeBidi, 'plaintext');
    assert.equal(engine.styledElements.has(paragraph), false);
}

{
    const english = el('p', {}, t('English inside a Persian quotation.'));
    const quote = el('blockquote', {}, el('p', {}, t('این نقل قول فارسی است و یک پاراگراف انگلیسی هم دارد.')), english);
    const englishItem = el('li', {}, t('English item'));
    const list = el('ul', {}, el('li', {}, t('این مورد فارسی است و باید راست‌چین بماند.')), englishItem);
    const root = el('div', { attrs: { id: 'model-response-message-content-nested', dir: 'rtl' } }, quote, list);
    engineFor(root).scan();
    assert.equal(quote.getAttribute('dir'), 'rtl');
    assert.equal(english.getAttribute('dir'), 'ltr', 'English paragraph does not inherit quote direction');
    assert.equal(list.getAttribute('dir'), 'rtl');
    assert.equal(englishItem.getAttribute('dir'), 'ltr', 'English list prose keeps its own direction');
    const css = recipe.globalCss(recipe.codeGuardSelectors.join(', '), recipe);
    assert.match(css, /li\[dir="ltr"\]\s*\{[^}]*direction:\s*ltr\s*!important[^}]*text-align:\s*left\s*!important/, 'RTL list CSS respects English items');
    assert.match(css, /li\[dir="ltr"\]\s*\{[^}]*padding-left:\s*1\.55rem\s*!important[^}]*padding-right:\s*0\s*!important/, 'English list text reserves space for its leading marker');
    assert.match(css, /li\[dir="ltr"\]::before\s*\{[^}]*left:\s*0\s*!important[^}]*right:\s*auto\s*!important/, 'English list marker stays beside its text');
}

{
    // Short Persian headers must win over long Latin values. Values retain
    // their own LTR direction even though column order becomes RTL.
    const f = fixture(['نام', 'مقدار'], ['English technical value with many Latin letters', '123.45']);
    f.scan();
    assert.equal(f.table.getAttribute('dir'), 'rtl', 'Persian headers set RTL column order');
    assert.equal(f.table.style.direction, 'rtl');
    assert.equal(f.headerCells[0].getAttribute('dir'), 'rtl');
    assert.equal(f.valueCells[0].getAttribute('dir'), 'ltr', 'English value does not inherit RTL');
    assert.equal(f.valueCells[1].getAttribute('dir'), 'ltr', 'numeric value stays LTR');
    assert.equal(f.valueCells[0].style.textAlign, 'left');
    assert.equal(f.root.getAttribute('dir'), 'ltr', 'response wrapper stays unchanged');
    assert.equal(f.english.getAttribute('dir'), 'ltr');
    assert.equal(f.persian.getAttribute('dir'), 'rtl');
    const snapshots = f.engine.styledElements.size;
    f.scan();
    assert.equal(f.engine.styledElements.size, snapshots, 'repeat scans reuse original snapshots');

    f.engine.restoreStyles();
    recipe.onDisable();
    assert.equal(f.table.getAttribute('dir'), null, 'disable restores table direction');
    assert.equal(f.table.style.direction, '');
    assert.equal(f.valueCells[0].getAttribute('dir'), null, 'disable restores LTR cell override');
    assert.equal(f.valueCells[0].style.textAlign, '');
    f.scan();
    assert.equal(f.table.getAttribute('dir'), 'rtl', 're-enable reapplies table geometry');
}

{
    const f = fixture(['Name', 'Value'], ['برچسب فارسی', 'English']);
    f.scan();
    assert.equal(f.table.getAttribute('dir'), null, 'English headers keep host table order');
    assert.equal(f.valueCells[0].getAttribute('dir'), 'rtl', 'Persian cell still reads RTL');
    assert.equal(f.valueCells[1].getAttribute('dir'), 'ltr', 'English cell text has an independent direction');
}

{
    const f = fixture(['نام', 'مقدار'], ['English', 'https://example.com']);
    f.scan();
    assert.equal(f.valueCells[1].getAttribute('dir'), 'ltr', 'URL-only cell stays LTR');
    f.headerCells[0].childNodes[0].textContent = 'Name';
    f.headerCells[1].childNodes[0].textContent = 'Value';
    f.scan();
    assert.equal(f.table.getAttribute('dir'), null, 'reused English table restores host geometry');
    assert.equal(f.valueCells[0].getAttribute('dir'), 'ltr', 'English cell text remains LTR');
    assert.equal(f.valueCells[1].getAttribute('dir'), null, 'neutral URL cell restores when table is unmanaged');
    assert.equal(f.headerCells[0].getAttribute('dir'), 'ltr', 'stale RTL header switches to LTR');
}

{
    const f = fixture(['نام', 'مقدار'], ['English', '123.45'], {
        attrs: { dir: 'auto' }, style: { direction: 'ltr', textAlign: 'center' }
    });
    f.scan();
    f.engine.restoreStyles();
    recipe.onDisable();
    assert.equal(f.table.getAttribute('dir'), 'auto', 'original dir attribute survives disable');
    assert.equal(f.table.style.direction, 'ltr');
    assert.equal(f.table.style.textAlign, 'center');
}

{
    const table = el('table', {}, el('tr', {}, el('td', {}, t('نام')), el('td', {}, t('مقدار'))),
        el('tr', {}, el('td', {}, t('English')), el('td', {}, t('123.45'))));
    const root = el('div', { attrs: { id: 'model-response-message-content-headerless' } }, table);
    engineFor(root).scan();
    assert.equal(table.getAttribute('dir'), 'rtl', 'first row anchors a headerless table');
}

{
    const inner = fixture(['نام', 'مقدار'], ['English', '123.45']);
    const outer = fixture(['Name', 'Value'], ['English', '123.45']);
    outer.valueCells[1].append(inner.table);
    outer.scan();
    assert.equal(outer.table.getAttribute('dir'), null, 'nested Persian headers do not flip outer table');
    assert.equal(inner.table.getAttribute('dir'), 'rtl', 'nested table owns its geometry');
}

{
    const f = fixture(['نام', 'مقدار'], ['English', '123.45']);
    const codeString = el('span', { cls: 'hljs-string' }, t('"سلام"'));
    const code = el('pre', {}, el('code', {}, t('const label = '), codeString, t(';')));
    f.root.append(code);
    const inlineCode = el('code', {}, t('user.name'));
    f.persian.append(inlineCode);
    f.scan();
    assert.equal(code.getAttribute('dir'), null, 'code is never a direction target');
    assert.equal(codeString.getAttribute('dir'), null, 'highlighted code string stays untouched');
    assert.equal(inlineCode.getAttribute('dir'), null);
}

for (const guard of [
    { attrs: { 'data-test-id': 'overflow-container' } },
    { cls: 'code-container' },
    { attrs: { contenteditable: 'true' } }
]) {
    const f = fixture(['نام', 'مقدار'], ['English', '123.45']);
    el('div', guard, f.root);
    f.scan();
    assert.equal(f.table.getAttribute('dir'), null, 'sidebar/editor/code guards remain in force');
    assert.equal(f.english.getAttribute('dir'), null, 'excluded English prose is unchanged');
}

const fontSource = fs.readFileSync(path.join(__dirname, '../src/core/font-inject.js'), 'utf8');
const geminiSkip = fontSource.match(/"gemini\.google\.com":\s*'([^']+)'/);
assert.equal(geminiSkip?.[1], recipe.codeGuardSelectors.join(', '), 'font guards match Gemini code guards');
console.log('ALL PASS (Gemini prose/table direction, restoration, guards, and font-skip parity)');
