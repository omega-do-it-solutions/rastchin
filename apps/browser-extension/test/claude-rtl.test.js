'use strict';
// Regression suite for Claude's custom recipe walker: Persian DOM tables and
// plain text blocks should become RTL, while real code blocks remain LTR.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'claude-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

class StyleMap {
    constructor() {
        this._props = new Map();
    }
    setProperty(name, value, priority) {
        this._props.set(name, { value, priority: priority || '' });
    }
    removeProperty(name) {
        this._props.delete(name);
    }
    getPropertyValue(name) {
        return (this._props.get(name) || {}).value || '';
    }
    getPropertyPriority(name) {
        return (this._props.get(name) || {}).priority || '';
    }
}

class ClassList {
    constructor(owner) {
        this.owner = owner;
        this.items = new Set();
    }
    add(...classes) {
        classes.forEach(className => {
            if (className) this.items.add(className);
        });
        this.owner.className = Array.from(this.items).join(' ');
    }
    remove(...classes) {
        classes.forEach(className => this.items.delete(className));
        this.owner.className = Array.from(this.items).join(' ');
    }
    contains(className) {
        return this.items.has(className);
    }
}

function matchesPart(node, part) {
    if (!node || node.nodeType !== 1) return false;
    const selector = part.trim();
    let match;
    if (!selector) return false;
    if ((match = selector.match(/^\[([\w-]+)\*=["']?([^"'\]]+)["']?(\s+i)?\]$/))) {
        const value = match[1] === 'class'
            ? (node.className || '')
            : (node.getAttribute(match[1]) || '');
        return match[3]
            ? value.toLowerCase().includes(match[2].toLowerCase())
            : value.includes(match[2]);
    }
    if ((match = selector.match(/^\[([\w-]+)\]$/))) {
        return node.getAttribute(match[1]) !== null;
    }
    if ((match = selector.match(/^\[([\w-]+)=["']?([^"'\]]+)["']?\]$/))) {
        return node.getAttribute(match[1]) === match[2];
    }
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    return node.tagName === selector.toUpperCase();
}

class MockElement {
    constructor(tag, opts = {}) {
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this.children = [];
        this.childNodes = this.children;
        this.parentElement = null;
        this.style = new StyleMap();
        this.attrs = new Map();
        this.className = opts.className || opts.cls || '';
        this.classList = new ClassList(this);
        this.className.split(/\s+/).filter(Boolean).forEach(className => this.classList.add(className));
        Object.entries(opts.attrs || {}).forEach(([key, value]) => this.attrs.set(key, String(value)));
        if (opts.text) this.append(new MockText(opts.text));
    }
    append(...nodes) {
        nodes.forEach(node => {
            node.parentElement = this;
            this.children.push(node);
        });
        return this;
    }
    get textContent() {
        return this.childNodes.map(node => node.textContent || '').join('');
    }
    get innerText() {
        return this.textContent;
    }
    setAttribute(name, value) {
        this.attrs.set(name, String(value));
    }
    removeAttribute(name) {
        this.attrs.delete(name);
    }
    getAttribute(name) {
        return this.attrs.has(name) ? this.attrs.get(name) : null;
    }
    matches(selector) {
        return String(selector).split(',').some(part => matchesPart(this, part));
    }
    closest(selector) {
        let node = this;
        while (node) {
            if (node.matches?.(selector)) return node;
            node = node.parentElement;
        }
        return null;
    }
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
        const selectors = String(selector).split(',').map(part => part.trim()).filter(Boolean);
        const out = [];
        const visit = node => {
            if (!node || node.nodeType !== 1) return;
            if (selectors.some(part => matchesPart(node, part))) out.push(node);
            node.childNodes.forEach(visit);
        };
        this.childNodes.forEach(visit);
        return out;
    }
}

class MockText {
    constructor(text) {
        this.nodeType = 3;
        this.textContent = text;
        this.parentElement = null;
    }
}

const el = (tag, opts, ...children) => new MockElement(tag, opts).append(...children);
const text = value => new MockText(value);

let exported = null;
let registeredRecipe = null;

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        __CLAUDE_RTL_TEST__(api) { exported = api; }
    },
    document: {
        readyState: 'complete',
        addEventListener() {}
    },
    RastChinRecipe: {
        runPlatformRecipe(recipe) { registeredRecipe = recipe; }
    },
    HTMLElement: MockElement,
    Element: MockElement,
    console
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(source, ctx);

const engine = {
    collectDirectionText(node) {
        return node?.innerText || node?.textContent || '';
    },
    hasRtlLetter(value) {
        // Mirrors the real engine: the char must be in the Arabic block AND a
        // LETTER — Persian digits («۱», U+06F1) are NOT letters and must not
        // count, otherwise the numbered-marker heuristic is never exercised.
        for (const ch of String(value || '')) {
            if (/[\u0600-\u06FF]/u.test(ch) && /\p{L}/u.test(ch)) return true;
        }
        return false;
    },
    stripLtrTokens(value) {
        // Simplified mirror of RTLEngine.stripLtrTokens: drop URLs, emails and
        // inline code so token-only lines cannot pass the letter check.
        return String(value || '')
            .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
            .replace(/[\w.+-]+@[\w.-]+\.\w+/g, ' ')
            .replace(/`[^`]*`/g, ' ');
    },
    // Delivery-path spies: claude's walk must hand every RTL text element to
    // engine.isolateInline (and LTR ones to clearInline) — the field bug class
    // was cells the BiDi layer never received.
    isolateInlineCalls: [],
    clearInlineCalls: [],
    isolateInline(element) { this.isolateInlineCalls.push(element); },
    clearInline(element) { this.clearInlineCalls.push(element); }
};

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
    console.error('FATAL: Claude recipe test hook did not run');
    process.exit(1);
}

check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'claudeEnabled');
check('recipe: host claude.ai', registeredRecipe.hosts.includes('claude.ai'), true);
check('recipe: host claudeusercontent.com', registeredRecipe.hosts.includes('claudeusercontent.com'), true);
check('recipe: blank artifact frames can resolve through ancestor gate', registeredRecipe.hosts.includes(''), true);
check('recipe: claudeusercontent subdomains covered', registeredRecipe.hostSuffixes.includes('.claudeusercontent.com'), true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has custom code guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: table roots are message selectors', registeredRecipe.messageSelectors.includes('table'), true);
check('recipe: ARIA table roots are message selectors', registeredRecipe.messageSelectors.includes('[role="table"]'), true);
check('recipe: artifact roots are message selectors',
    registeredRecipe.messageSelectors.includes('[data-testid*="artifact" i]'), true);
check('recipe: code guard no longer treats bare pre as hard code', exported.codeGuardSelectors.includes('pre'), false);

{
    const table = el(
        'table',
        {},
        el(
            'tbody',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('وضعیت فعلی')),
                el('td', {}, text('IMAP credentials رمزگذاری شده است'))
            )
        )
    );

    exported.processElement(table, engine);
    check('table: gets rtl dir', table.getAttribute('dir'), 'rtl');
    check('table: gets rtl table class', table.classList.contains('rastchin-claude-rtl-table'), true);
    check('table cell: gets rtl dir', table.querySelector('td').getAttribute('dir'), 'rtl');
    check('table cell: right aligned', table.querySelector('td').style.getPropertyValue('text-align'), 'right');
    check('table cell: delivered to engine.isolateInline',
        engine.isolateInlineCalls.includes(table.querySelector('td')), true);
}

{
    // ARIA tables (div[role=table] > div[role=row] > div[role=cell]) take the
    // same processTable path as tag tables — defensive coverage for data-grid
    // surfaces; live claude.ai markdown tables are real <table> (2026-06-12).
    const ariaTable = el(
        'div',
        { attrs: { role: 'table' } },
        el(
            'div',
            { attrs: { role: 'row' } },
            el('div', { attrs: { role: 'columnheader' } }, text('قابلیت')),
            el('div', { attrs: { role: 'cell' } }, text('باشگاه مشتریان / CRM'))
        ),
        el(
            'div',
            { attrs: { role: 'row' } },
            el('div', { attrs: { role: 'cell' } }, text('اتصال به POS / کاسه')),
            // chrome inside the grid must stay fenced (qSA jump-over path)
            el('button', {}, el('div', { attrs: { role: 'cell' } }, text('گزینه داخل دکمه')))
        )
    );

    exported.processElement(ariaTable, engine);
    check('aria table: container goes RTL', ariaTable.getAttribute('dir'), 'rtl');
    check('aria table: gets the managed table class', ariaTable.classList.contains('rastchin-claude-rtl-table'), true);
    const cells = ariaTable.querySelectorAll('[role="cell"]');
    check('aria table: persian cell goes RTL', cells[0].getAttribute('dir'), 'rtl');
    check('aria table: mixed cell right aligned', cells[0].style.getPropertyValue('text-align'), 'right');
    check('aria table: header cell goes RTL', ariaTable.querySelector('[role="columnheader"]').getAttribute('dir'), 'rtl');
    check('aria table: chrome-nested cell untouched', cells[2].getAttribute('dir'), null);
}

{
    // Menew-style COMPARISON table (browser-measured repro, 2026-06-12: the
    // injected replica ended dir=null with «ویژگی» leftmost at x=8): Latin
    // domain headers and ✓/×/€/Latin data cells outvote the Persian label
    // column under a flat per-cell majority. Persian in LABEL positions
    // (header row, first column, full-width section rows) must force the
    // table RTL even when most data cells are Latin or neutral symbols.
    const happyHourCell = el('td', {}, text('Happy Hour'));
    const comparison = el(
        'table',
        {},
        el(
            'thead',
            { cls: 'text-left' },
            el(
                'tr',
                {},
                el('th', {}, text('ویژگی')),
                el('th', {}, text('Menew.ir')),
                el('th', {}, text('Menulogy.at')),
                el('th', {}, text('Menuvia'))
            )
        ),
        el(
            'tbody',
            {},
            el(
                'tr',
                {},
                el('td', {}, text('منوی دیجیتال QR')),
                el('td', {}, text('✓')),
                el('td', {}, text('✓')),
                el('td', {}, text('✓'))
            ),
            el(
                'tr',
                {},
                el('td', {}, text('سفارش آنلاین')),
                el('td', {}, text('✓')),
                el('td', {}, text('×')),
                el('td', {}, text('✓'))
            ),
            el(
                'tr',
                {},
                el('td', { attrs: { colspan: '4' } }, text('امکانات پیشرفته'))
            ),
            el(
                'tr',
                {},
                el('td', {}, text('پیشنهاد ویژه')),
                el('td', {}, text('×')),
                happyHourCell,
                el('td', {}, text('×'))
            ),
            el(
                'tr',
                {},
                el('td', {}, text('قیمت پایه')),
                el('td', {}, text('€9')),
                el('td', {}, text('€19')),
                el('td', {}, text('€0'))
            )
        )
    );

    exported.processElement(comparison, engine);
    check('comparison table: Persian label column forces table RTL', comparison.getAttribute('dir'), 'rtl');
    check('comparison table: managed table class lands', comparison.classList.contains('rastchin-claude-rtl-table'), true);
    // the WALK leaves LTR data cells unmanaged; the managed-table CSS rule
    // intentionally flips them visually along with the table
    check('comparison table: walk leaves Latin data cell unmanaged', happyHourCell.getAttribute('dir'), null);
}

{
    // Claude DOM drift guard: if the response wrapper class changes again, a
    // Persian static table must still become a message candidate by itself. The
    // previous E2E only injected tables inside `.font-claude-response`, so it did
    // not prove the real table was reachable when message selectors missed.
    const rescue = el(
        'table',
        {},
        el(
            'thead',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('ویژگی')),
                el('th', {}, text('Menew.ir')),
                el('th', {}, text('Menulogy.at'))
            )
        ),
        el(
            'tbody',
            {},
            el(
                'tr',
                {},
                el('td', {}, text('باشگاه مشتریان / CRM')),
                el('td', {}, text('✓')),
                el('td', {}, text('×'))
            )
        )
    );
    registeredRecipe.applyToMessage(rescue, engine);
    check('table rescue: direct table candidate gets processed', rescue.getAttribute('dir'), 'rtl');
    check('table rescue: managed class lands on direct table candidate',
        rescue.classList.contains('rastchin-claude-rtl-table'), true);
}

{
    // Decisive pin for the HEADER label group (mutation guard): Persian
    // headers must keep the table RTL even when EVERY data cell — including
    // the whole first column — is Latin. The flat letter majority would say
    // LTR here, so this fixture fails if the label tier is removed.
    const mandate = el(
        'table',
        {},
        el(
            'thead',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('ویژگی')),
                el('th', {}, text('توضیح'))
            )
        ),
        el(
            'tbody',
            {},
            el('tr', {}, el('td', {}, text('Docker')), el('td', {}, text('Container runtime'))),
            el('tr', {}, el('td', {}, text('Kubernetes')), el('td', {}, text('Orchestration'))),
            el('tr', {}, el('td', {}, text('Terraform')), el('td', {}, text('Infrastructure as code')))
        )
    );
    exported.processElement(mandate, engine);
    check('persian-headed table: stays RTL over all-Latin data', mandate.getAttribute('dir'), 'rtl');
}

{
    // Audit-regression pin (glossary shape): Persian headers + Latin entity
    // first column + Persian data must stay RTL — pooling both label groups
    // into one count let the Latin first column outvote the Persian headers.
    const glossary = el(
        'table',
        {},
        el(
            'thead',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('واژه انگلیسی')),
                el('th', {}, text('معنی فارسی'))
            )
        ),
        el(
            'tbody',
            {},
            el('tr', {}, el('td', {}, text('Apple')), el('td', {}, text('سیب'))),
            el('tr', {}, el('td', {}, text('Book')), el('td', {}, text('کتاب'))),
            el('tr', {}, el('td', {}, text('Window')), el('td', {}, text('پنجره')))
        )
    );
    exported.processElement(glossary, engine);
    check('glossary table: Persian headers beat Latin first column', glossary.getAttribute('dir'), 'rtl');
}

{
    // One Persian name among Latin rows is NOT a Persian table: the
    // first-column group needs a strict majority and the flat letter
    // majority is Latin, so the table stays unflipped.
    const roster = el(
        'table',
        {},
        el(
            'thead',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('Name')),
                el('th', {}, text('Role')),
                el('th', {}, text('City'))
            )
        ),
        el(
            'tbody',
            {},
            el('tr', {}, el('td', {}, text('Anna')), el('td', {}, text('Developer')), el('td', {}, text('Berlin'))),
            el('tr', {}, el('td', {}, text('محمد')), el('td', {}, text('Designer')), el('td', {}, text('Wien')))
        )
    );
    exported.processElement(roster, engine);
    check('english roster: one Persian row label does not flip the table', roster.getAttribute('dir'), null);
}

{
    // Eastern-numbered Latin entries («۱. Speisly») in the label column are a
    // Persian-author signal: pin the outcome under English headers so the
    // marker/vote interaction cannot silently change.
    const rank = el(
        'table',
        {},
        el(
            'thead',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('Rank')),
                el('th', {}, text('City'))
            )
        ),
        el(
            'tbody',
            {},
            el('tr', {}, el('td', {}, text('۱. Speisly')), el('td', {}, text('Berlin'))),
            el('tr', {}, el('td', {}, text('۲. Menuvia')), el('td', {}, text('Wien'))),
            el('tr', {}, el('td', {}, text('۳. Cartly')), el('td', {}, text('Graz')))
        )
    );
    exported.processElement(rank, engine);
    check('rank table: eastern-marker label column keeps the table RTL', rank.getAttribute('dir'), 'rtl');
}

{
    // Label-less table (headerless, symbol-only first column): the flat
    // letter majority must still decide — the label tiers may not shadow it.
    const flat = el(
        'table',
        {},
        el(
            'tbody',
            {},
            el('tr', {}, el('td', {}, text('✓')), el('td', {}, text('پشتیبانی کامل از فارسی'))),
            el('tr', {}, el('td', {}, text('×')), el('td', {}, text('بدون نیاز به تنظیمات')))
        )
    );
    exported.processElement(flat, engine);
    check('label-less table: flat letter majority decides RTL', flat.getAttribute('dir'), 'rtl');
}

{
    // Symbol-only table: no letter votes anywhere → whole-text fallback,
    // which has no letters either → stays unflipped.
    const symbols = el(
        'table',
        {},
        el('tbody', {}, el('tr', {}, el('td', {}, text('✓')), el('td', {}, text('×'))))
    );
    exported.processElement(symbols, engine);
    check('symbol-only table: stays unflipped via whole-text fallback', symbols.getAttribute('dir'), null);
}

{
    // Cells of a table nested INSIDE a cell vote only in their own table: an
    // English data-widget embedded in one cell must not outvote the outer
    // Persian table (label weighting would amplify its header cells).
    const innerTable = el(
        'div',
        { attrs: { role: 'table' } },
        el(
            'div',
            { attrs: { role: 'row' } },
            el('div', { attrs: { role: 'columnheader' } }, text('Name')),
            el('div', { attrs: { role: 'columnheader' } }, text('Value'))
        ),
        el(
            'div',
            { attrs: { role: 'row' } },
            el('div', { attrs: { role: 'cell' } }, text('Speed')),
            el('div', { attrs: { role: 'cell' } }, text('Fast'))
        )
    );
    const outer = el(
        'table',
        {},
        el(
            'tbody',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('قابلیت')),
                el('td', {}, innerTable)
            )
        )
    );
    exported.processElement(outer, engine);
    check('nested table: outer Persian table stays RTL', outer.getAttribute('dir'), 'rtl');
    check('nested table: inner English table not flipped', innerTable.getAttribute('dir'), null);
}

{
    // Reverse guard: an all-English data table (English headers AND labels,
    // symbols in the data) must stay unflipped — the label rule reads the
    // LANGUAGE of the labels, it is not a blanket flip for every table.
    const english = el(
        'table',
        {},
        el(
            'thead',
            {},
            el(
                'tr',
                {},
                el('th', {}, text('Feature')),
                el('th', {}, text('Price'))
            )
        ),
        el(
            'tbody',
            {},
            el(
                'tr',
                {},
                el('td', {}, text('Online ordering')),
                el('td', {}, text('€9'))
            ),
            el(
                'tr',
                {},
                el('td', {}, text('Happy Hour')),
                el('td', {}, text('✓'))
            )
        )
    );

    exported.processElement(english, engine);
    check('english table: stays unflipped', english.getAttribute('dir'), null);
    check('english table: no managed class', english.classList.contains('rastchin-claude-rtl-table'), false);
}

{
    // td > div > text (block wrapper inside the cell): the cell-level
    // isolateInline stops at the DIV block boundary BY DESIGN (bidi-isolate
    // BLOCK_BOUNDARY), so the recipe walk must hand the DIV ITSELF to the
    // BiDi layer — otherwise «CRM» inside the wrapper is never isolated
    // (browser-measured repro, 2026-06-12: zero <bdi> in the nested variant).
    const innerCrm = el('div', {}, text('باشگاه مشتریان / CRM'));
    const innerPos = el('div', {}, text('اتصال به POS / کاسه'));
    const cellCrm = el('td', {}, innerCrm);
    const cellPos = el('td', {}, innerPos);
    const nested = el(
        'table',
        {},
        el('tbody', {}, el('tr', {}, cellCrm, cellPos))
    );

    exported.processElement(nested, engine);
    check('nested cell: td goes RTL', cellCrm.getAttribute('dir'), 'rtl');
    check('nested cell: td delivered to isolateInline', engine.isolateInlineCalls.includes(cellCrm), true);
    check('nested cell: inner CRM div delivered to isolateInline', engine.isolateInlineCalls.includes(innerCrm), true);
    check('nested cell: inner POS div delivered to isolateInline', engine.isolateInlineCalls.includes(innerPos), true);
    check('nested cell: inner div itself stays unstyled', innerCrm.getAttribute('dir'), null);
}

{
    const block = el(
        'pre',
        {},
        text('[۱۴:۲۳ ساعت] کاربر علی در ایمیل [info@client.at] درخواست ساخت task کرد')
    );

    exported.processElement(block, engine);
    check('plain pre: treated as text block', exported.isPlainTextBlock(block, engine), true);
    check('plain pre: gets rtl dir', block.getAttribute('dir'), 'rtl');
    check('plain pre: gets text-block class', block.classList.contains('rastchin-claude-text-block'), true);
    check('plain pre: uses plaintext bidi', block.style.getPropertyValue('unicode-bidi'), 'plaintext');
}

{
    const block = el('pre', {}, el('code', { cls: 'language-js' }, text('const message = "سلام";')));

    exported.processElement(block, engine);
    check('pre > code: hard code detected', exported.isHardCodeElement(block, engine), true);
    check('pre > code: stays ltr', block.getAttribute('dir'), 'ltr');
    check('pre > code: gets code class', block.classList.contains('rastchin-claude-code-ltr'), true);
}

{
    // Streaming safety: processing a live Persian text element that embeds Latin
    // tokens must NOT replace its text node(s) with <span> wrappers. The old
    // wrapLatinTextNode path called node.parentNode.replaceChild on live nodes and
    // crashed Claude's streaming React tree ("removeChild"/"insertBefore" errors).
    const para = el('p', {}, text('گزارش organization config آمادهٔ ارسال به user@host است'));
    const originalTextNode = para.childNodes[0];

    exported.processElement(para, engine);
    check('streaming-safe: text node count unchanged (no span split)', para.childNodes.length, 1);
    check('streaming-safe: original live text node preserved', para.childNodes[0], originalTextNode);
    check('streaming-safe: no <span> wrappers injected', para.querySelectorAll('span').length, 0);
    check('streaming-safe: text content left byte-identical', para.textContent, 'گزارش organization config آمادهٔ ارسال به user@host است');
    check('streaming-safe: Persian element still goes RTL', para.getAttribute('dir'), 'rtl');
    check('streaming-safe: relies on plaintext bidi (no span isolation)', para.style.getPropertyValue('unicode-bidi'), 'plaintext');
}

{
    // Persian-numbered Latin lines («۱. Speisly») must go RTL even though the
    // digits are not letters; token-only and digit-only lines must NOT flip.
    const numberedPara = el('p', {}, text('۱. Speisly'));
    exported.processElement(numberedPara, engine);
    check('numbered marker: «۱. Speisly» paragraph goes RTL', numberedPara.getAttribute('dir'), 'rtl');
    // plaintext would re-derive an LTR paragraph from the first strong (Latin)
    // letter; isolate honors dir=rtl (browser-measured: marker lands right).
    check('numbered marker: marker-forced block uses unicode-bidi isolate',
        numberedPara.style.getPropertyValue('unicode-bidi'), 'isolate');

    const numberedHeading = el('h3', {}, text('۲) Menuvia'));
    exported.processElement(numberedHeading, engine);
    check('numbered marker: «۲) Menuvia» heading goes RTL', numberedHeading.getAttribute('dir'), 'rtl');

    const numberedItem = el('li', {}, text('۳- Tischly'));
    exported.processElement(numberedItem, engine);
    check('numbered marker: «۳- Tischly» list item goes RTL', numberedItem.getAttribute('dir'), 'rtl');

    const arabicIndicItem = el('li', {}, text('٤. Cartly'));
    exported.processElement(arabicIndicItem, engine);
    check('numbered marker: Arabic-Indic digits also count', arabicIndicItem.getAttribute('dir'), 'rtl');

    // Claude often renders such lists as ONE <p> with <br> line breaks — a
    // marker at ANY line start counts (multiline anchor).
    const multiLine = el('p', {}, text('intro line\n۲. Menuvia ادامه'));
    exported.processElement(multiLine, engine);
    check('numbered marker: marker on a later line still flips the block', multiLine.getAttribute('dir'), 'rtl');

    const digitsOnly = el('p', {}, text('۱۲۳'));
    exported.processElement(digitsOnly, engine);
    check('numbered marker: bare Persian digits stay LTR', digitsOnly.getAttribute('dir'), null);

    const urlOnly = el('p', {}, text('۱. https://example.com/docs'));
    exported.processElement(urlOnly, engine);
    check('numbered marker: URL-only item stays LTR', urlOnly.getAttribute('dir'), null);

    const emailOnly = el('p', {}, text('۴. user@example.com'));
    exported.processElement(emailOnly, engine);
    check('numbered marker: email-only item stays LTR', emailOnly.getAttribute('dir'), null);

    const codeOnly = el('p', {}, text('۵. `const x = 1;`'));
    exported.processElement(codeOnly, engine);
    check('numbered marker: inline-code-only item stays LTR', codeOnly.getAttribute('dir'), null);

    const urlThenEnglish = el('p', {}, text('۱. https://example.com/docs\nPlain English paragraph'));
    exported.processElement(urlThenEnglish, engine);
    check('numbered marker: URL-only marker line does not borrow letters from next line',
        urlThenEnglish.getAttribute('dir'), null);

    const blankMarkerThenEnglish = el('p', {}, text('۱. \nSpeisly'));
    exported.processElement(blankMarkerThenEnglish, engine);
    check('numbered marker: blank marker line does not borrow next-line letters',
        blankMarkerThenEnglish.getAttribute('dir'), null);

    const rawConst = el('p', {}, text('۱. const x = 1;'));
    exported.processElement(rawConst, engine);
    check('numbered marker: raw code-like const line stays LTR', rawConst.getAttribute('dir'), null);

    const rawSql = el('p', {}, text('۲. SELECT * FROM users'));
    exported.processElement(rawSql, engine);
    check('numbered marker: raw SQL-like line stays LTR', rawSql.getAttribute('dir'), null);

    const plainLatin = el('p', {}, text('Speisly is a menu platform'));
    exported.processElement(plainLatin, engine);
    check('numbered marker: unmarked Latin prose stays LTR', plainLatin.getAttribute('dir'), null);

    const versionish = el('p', {}, text('نسخه ۱.۲.۳ آماده است'));
    exported.processElement(versionish, engine);
    check('numbered marker: Persian prose with version number still RTL (letters path)', versionish.getAttribute('dir'), 'rtl');
    check('numbered marker: letter-driven RTL keeps plaintext bidi',
        versionish.style.getPropertyValue('unicode-bidi'), 'plaintext');

    const numberedCell = el('td', {}, text('۵. Scantable'));
    exported.processElement(numberedCell, engine);
    check('numbered marker: table cell with marker goes RTL', numberedCell.getAttribute('dir'), 'rtl');
    check('numbered marker: RTL paragraph delivered to isolateInline',
        engine.isolateInlineCalls.includes(numberedPara), true);

    // dash-shaped NON-markers must stay LTR: scorelines, year ranges, ranges
    const scoreline = el('p', {}, text('۳ - ۲ Real Madrid'));
    exported.processElement(scoreline, engine);
    check('numbered marker: scoreline stays LTR', scoreline.getAttribute('dir'), null);

    const mixedDigitScoreline = el('p', {}, text('۳ - 2 Real Madrid'));
    exported.processElement(mixedDigitScoreline, engine);
    check('numbered marker: mixed eastern/latin-digit scoreline stays LTR',
        mixedDigitScoreline.getAttribute('dir'), null);

    const yearRange = el('p', {}, text('۱۳۹۵ – Google internship'));
    exported.processElement(yearRange, engine);
    check('numbered marker: year range stays LTR', yearRange.getAttribute('dir'), null);

    const numericRange = el('p', {}, text('۱۰ - ۲۰ km'));
    exported.processElement(numericRange, engine);
    check('numbered marker: numeric range stays LTR', numericRange.getAttribute('dir'), null);

    const mixedDigitRange = el('p', {}, text('۱۰ - 20 km'));
    exported.processElement(mixedDigitRange, engine);
    check('numbered marker: mixed eastern/latin-digit numeric range stays LTR',
        mixedDigitRange.getAttribute('dir'), null);

    // a digit-only line must not bind to the NEXT line across \n
    const crossLine = el('p', {}, text('۱.\nSpeisly'));
    exported.processElement(crossLine, engine);
    check('numbered marker: digit-only line does not bind across newline', crossLine.getAttribute('dir'), null);

    // plain <pre> path mirrors the same marker handling (isolate, not plaintext)
    const markerPre = el('pre', {}, text('۱. Speisly\n۲. Menuvia'));
    exported.processElement(markerPre, engine);
    check('numbered marker: plain pre with markers goes RTL', markerPre.getAttribute('dir'), 'rtl');
    check('numbered marker: marker-forced pre uses isolate (not plaintext)',
        markerPre.style.getPropertyValue('unicode-bidi'), 'isolate');
}

check('selectors: dropped over-broad [class*="Message"]', registeredRecipe.messageSelectors.includes('[class*="Message"]'), false);
check('selectors: dropped over-broad bare article', registeredRecipe.messageSelectors.includes('article'), false);
check('selectors: keeps precise Claude message wrapper', registeredRecipe.messageSelectors.includes('.font-claude-message'), true);
check('selectors: adds current Claude response wrapper', registeredRecipe.messageSelectors.includes('.font-claude-response'), true);
check('selectors: excludeSelectors fence buttons', registeredRecipe.excludeSelectors.includes('button'), true);
check('selectors: excludeSelectors fence cds icon spans', registeredRecipe.excludeSelectors.includes('[data-cds="Icon"]'), true);
check('selectors: excludeSelectors does not fence generic role=group prose', registeredRecipe.excludeSelectors.includes('[role="group"]'), false);

check('ui guard: button matches', exported.isUiChromeElement(el('button', {})), true);
check('ui guard: cds icon span matches', exported.isUiChromeElement(el('span', { attrs: { 'data-cds': 'Icon' } })), true);
check('ui guard: prose paragraph does not match', exported.isUiChromeElement(el('p', {})), false);

{
    // Mirrors claude.ai's live turn DOM (captured 2026-06-12): the action bar
    // (Copy / Read aloud / feedback / Retry) lives INSIDE [data-test-render-count]
    // but OUTSIDE .font-claude-response, and its icons are icon-FONT glyphs in
    // span[data-cds="Icon"] — so the walk must style the prose and leave every
    // part of the action bar untouched.
    const iconGlyph = text('\uE9CA'); // real Anthropicons-style PUA glyph
    const icon = el('span', { attrs: { 'data-cds': 'Icon', 'aria-hidden': 'true' } }, iconGlyph);
    const copyButton = el(
        'button',
        { attrs: { 'aria-label': 'Copy', 'data-testid': 'action-bar-copy' } },
        el('span', { cls: 'relative' }, icon)
    );
    const actionBar = el(
        'div',
        { attrs: { role: 'group', 'aria-label': 'Message actions' } },
        el('div', { cls: 'text-text-300' }, copyButton)
    );
    const prosePara = el('p', { cls: 'font-claude-response-body' }, text('سلام دنیا این یک پاسخ است'));
    const prose = el('div', { cls: 'font-claude-response' }, el('div', { cls: 'standard-markdown' }, prosePara));
    const turn = el(
        'div',
        { attrs: { 'data-test-render-count': '2' } },
        prose,
        el('div', { cls: 'group' }, actionBar)
    );

    registeredRecipe.applyToMessage(turn, engine);
    check('action bar: prose paragraph still goes RTL', prosePara.getAttribute('dir'), 'rtl');
    check('action bar: group container not styled', actionBar.getAttribute('dir'), null);
    check('action bar: copy button untouched', copyButton.getAttribute('dir'), null);
    check('action bar: copy button gains no managed classes', copyButton.className, '');
    check('action bar: icon span untouched', icon.getAttribute('dir'), null);
    check('action bar: icon glyph text node preserved', icon.childNodes[0], iconGlyph);
    check('action bar: turn wrapper itself not styled', turn.getAttribute('dir'), null);
}

{
    const groupPara = el('p', {}, text('این متن فارسی داخل گروه محتوایی است'));
    const contentGroup = el('div', { attrs: { role: 'group' } }, groupPara);
    const turn = el('div', { attrs: { 'data-test-render-count': '2b' } }, contentGroup);

    registeredRecipe.applyToMessage(turn, engine);
    check('role=group prose: paragraph still goes RTL', groupPara.getAttribute('dir'), 'rtl');
    check('role=group prose: wrapper itself not styled', contentGroup.getAttribute('dir'), null);
}

{
    // Claude's generated comparison cards can render outside the standard
    // markdown paragraph/table shape: div-only cards, inline spans, and
    // artifact-scoped buttons. Those Persian leaves still need Vazirmatn and
    // RTL without opening the global button/action-bar guard.
    const cardTitle = el('div', {}, text('رانندگی اقتصادی'));
    const price = el('span', {}, text('۳۶,۹۹۰€ از'));
    const cta = el('button', { attrs: { role: 'button' } }, text('بیشتر ببین'));
    const latinMeta = el('div', {}, text('BYD SEAL U'));
    const card = el('div', { cls: 'vehicle-card' }, cardTitle, price, cta, latinMeta);
    const artifact = el('div', { attrs: { 'data-testid': 'artifact-card-render' } }, card);

    registeredRecipe.applyToMessage(artifact, engine);
    check('artifact card: direct div text goes RTL', cardTitle.getAttribute('dir'), 'rtl');
    check('artifact card: direct div receives managed card class',
        cardTitle.classList.contains('rastchin-claude-card-text'), true);
    check('artifact card: span text goes RTL', price.getAttribute('dir'), 'rtl');
    check('artifact card: artifact content button can be processed', cta.getAttribute('dir'), 'rtl');
    check('artifact card: latin metadata stays LTR/unmanaged', latinMeta.getAttribute('dir'), null);
}

{
    // Containers that CARRY their own text (direct non-whitespace text node)
    // must be handed to the BiDi layer and, inside generated message/content
    // surfaces, receive a narrow text class so div-only generated cards do not
    // keep Claude's default font/alignment.
    // clearInline strips wrappers RECURSIVELY, so it may fire ONLY on a true
    // rtl→ltr transition of a container this walk previously isolated:
    // an unconditional per-walk clear would tear out nested paragraphs'
    // <bdi>s and feed an observer rescan loop. Whitespace-only layout
    // wrappers must trigger nothing at all.
    const flipTextNode = text('باشگاه مشتریان / CRM');
    const flipDiv = el('div', {}, flipTextNode);
    const latinDiv = el('div', {}, text('plain latin wrapper text'));
    const nestedPara = el('p', {}, text('متن فارسی داخل پاراگراف'));
    const spacerDiv = el('div', {}, text('\n    '), nestedPara);
    const turn = el('div', { attrs: { 'data-test-render-count': '2c' } }, flipDiv, latinDiv, spacerDiv);

    registeredRecipe.applyToMessage(turn, engine);
    check('container text: Persian-text div delivered to isolateInline', engine.isolateInlineCalls.includes(flipDiv), true);
    check('container text: Persian-text div goes RTL', flipDiv.getAttribute('dir'), 'rtl');
    check('container text: Persian-text div receives card text class',
        flipDiv.classList.contains('rastchin-claude-card-text'), true);
    check('container text: never-isolated LTR div NOT cleared', engine.clearInlineCalls.includes(latinDiv), false);
    check('container text: whitespace-only wrapper NOT isolated', engine.isolateInlineCalls.includes(spacerDiv), false);
    check('container text: whitespace-only wrapper NOT cleared', engine.clearInlineCalls.includes(spacerDiv), false);
    check('container text: nested paragraph still processed', nestedPara.getAttribute('dir'), 'rtl');

    // rtl→ltr transition: the SAME container re-walked with Latin-only text
    // is cleared exactly once, then stays quiet on steady-state walks.
    flipTextNode.textContent = 'edited to plain latin';
    registeredRecipe.applyToMessage(turn, engine);
    check('container text: rtl→ltr transition delivered to clearInline', engine.clearInlineCalls.includes(flipDiv), true);
    const clearsAfterTransition = engine.clearInlineCalls.filter(node => node === flipDiv).length;
    registeredRecipe.applyToMessage(turn, engine);
    check('container text: steady-state LTR walk does not clear again',
        engine.clearInlineCalls.filter(node => node === flipDiv).length, clearsAfterTransition);
}

{
    // DISCRIMINATING fixtures: the pre-fix walk *would* have styled all of
    // these (DIV containers recursed into, P/LI are targets) — the chrome
    // fence must leave them alone while normal prose still goes RTL.
    const toolbarPara = el('p', {}, text('این متن فارسی داخل تولبار است'));
    const katexPara = el('p', { cls: 'katex-block' }, text('فرمول ریاضی فارسی'));
    const chromeLi = el('li', {}, text('گزینه فارسی داخل دکمه'));
    const list = el(
        'ul',
        {},
        el('li', {}, text('مورد عادی فارسی')),
        el('button', {}, el('ul', {}, chromeLi))
    );
    const turn = el(
        'div',
        { attrs: { 'data-test-render-count': '3' } },
        el('div', { attrs: { role: 'toolbar' } }, toolbarPara),
        katexPara,
        list
    );
    registeredRecipe.applyToMessage(turn, engine);
    check('chrome fence: paragraph inside role=toolbar left unstyled', toolbarPara.getAttribute('dir'), null);
    check('chrome fence: katex block left unstyled', katexPara.getAttribute('dir'), null);
    check('chrome fence: normal list item still styled', list.childNodes[0].getAttribute('dir'), 'rtl');
    check('chrome fence: chrome-nested list item untouched', chromeLi.getAttribute('dir'), null);
}

// --- Artifact / MCP-app frame (claudemcpcontent.com) regression --------------
// The live car-comparison cards render inside a DEDICATED cross-origin iframe on
// <hash>.claudemcpcontent.com (live-verified 2026-06-18: body > div#vis-container
// > .car-grid > .car-card). That document has NO .font-claude-* /
// [data-test-render-count] / artifact-class wrapper, so before this fix the
// recipe's message selectors never matched inside it and the cards kept Claude's
// default LTR "Anthropic Sans" font. These checks load the source as if it ran in
// that frame and assert the whole <body> becomes the generated surface, while the
// MAIN claude.ai document is never wholesale-flipped.
check('recipe: claudemcpcontent.com is a recipe host',
    registeredRecipe.hosts.includes('claudemcpcontent.com'), true);
check('recipe: claudemcpcontent subdomains covered',
    registeredRecipe.hostSuffixes.includes('.claudemcpcontent.com'), true);
check('host-match: mcp-app subdomain detected as artifact frame',
    typeof exported.isArtifactFrameHost === 'function' && exported.isArtifactFrameHost('3ab55ff.claudemcpcontent.com'), true);
check('host-match: classic artifact host detected',
    typeof exported.isArtifactFrameHost === 'function' && exported.isArtifactFrameHost('claudeusercontent.com'), true);
check('host-match: main claude.ai is NOT an artifact frame',
    typeof exported.isArtifactFrameHost === 'function' && exported.isArtifactFrameHost('claude.ai'), false);
check('host-match: unrelated host is NOT an artifact frame',
    typeof exported.isArtifactFrameHost === 'function' && exported.isArtifactFrameHost('example.com'), false);
// MAIN claude.ai document: body must NEVER be a message root (flipping the whole
// app would wreck the sidebar/composer/action bars), and the loaded module here
// (no window.location) must not think it is an artifact frame.
check('main frame: body is NOT a message selector', registeredRecipe.messageSelectors.includes('body'), false);
check('main frame: not detected as artifact frame', Boolean(exported.isArtifactFrame), false);

function loadClaudeRecipe(hostname, opts = {}) {
    let exp = null;
    let rec = null;
    const location = { hostname };
    if (opts.ancestorOrigins) location.ancestorOrigins = opts.ancestorOrigins;
    const c = {
        chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
        window: {
            __CLAUDE_RTL_TEST__(api) { exp = api; },
            location
        },
        document: { readyState: 'complete', addEventListener() {}, referrer: opts.referrer || '' },
        RastChinRecipe: { runPlatformRecipe(recipe) { rec = recipe; } },
        HTMLElement: MockElement,
        Element: MockElement,
        console
    };
    c.window.window = c.window;
    vm.createContext(c);
    vm.runInContext(source, c);
    return { exported: exp, recipe: rec };
}

{
    const mcp = loadClaudeRecipe('3ab55ff684593a5518881205f01b3244.claudemcpcontent.com');
    check('mcp frame: detected as artifact frame', Boolean(mcp.exported.isArtifactFrame), true);
    check('mcp frame: body becomes a message root', mcp.recipe.messageSelectors.includes('body'), true);

    // Live MCP-app body shape:
    //   body > svg(icon), div#vis-container > .car-grid > .car-card
    //            > h2.sr-only, div.badge "ارزان‌ترین", p "از €36,990",
    //              span "برد (WLTP)", button.ask-btn "بیشتر بپرس ↗"
    //        , div#action-btns > button#png-btn "Download PNG", button#copy-btn(icon)
    const bodyIcon = el('svg', {});
    const title = el('h2', { cls: 'sr-only' }, text('مقایسه سه خودرو برقی'));
    const badge = el('div', { cls: 'badge green' }, text('ارزان‌ترین'));
    const price = el('p', {}, text('از €36,990'));
    const range = el('span', {}, text('برد (WLTP)'));
    const askBtn = el('button', { cls: 'ask-btn', attrs: { type: 'button' } }, text('بیشتر بپرس ↗'));
    const card = el('div', { cls: 'car-card' }, title, badge, price, range, askBtn);
    const grid = el('div', { cls: 'car-grid' }, card);
    const visContainer = el('div', { attrs: { id: 'vis-container' } }, grid);
    const pngBtn = el('button', { attrs: { id: 'png-btn', role: 'button' } }, text('Download PNG'));
    const copyBtn = el('button', { attrs: { id: 'copy-btn', role: 'button' } }, el('svg', {}));
    const actionBtns = el('div', { attrs: { id: 'action-btns' } }, pngBtn, copyBtn);
    const body = el('body', {}, bodyIcon, visContainer, actionBtns);

    mcp.recipe.applyToMessage(body, engine);

    // Card content gets RTL + the Vazirmatn-bearing managed card class:
    check('mcp card: container badge text goes RTL', badge.getAttribute('dir'), 'rtl');
    check('mcp card: container badge gets managed card class',
        badge.classList.contains('rastchin-claude-card-text'), true);
    check('mcp card: paragraph price goes RTL', price.getAttribute('dir'), 'rtl');
    check('mcp card: span range goes RTL', range.getAttribute('dir'), 'rtl');
    check('mcp card: Persian content button (ask-btn) is processed', askBtn.getAttribute('dir'), 'rtl');
    check('mcp card: Persian content button gets managed card class',
        askBtn.classList.contains('rastchin-claude-card-text'), true);

    // Chrome stays untouched: the icon-only toolbar button, the English
    // "Download PNG" button, and the standalone body icon SVG must NOT flip.
    check('mcp chrome: icon-only toolbar button stays LTR/unmanaged', copyBtn.getAttribute('dir'), null);
    check('mcp chrome: English "Download PNG" button stays LTR/unmanaged', pngBtn.getAttribute('dir'), null);
    check('mcp chrome: standalone body icon SVG untouched', bodyIcon.getAttribute('dir'), null);

    // Frame-wide font scope: globalCss must put Vazirmatn on the whole <body>.
    const mcpCss = mcp.recipe.globalCss();
    check('mcp css: font scope includes the body root', /:is\([^)]*\bbody\b/.test(mcpCss), true);
    check('mcp css: still ships the managed card-text rule', mcpCss.includes('.rastchin-claude-card-text'), true);
}

// The live MCP-app cards frame boots as about:blank (empty hostname) and only
// later resolves to <hash>.claudemcpcontent.com, so a load-time hostname snapshot
// misses it (live-verified 2026-06-18: the cards frame's content script saw
// hostname="" at inject time and stayed in the main-claude code path). Detection
// must fall back to ancestor origins for blank-host frames.
{
    const blankNested = loadClaudeRecipe('', { ancestorOrigins: ['https://3ab55ff.claudemcpcontent.com', 'https://claude.ai'] });
    check('blank frame under claudemcpcontent ancestor: detected as artifact frame',
        Boolean(blankNested.exported.isArtifactFrame), true);
    check('blank frame under claudemcpcontent ancestor: body becomes a message root',
        blankNested.recipe.messageSelectors.includes('body'), true);
}
{
    const blankViaReferrer = loadClaudeRecipe('', { referrer: 'https://abc.claudeusercontent.com/app' });
    check('blank frame with artifact referrer: detected as artifact frame',
        Boolean(blankViaReferrer.exported.isArtifactFrame), true);
}
{
    // A blank frame whose only ancestor is the MAIN app must NOT flip to artifact
    // mode — that would wholesale-flip stray about:blank frames on claude.ai.
    const blankOnMain = loadClaudeRecipe('', { ancestorOrigins: ['https://claude.ai'] });
    check('blank frame under claude.ai (no artifact ancestor): NOT an artifact frame',
        Boolean(blankOnMain.exported.isArtifactFrame), false);
    check('blank frame under claude.ai: body is NOT a message root',
        blankOnMain.recipe.messageSelectors.includes('body'), false);
}

const css = registeredRecipe.globalCss();
check('css: protects pre code blocks', css.includes('pre:has(code)'), true);
check('css: keeps normal content on text stack', css.includes('ui-sans-serif') && css.includes('"Segoe UI"'), true);
check('css: no longer ships dead Latin token class', css.includes('.rastchin-claude-latin'), false);
check('css: has mono fallback for text blocks', css.includes('rastchin-claude-text-block') && css.includes('ui-monospace'), true);
check('css: normalizes word spacing', css.includes('word-spacing: normal'), true);
check('css: prose scope includes current response wrapper', css.includes('.font-claude-response'), true);
const iconGuard = exported.uiIconGuardSelectors.join(', ');
check('css: font override fences icon carriers with a zero-specificity guard',
    css.includes(`:where(:not(:is(${iconGuard})):not(:is(${iconGuard}) *))`), true);
check('css: buttons deliberately NOT fenced from the font override', css.includes(':not(:is(button'), false);
check('css: direct artifact/button prose can receive the content font',
    css.includes('small, button, table'), true);
check('css: managed card text class exists', css.includes('.rastchin-claude-card-text'), true);
check('css: cds icon spans inside the guard list', css.includes('[data-cds="Icon"]'), true);
check('css: anthropicons inline-style net inside the guard list', css.includes('anthropicons'), true);
check('css: role-based table cells covered by the rtl table rule',
    css.includes('.rastchin-claude-rtl-table[role="table"]') && css.includes('[role="columnheader"]'), true);
check('css: interactive role=grid deliberately NOT force-flipped', css.includes('[role="grid"]'), false);
// Managed tables must be font-self-sufficient: claude.ai puts the serif stack
// on the response wrapper, and LTR cells inside an RTL table carry no managed
// class — without an own-cell rule they depend on inheritance alone the moment
// claude styles cells directly. Table-part tags can never be icon carriers.
// (Regex pins: a bare includes() would match the DIRECTION rule's identical
// selector — the rule body must actually set font-family.)
check('css: managed table parts carry the content font themselves',
    /\.rastchin-claude-rtl-table :is\(thead, tbody, tfoot, tr, th, td\)[^{]*\{[^}]*font-family/.test(css), true);
check('css: managed ARIA table parts carry the content font too',
    /\.rastchin-claude-rtl-table :is\(\[role="row"\], \[role="rowgroup"\], \[role="cell"\], \[role="columnheader"\], \[role="rowheader"\]\)[^{]*\{[^}]*font-family/.test(css), true);
check('css: managed tables declare a full-range Claude-local Vazirmatn alias',
    css.includes('font-family: "RastChinClaudeVazirmatn"') && css.includes('Vazirmatn[wght].ttf'), true);
check('css: managed table font stack leads with the full-range alias',
    css.includes('font-family: "RastChinClaudeVazirmatn", "Vazirmatn"'), true);
check('css: managed table descendants carry table font behind the icon fence',
    css.includes(`.rastchin-claude-rtl-table :where(:not(:is(${iconGuard})):not(:is(${iconGuard}) *))`), true);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
