'use strict';
// Regression suite for src/core/bidi-isolate.js (RastChinBidi). Run:
// `node test/bidi-isolate.test.js` (or `pnpm test`). Exits non-zero on failure.
// Covers: findLtrRuns segmentation for every reported mixed-script fixture,
// isolateElement DOM wrapping (<bdi dir="ltr">), idempotency, protected-content
// skipping, copy preservation, and clearIsolation reversal. Browser-only behavior
// (live rendering, framework reconciliation) is NOT covered here.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { El, el, t, makeDocument } = require('./engine-harness');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'core', 'bidi-isolate.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function loadModule() {
    const ctx = { document: makeDocument(), console };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return ctx.RastChinBidi;
}

const Bidi = loadModule();

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (!ok) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

// --- helpers ---------------------------------------------------------------
function runStrings(text) {
    return Bidi.findLtrRuns(text).map(r => text.slice(r.start, r.end));
}
function concatText(node) {
    if (node.nodeType === 3) return node.textContent || '';
    let out = '';
    for (const child of node.childNodes || []) out += concatText(child);
    return out;
}
function wrapperTexts(root) {
    const out = [];
    const visit = node => {
        if (Bidi.isWrapper(node)) out.push(concatText(node));
        for (const child of node.childNodes || []) {
            if (child.nodeType === 1) visit(child);
        }
    };
    visit(root);
    return out;
}
function wrapperCount(root) {
    return wrapperTexts(root).length;
}

// --- findLtrRuns: the reported mixed-script fixtures ------------------------
const ZWNJ = '‌';
const runCases = [
    // [label, text, expected wrapped substrings]
    ['pure Persian heading + colon (no Latin)', 'کلمات آلمانی مرتبط با منوی رستوران و کافه:', []],
    ['Latin word + Persian parenthetical', 'Kaffeehaus (کافه‌هاوس)', ['Kaffeehaus']],
    ['numbered list item with Latin brand', '۱. Menüly ساده‌ترین و مستقیم‌ترین گزینه منو', ['Menüly']],
    ['two Latin brands split by Persian', 'Kartio از Karte', ['Kartio', 'Karte']],
    ['Persian phrase / Latin acronym', 'باشگاه مشتریان / CRM', ['CRM']],
    ['Latin acronym between Persian, slash', 'اتصال به POS / کاسه', ['POS']],
    ['Latin acronym pair with interior slash', 'DSGVO / GDPR کامپلاینس', ['DSGVO / GDPR']],
    ['Latin parenthetical keeps balanced close', 'نسخه CRM (ERP) فارسی', ['CRM (ERP)']],
    ['Persian question mark stays in container', 'آیا CRM؟ ادامه', ['CRM']],
    ['Latin + ZWNJ + Persian suffix', 'SaaS' + ZWNJ + 'های آلمانی', ['SaaS']],
    ['bare domain inside Persian', 'سایت mently.com را ببین', ['mently.com']],
    ['domain only', 'mently.com', ['mently.com']],
    ['URL stays one contiguous run', 'برای اطلاعات https://example.com/path?q=1 را ببین', ['https://example.com/path?q=1']],
    ['email stays one contiguous run', 'ایمیل user@example.com را بفرست', ['user@example.com']],
    ['interior whitespace keeps phrase together', 'یک Coffee House خوب', ['Coffee House']],
    ['leading Latin run', 'CRM یعنی باشگاه مشتریان', ['CRM']],
    ['trailing Latin run', 'باشگاه مشتریان یعنی CRM', ['CRM']],
];
for (const [label, text, expected] of runCases) {
    check(`findLtrRuns: ${label}`, runStrings(text), expected);
}

// --- isolateElement: DOM structure -----------------------------------------
{
    const p = el('p', {}, t('اتصال به POS / کاسه'));
    const changed = Bidi.isolateElement(p);
    check('isolate POS: one text node rewritten', changed, 1);
    check('isolate POS: child count', p.childNodes.length, 3);
    check('isolate POS: leading text', p.childNodes[0].textContent, 'اتصال به ');
    check('isolate POS: wrapper tag', p.childNodes[1].tagName, 'BDI');
    check('isolate POS: wrapper dir', p.childNodes[1].getAttribute('dir'), 'ltr');
    check('isolate POS: wrapper mark', p.childNodes[1].getAttribute(Bidi.MARK_ATTR), 'ltr');
    check('isolate POS: wrapper text', concatText(p.childNodes[1]), 'POS');
    check('isolate POS: trailing text', p.childNodes[2].textContent, ' / کاسه');
    check('isolate POS: copy preserved', concatText(p), 'اتصال به POS / کاسه');
}

{
    const li = el('li', {}, t('Kartio از Karte'));
    Bidi.isolateElement(li);
    check('isolate Kartio: two wrappers', wrapperCount(li), 2);
    check('isolate Kartio: leading wrapper is first child', li.childNodes[0].tagName, 'BDI');
    check('isolate Kartio: wrapper texts', wrapperTexts(li), ['Kartio', 'Karte']);
    check('isolate Kartio: copy preserved', concatText(li), 'Kartio از Karte');
}

{
    const td = el('td', {}, t('DSGVO / GDPR کامپلاینس'));
    Bidi.isolateElement(td);
    check('isolate DSGVO: one wrapper', wrapperCount(td), 1);
    check('isolate DSGVO: interior slash kept inside run', wrapperTexts(td), ['DSGVO / GDPR']);
    check('isolate DSGVO: copy preserved', concatText(td), 'DSGVO / GDPR کامپلاینس');
}
{
    const td = el('td', {},
        t('DSGVO '),
        el('em', {}, t('/')),
        t(' GDPR کامپلاینس')
    );
    Bidi.isolateElement(td);
    check('isolate split DSGVO: separator included in isolated stream', wrapperTexts(td), ['DSGVO ', '/', ' GDPR']);
    check('isolate split DSGVO: copy preserved', concatText(td), 'DSGVO / GDPR کامپلاینس');
}
{
    const p = el('p', {}, t('نسخه CRM (ERP) فارسی'));
    Bidi.isolateElement(p);
    check('isolate balanced parens: one wrapper', wrapperCount(p), 1);
    check('isolate balanced parens: closing paren included', wrapperTexts(p), ['CRM (ERP)']);
    check('isolate balanced parens: copy preserved', concatText(p), 'نسخه CRM (ERP) فارسی');
}

{
    const li = el('li', {}, t('Kaffeehaus (کافه‌هاوس)'));
    Bidi.isolateElement(li);
    check('isolate Kaffeehaus: one wrapper', wrapperCount(li), 1);
    check('isolate Kaffeehaus: bracket left to container', wrapperTexts(li), ['Kaffeehaus']);
    check('isolate Kaffeehaus: trailing keeps parens', li.childNodes[1].textContent, ' (کافه‌هاوس)');
}

// --- slash policy pin (browser-measured, 2026-06-12) ------------------------
// Visual order was measured with Range rects on real claude.ai table cells and
// a clean lab (dir=rtl, both unicode-bidi modes): the CURRENT segmentation —
// slash left OUTSIDE the wrapper, in the RTL container — renders all three
// reported phrases in the correct RTL order. Attaching the slash to the Latin
// run was MEASURED WRONG (the slash lands at the far left of the cell). These
// assertions pin the verified policy on purpose.
{
    const cell = el('td', {}, t('باشگاه مشتریان / CRM'));
    Bidi.isolateElement(cell);
    check('CRM pin: one wrapper', wrapperCount(cell), 1);
    check('CRM pin: wrapper text', wrapperTexts(cell), ['CRM']);
    check('CRM pin: slash stays in the RTL container', cell.childNodes[0].textContent, 'باشگاه مشتریان / ');
    check('CRM pin: copy preserved', concatText(cell), 'باشگاه مشتریان / CRM');
}

// --- idempotency -----------------------------------------------------------
{
    const p = el('p', {}, t('اتصال به POS / کاسه'));
    Bidi.isolateElement(p);
    const firstHtml = p.childNodes.map(n => n.tagName || `#${n.textContent}`).join('|');
    const secondChanged = Bidi.isolateElement(p);
    const secondHtml = p.childNodes.map(n => n.tagName || `#${n.textContent}`).join('|');
    check('idempotent: second pass rewrites nothing', secondChanged, 0);
    check('idempotent: structure unchanged', secondHtml, firstHtml);
    check('idempotent: still one wrapper', wrapperCount(p), 1);
}

// --- nested inline elements are entered; nested blocks are not -------------
{
    const p = el('p', {},
        t('برند '),
        el('strong', {}, t('Speisio')),
        t(' عالی است')
    );
    Bidi.isolateElement(p);
    check('inline strong: brand isolated inside strong', wrapperTexts(p), ['Speisio']);
    check('inline strong: copy preserved', concatText(p), 'برند Speisio عالی است');
}
{
    const innerP = el('p', {}, t('Inner Menüly داخلی'));
    const div = el('div', {}, t('Outer ناحیه '), innerP);
    Bidi.isolateElement(div);
    check('block boundary: only the div inline run wrapped', wrapperTexts(div), ['Outer']);
    check('block boundary: nested <p> untouched by parent call', innerP.childNodes.length, 1);
    // ...but isolating the nested block directly works.
    Bidi.isolateElement(innerP);
    check('block boundary: nested <p> isolates on its own call',
        wrapperTexts(innerP), ['Inner Menüly']);
}

// --- protected content -----------------------------------------------------
{
    const p = el('p', {},
        t('کد '),
        el('code', {}, t('const x = 5')),
        t(' را ببین')
    );
    const changed = Bidi.isolateElement(p);
    check('protected code: nothing wrapped', wrapperCount(p), 0);
    check('protected code: code text untouched', p.childNodes[1].childNodes[0].textContent, 'const x = 5');
    check('protected code: no rewrite', changed, 0);
}
{
    const pre = el('pre', {}, t('npm install پکیج'));
    Bidi.isolateElement(pre);
    check('protected pre: self skipped', wrapperCount(pre), 0);
}
{
    const editable = el('div', { attrs: { contenteditable: 'true' } }, t('متن POS اینجا'));
    Bidi.isolateElement(editable);
    check('protected contenteditable: skipped', wrapperCount(editable), 0);
}
{
    const pageOwned = el('span', { attrs: { [Bidi.MARK_ATTR]: 'external' } }, t('CRM'));
    const p = el('p', {}, t('متن '), pageOwned);
    check('page-owned marker: not treated as our wrapper', Bidi.isWrapper(pageOwned), false);
    check('page-owned marker: clear leaves element intact', Bidi.clearIsolation(p), 0);
    check('page-owned marker: still present', p.childNodes[1] === pageOwned, true);
}
{
    // A protectedSelector supplied by the caller (e.g. a recipe code guard).
    const wrap = el('div', { cls: 'language-js' }, t('return POS'));
    const host = el('div', {}, wrap);
    Bidi.isolateElement(host, { protectedSelector: '[class*="language-"]' });
    check('protectedSelector: guarded subtree skipped', wrapperCount(host), 0);
}

// --- UI chrome / icon subtrees are never restructured ------------------------
// Claude's action icons (Copy / Read aloud / feedback / Retry) are icon-FONT
// glyphs in aria-hidden spans inside <button>; swapping those text nodes blanks
// the icon and races the host framework's commit. The same class of damage
// applies to any toolbar/menu/tab chrome, so protection is built in here.
{
    const icon = el('span', { attrs: { 'aria-hidden': 'true' } }, t(''));
    const button = el('button', {}, icon, t('Copy'));
    const p = el('p', {}, t('متن POS '), button, t(' ادامه'));
    Bidi.isolateElement(p);
    check('button: prose run still wrapped, button subtree skipped', wrapperTexts(p), ['POS']);
    check('button: icon glyph text node untouched', icon.childNodes[0].textContent, '');
    check('button: label text node untouched', button.childNodes[1].textContent, 'Copy');
}
{
    const toolbar = el('div', { attrs: { role: 'toolbar' } }, t('Retry All'));
    check('role=toolbar: self protected, nothing rewritten', Bidi.isolateElement(toolbar), 0);
    check('role=toolbar: no wrappers', wrapperCount(toolbar), 0);
}
{
    const toolbarChrome = el('span', { attrs: { role: 'toolbar' } }, t('Copy CRM'));
    const p = el('p', {}, t('متن '), toolbarChrome, t(' POS آخر'));
    Bidi.isolateElement(p);
    check('role=toolbar child: chrome skipped, visible sibling run wrapped', wrapperTexts(p), ['POS']);
    check('role=toolbar child: chrome text untouched', toolbarChrome.childNodes[0].textContent, 'Copy CRM');
}
// Generic grouping roles stay UNPROTECTED in core — they legitimately wrap real
// prose on some platforms. Recipes opt in via excludeSelectors (claude-rtl.js
// fences its [role="group"] action bar that way).
check('isProtectedElement: generic role=group NOT core-protected', Bidi.isProtectedElement(el('div', { attrs: { role: 'group' } })), false);
check('isProtectedElement: role=tablist NOT core-protected', Bidi.isProtectedElement(el('div', { attrs: { role: 'tablist' } })), false);
// role is a space-separated token list; any recognized token protects.
check('isProtectedElement: multi-token role list matches', Bidi.isProtectedElement(el('span', { attrs: { role: 'presentation button' } })), true);
{
    // Radix-style modal case: dialogs flip aria-hidden="true" on the whole
    // backgrounded app. aria-hidden must protect the node ITSELF only, never
    // its descendants via ancestry — otherwise every message settling behind a
    // modal would permanently skip isolation (no rescan fires on modal close).
    const p = el('p', {}, t('متن POS زنده'));
    el('div', { attrs: { 'aria-hidden': 'true' } }, el('div', {}, p));
    Bidi.isolateElement(p);
    check('aria-hidden ancestor: isolation still applies (modal-safe)', wrapperTexts(p), ['POS']);
}
{
    // Pin the case-insensitive tag check on its own (no namespaceURI involved).
    const fake = { nodeType: 1, tagName: 'svg', getAttribute: () => null };
    check('isProtectedElement: lowercase tagName alone is protected', Bidi.isProtectedElement(fake), true);
}
{
    // Pathological >64-deep nesting fails CLOSED: when in doubt, skip rather
    // than restructure text that might live inside unprotected-looking chrome.
    const deepRoot = el('div', {});
    let cur = deepRoot;
    for (let i = 0; i < 70; i += 1) {
        const next = el('span', {});
        cur.append(next);
        cur = next;
    }
    const p = el('p', {}, t('متن POS'));
    cur.append(p);
    check('hop cap: pathological depth fails closed', Bidi.isolateElement(p), 0);
}
{
    const hidden = el('span', { attrs: { 'aria-hidden': 'true' } }, t('CRM'));
    const p = el('p', {}, t('متن '), hidden, t(' POS آخر'));
    Bidi.isolateElement(p);
    check('aria-hidden: hidden span skipped, visible run wrapped', wrapperTexts(p), ['POS']);
    check('aria-hidden: hidden text untouched', hidden.childNodes[0].textContent, 'CRM');
}
{
    // Real browsers report SVG-namespace tagNames in LOWERCASE ('svg', not
    // 'SVG') — protection must not depend on HTML's uppercase convention.
    const svg = el('svg', {}, t('A'));
    svg.tagName = 'svg';
    svg.namespaceURI = 'http://www.w3.org/2000/svg';
    const p = el('p', {}, t('متن POS '), svg);
    Bidi.isolateElement(p);
    check('lowercase svg: subtree skipped, prose run wrapped', wrapperTexts(p), ['POS']);
    check('lowercase svg: glyph text untouched', svg.childNodes[0].textContent, 'A');
    check('lowercase svg: isProtectedElement matches', Bidi.isProtectedElement(svg), true);
}
{
    // Foreign-namespace descendants (svg <text>/<tspan>, MathML) are protected
    // even when their tagName is in no Set — an HTML <bdi> inside them is
    // non-rendering foreign content and the original glyph would vanish.
    const tspan = el('tspan', {}, t('Label'));
    tspan.tagName = 'tspan';
    tspan.namespaceURI = 'http://www.w3.org/2000/svg';
    const p = el('p', {}, t('متن '), tspan, t(' POS آخر'));
    Bidi.isolateElement(p);
    check('foreign namespace: skipped, sibling run wrapped', wrapperTexts(p), ['POS']);
    check('foreign namespace: isProtectedElement matches', Bidi.isProtectedElement(tspan), true);
}
{
    // The root itself can live INSIDE protected chrome (engine walks can hand
    // us a block nested in a custom button) — ancestry is checked too.
    const inner = el('p', {}, t('متن POS داخلی'));
    el('button', {}, inner);
    check('protected ancestor: block inside button never isolated', Bidi.isolateElement(inner), 0);
    check('protected ancestor: no wrappers', wrapperCount(inner), 0);
}
check('isProtectedElement: BUTTON tag', Bidi.isProtectedElement(el('button', {})), true);
check('isProtectedElement: aria-hidden span', Bidi.isProtectedElement(el('span', { attrs: { 'aria-hidden': 'true' } })), true);
check('isProtectedElement: role=img span', Bidi.isProtectedElement(el('span', { attrs: { role: 'img' } })), true);
check('isProtectedElement: plain prose span is NOT protected', Bidi.isProtectedElement(el('span', {})), false);

// --- pure-LTR text wraps as a single copy-safe unit ------------------------
{
    const p = el('p', {}, t('Visit https://example.com now'));
    Bidi.isolateElement(p);
    check('url-only: single wrapper', wrapperCount(p), 1);
    check('url-only: wrapper text', wrapperTexts(p), ['Visit https://example.com now']);
    check('url-only: copy preserved', concatText(p), 'Visit https://example.com now');
}

// --- clearIsolation reverses everything ------------------------------------
{
    const p = el('p', {}, t('اتصال به POS / کاسه'));
    Bidi.isolateElement(p);
    const removed = Bidi.clearIsolation(p);
    check('clear: removed one wrapper', removed, 1);
    check('clear: no wrappers remain', wrapperCount(p), 0);
    check('clear: text restored', concatText(p), 'اتصال به POS / کاسه');
    check('clear: normalized to single text node', p.childNodes.length, 1);
}
{
    const li = el('li', {}, t('Kartio از Karte'));
    Bidi.isolateElement(li);
    Bidi.clearIsolation(li);
    check('clear multi: text restored', concatText(li), 'Kartio از Karte');
    check('clear multi: no wrappers', wrapperCount(li), 0);
    check('clear: idempotent on clean tree', Bidi.clearIsolation(li), 0);
}

// --- never throws on degenerate input --------------------------------------
check('robust: null element', Bidi.isolateElement(null), 0);
check('robust: text-only node arg', Bidi.isolateElement(t('hello')), 0);
check('robust: empty element', Bidi.isolateElement(el('p', {})), 0);
check('robust: clearIsolation(null)', Bidi.clearIsolation(null), 0);

// --- classifyChar sanity ---------------------------------------------------
check('classify: Latin letter', Bidi.classifyChar('A'), 'L');
check('classify: Persian letter', Bidi.classifyChar('گ'), 'R');
check('classify: Arabic letter', Bidi.classifyChar('م'), 'R');
check('classify: digit is neutral', Bidi.classifyChar('5'), 'N');
check('classify: slash is neutral', Bidi.classifyChar('/'), 'N');
check('classify: Latin diacritic groups LTR', Bidi.classifyChar('ü'), 'L');

// --- combining marks: vocalized RTL must NOT spawn spurious LTR runs ---------
const FATHA = 'َ';
check('classify: Arabic harakat is neutral', Bidi.classifyChar(FATHA), 'N');
check('classify: Persian digit ۱ is RTL', Bidi.classifyChar('۱'), 'R');
check('vocalized Persian/Arabic: no LTR runs', runStrings('بِسْمِ اللَّهِ'), []);
check('vocalized RTL + Latin: only the Latin run', runStrings('مَتَن Word'), ['Word']);
{
    const p = el('p', {}, t('بِسْمِ اللَّهِ'));
    Bidi.isolateElement(p);
    check('vocalized RTL: no wrappers', wrapperCount(p), 0);
    check('vocalized RTL: text untouched', concatText(p), 'بِسْمِ اللَّهِ');
}
// Latin diacritics still group into their run, precomposed and decomposed.
check('Latin precomposed diacritic in run', runStrings('یک Menü خوب'), ['Menü']);
check('Latin decomposed diacritic absorbed', runStrings('یک Menu\u0308 خوب'), ['Menu\u0308']);

// --- astral / surrogate-pair safety -----------------------------------------
{
    const text = '𝐇𝐞𝐥𝐥𝐨 سلام';
    check('astral: run sliced well-formed (no lone surrogate)', runStrings(text), ['𝐇𝐞𝐥𝐥𝐨']);
    const p = el('p', {}, t(text));
    Bidi.isolateElement(p);
    check('astral: copy preserved through wrap', concatText(p), text);
    Bidi.clearIsolation(p);
    check('astral: copy preserved through clear', concatText(p), text);
}

// --- list marker stays in the RTL container (DOM-level) ---------------------
{
    const li = el('li', {}, t('۱. Menüly ساده'));
    Bidi.isolateElement(li);
    check('list marker: leading text node is the marker', li.childNodes[0].textContent, '۱. ');
    check('list marker: only the brand wrapped', wrapperTexts(li), ['Menüly']);
}

// --- trailing punctuation: continuation char vs TRAIL_STOP ------------------
check('trailing colon joins the run', runStrings('یعنی CRM:'), ['CRM:']);
check('Arabic comma stays in container', runStrings('متن CRM، ادامه'), ['CRM']);

// --- ZWNJ interior is absorbed; round-trips byte-exact ----------------------
{
    const text = 'a‌b متن';
    check('interior ZWNJ kept in run', runStrings(text), ['a‌b']);
    const p = el('p', {}, t(text));
    Bidi.isolateElement(p);
    Bidi.clearIsolation(p);
    check('ZWNJ preserved byte-exact through round-trip', concatText(p), text);
}
{
    const text = 'SaaS' + ZWNJ + 'های آلمانی';
    const p = el('p', {}, t(text));
    Bidi.isolateElement(p);
    check('SaaS suffix DOM: only Latin stem wrapped', wrapperTexts(p), ['SaaS']);
    check('SaaS suffix DOM: copy preserved', concatText(p), text);
    Bidi.clearIsolation(p);
    check('SaaS suffix DOM: clear preserves copy', concatText(p), text);
}

// --- multiple adjacent text nodes + interleaved inline element --------------
{
    const p = el('p', {},
        t('اول POS '),
        el('em', {}, t('Speisio')),
        t(' آخر Karte')
    );
    Bidi.isolateElement(p);
    check('multi-node: same inline LTR phrase spans nodes', wrapperTexts(p), ['POS ', 'Speisio', 'Karte']);
    check('multi-node: copy preserved', concatText(p), 'اول POS Speisio آخر Karte');
    Bidi.clearIsolation(p);
    check('multi-node: clear restores copy', concatText(p), 'اول POS Speisio آخر Karte');
    check('multi-node: clear leaves no wrappers', wrapperCount(p), 0);
}

// --- graceful degradation: a raced swap skips one node, others survive ------
{
    const p = el('p', {}, t('POS اول'), t('Karte دوم'));
    const realReplace = p.replaceChild.bind(p);
    let calls = 0;
    p.replaceChild = (newNode, oldNode) => {
        calls += 1;
        if (calls === 1) {
            const err = new Error('node detached mid-render');
            err.name = 'NotFoundError';
            throw err;
        }
        return realReplace(newNode, oldNode);
    };
    let threw = false;
    let changed = 0;
    try {
        changed = Bidi.isolateElement(p);
    } catch (_) {
        threw = true;
    }
    check('degrade: isolateElement never throws on a raced node', threw, false);
    check('degrade: surviving node still wrapped', changed, 1);
    check('degrade: copy preserved despite skipped node', concatText(p), 'POS اولKarte دوم');
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
