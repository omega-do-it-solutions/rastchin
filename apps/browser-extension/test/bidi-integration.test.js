'use strict';
// Part 2 integration suite: proves the RTLEngine chokepoint wires the BiDi
// isolation layer correctly. Loads BOTH src/core/bidi-isolate.js and
// src/core/rtl-engine.js into one sandbox (via makeIsolatingEngine) and checks
// that applyRTL isolates Latin runs, the streamingSelector gate defers the live
// turn, opting out (no inlineIsolate) changes nothing, and restore/disable strip
// the wrappers. Run: `node test/bidi-integration.test.js`.

const {
    makeIsolatingEngine,
    RastChinBidi,
    isolatingDocument,
    isolatingMutationObservers,
    el,
    t
} = require('./engine-harness');

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

const MARK = RastChinBidi.MARK_ATTR;
function concatText(node) {
    if (node.nodeType === 3) return node.textContent || '';
    let out = '';
    for (const child of node.childNodes || []) out += concatText(child);
    return out;
}
function wrappers(root) {
    const out = [];
    const visit = node => {
        if (node.nodeType === 1 && node.getAttribute && node.getAttribute(MARK) !== null) out.push(node);
        for (const child of node.childNodes || []) if (child.nodeType === 1) visit(child);
    };
    visit(root);
    return out;
}

// --- applyRTL isolates inline Latin runs when inlineIsolate is on -----------
{
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const p = el('p', {}, t('اتصال به POS / کاسه'));
    engine.applyRTL(p);
    check('applyRTL+isolate: dir set', p.getAttribute('dir'), 'rtl');
    check('applyRTL+isolate: one wrapper', wrappers(p).length, 1);
    check('applyRTL+isolate: wrapper text', concatText(wrappers(p)[0]), 'POS');
    check('applyRTL+isolate: copy preserved', concatText(p), 'اتصال به POS / کاسه');
}

// --- opt-out: no inlineIsolate => dir only, no wrappers --------------------
{
    const engine = makeIsolatingEngine({});
    const p = el('p', {}, t('اتصال به POS / کاسه'));
    engine.applyRTL(p);
    check('no-opt-in: dir still set', p.getAttribute('dir'), 'rtl');
    check('no-opt-in: no wrappers', wrappers(p).length, 0);
}

// --- streamingSelector gate: live turn deferred, settled turn isolated ------
{
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        streamingSelector: '.result-streaming'
    });
    const live = el('p', {}, t('متن POS زنده'));
    const turn = el('div', { cls: 'result-streaming' }, live);
    engine.applyRTL(live);
    check('streaming gate: live turn not wrapped', wrappers(live).length, 0);

    const settled = el('p', {}, t('متن POS ثابت'));
    el('div', { cls: 'message' }, settled); // not streaming
    engine.applyRTL(settled);
    check('streaming gate: settled turn wrapped', wrappers(settled).length, 1);
}

// --- streamingSelector gate: descendant marker defers the whole inline block --
{
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        streamingSelector: '.result-streaming'
    });
    const live = el('span', { cls: 'result-streaming' }, t('زنده POS'));
    const p = el('p', {}, t('قبل CRM '), live);
    engine.applyRTL(p);
    check('streaming descendant gate: no wrapper while descendant streams', wrappers(p).length, 0);

    live.classList.remove('result-streaming');
    engine.applyRTL(p);
    check('streaming descendant gate: wraps after marker clears', wrappers(p).length, 2);
}

// --- the real scenario: the SAME element defers, then isolates once settled --
{
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        streamingSelector: '.result-streaming'
    });
    const leaf = el('p', {}, t('متن POS زنده'));
    const turn = el('div', { cls: 'result-streaming' }, leaf);
    engine.applyRTL(leaf);
    check('settle: deferred while streaming', wrappers(leaf).length, 0);
    // streaming ends -> marker removed -> element re-walked on the next mutation
    turn.classList.remove('result-streaming');
    engine.applyRTL(leaf);
    check('settle: isolated after streaming ends', wrappers(leaf).length, 1);
    check('settle: copy preserved', concatText(leaf), 'متن POS زنده');
}

// --- observer path: replacing a streaming subtree rescans the mutation root ----
{
    isolatingMutationObservers.length = 0;
    const root = el('div', { cls: 'message-root' });
    isolatingDocument.body = root;
    isolatingDocument.documentElement = null;
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        streamingSelector: '.result-streaming',
        messageSelectors: ['.message-root']
    });
    const scheduled = [];
    engine.scheduleScan = node => scheduled.push(node);
    engine.init();
    scheduled.length = 0; // ignore the initial body scan from init()
    const observer = isolatingMutationObservers[isolatingMutationObservers.length - 1];
    const removedLiveTurn = el('div', { cls: 'result-streaming' }, el('p', {}, t('متن POS زنده')));
    observer.trigger({
        type: 'childList',
        target: root,
        addedNodes: [],
        removedNodes: [removedLiveTurn]
    });
    check('removedNodes observer: schedules the mutation root for settled rescan',
        scheduled.includes(root), true);
    isolatingDocument.body = null;
}

// --- table-cell policy pin across recipe bidi modes (browser-measured) ---------
// All inlineIsolate recipes funnel table cells through this same chokepoint:
// claude (custom walk, plaintext), chatgpt (isolate), perplexity (plaintext),
// qwen/arena (isolate). The visual order of the three reported mixed phrases
// was measured correct with THIS wrapping under BOTH unicode-bidi modes, so
// the pin below protects every recipe at once.
{
    const cases = [
        { cellText: 'باشگاه مشتریان / CRM', wrapped: ['CRM'] },
        { cellText: 'اتصال به POS / کاسه', wrapped: ['POS'] },
        { cellText: 'DSGVO / GDPR کامپلاینس', wrapped: ['DSGVO / GDPR'] }
    ];
    for (const mode of ['plaintext', 'isolate']) {
        const engine = makeIsolatingEngine({ inlineIsolate: true, rtlStyle: { unicodeBidi: mode } });
        for (const { cellText, wrapped } of cases) {
            const cell = el('td', {}, t(cellText));
            engine.applyRTL(cell);
            check(`cell pin [${mode}]: ${wrapped[0]} wrapped`,
                wrappers(cell).map(w => concatText(w)), wrapped);
            check(`cell pin [${mode}]: copy preserved`, concatText(cell), cellText);
            check(`cell pin [${mode}]: bidi style applied`, cell.style.unicodeBidi, mode);
        }
    }
}

// --- nested cell wrappers: td > div > text isolates at the DIV level ---------
// claude.ai can wrap cell content in a block DIV. The td-level walk stops at
// the block boundary BY DESIGN (bidi-isolate BLOCK_BOUNDARY) — descending
// would concatenate text across blocks and leak the trailing-tail extension —
// so the recipe must hand the wrapper itself to engine.isolateInline. Pin both
// halves of that contract against the REAL bidi walk:
{
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const inner = el('div', {}, t('باشگاه مشتریان / CRM'));
    const cell = el('td', {}, inner);

    engine.isolateInline(cell);
    check('nested cell: td-level walk stops at the DIV (no wrappers)', wrappers(cell).length, 0);

    engine.isolateInline(inner);
    const ws = wrappers(cell);
    check('nested cell: DIV-level isolation creates one wrapper', ws.length, 1);
    check('nested cell: wrapper is <bdi dir=ltr> with the mark attr',
        [ws[0].tagName, ws[0].getAttribute('dir'), ws[0].getAttribute(MARK)], ['BDI', 'ltr', 'ltr']);
    check('nested cell: wrapped run', concatText(ws[0]), 'CRM');
    check('nested cell: wrapper sits INSIDE the inner div', ws[0].parentNode === inner, true);
    check('nested cell: copy preserved', concatText(cell), 'باشگاه مشتریان / CRM');
}

{
    // Same contract for the POS phrase through a nested wrapper. (No mode
    // variants here: isolateInline never reads rtlStyle — unicode-bidi modes
    // are exercised by the applyRTL cell-pin block above.)
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const inner = el('div', {}, t('اتصال به POS / کاسه'));
    const cell = el('td', {}, inner);
    engine.isolateInline(inner);
    check('nested cell: POS wrapped inside the div',
        wrappers(cell).map(w => concatText(w)), ['POS']);
    check('nested cell: POS copy preserved', concatText(cell), 'اتصال به POS / کاسه');
}

// --- recently-mutated nodes wait for the settle delay before restructuring ----
{
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        inlineSettleDelayMs: 1000
    });
    engine.scheduleSettledScan = () => {};
    const p = el('p', {}, t('متن POS تازه'));
    engine.markMutated(p);
    engine.applyRTL(p);
    check('settle delay: no immediate wrapper after mutation', wrappers(p).length, 0);
}

// --- clearInline waits for the settle window too ----------------------------
// Unwrapping is just as structural as wrapping: a clear racing a framework
// re-render is the same crash class, so clearInline must defer on
// recently-mutated subtrees exactly like isolateInline does.
{
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        inlineSettleDelayMs: 1000
    });
    engine.scheduleSettledScan = () => {};
    const p = el('p', {}, t('متن POS قدیمی'));
    engine.applyRTL(p);
    check('clear settle gate: wrapper exists before the clear', wrappers(p).length, 1);
    engine.markMutated(p);
    engine.clearInline(p);
    check('clear settle gate: recently-mutated subtree keeps wrappers (deferred)', wrappers(p).length, 1);
}

// --- excluded (code-guard) subtree is never isolated -----------------------
{
    const engine = makeIsolatingEngine({
        inlineIsolate: true,
        excludeSelectors: ['code', '[class*="code"]']
    });
    const codeEl = el('code', {}, t('const POS = 1'));
    engine.applyRTL(codeEl);
    check('excluded code: no wrappers', wrappers(codeEl).length, 0);
}

// --- UI chrome (buttons / icon glyphs) inside a message line stays intact ----
{
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const icon = el('span', { attrs: { 'aria-hidden': 'true' } }, t(''));
    const button = el('button', {}, icon);
    const p = el('p', {}, t('متن POS '), button);
    engine.applyRTL(p);
    check('ui chrome: prose run still wrapped', wrappers(p).length, 1);
    check('ui chrome: icon glyph text untouched', icon.childNodes[0].textContent, '');
    check('ui chrome: no wrappers inside the button', wrappers(button).length, 0);
}

// --- recipe excludeSelectors flow into engine + BiDi protection --------------
// Mirrors claude-rtl.js UI_CHROME_GUARD_SELECTORS (incl. the attr-substring +
// case-insensitive parts) to prove the whole list survives closest()/matches()
// and fences chrome that core deliberately does NOT protect (role=group).
{
    const CLAUDE_UI_GUARD = [
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menubar"]',
        '[role="tablist"]',
        '[role="group"]',
        '[role="img"]',
        'svg',
        '[data-cds="Icon"]',
        '[style*="anthropicons" i]',
        '[class*="katex"]'
    ];
    const PUA_GLYPH = '\uE9CA';
    const engine = makeIsolatingEngine({ inlineIsolate: true, excludeSelectors: CLAUDE_UI_GUARD });
    const icon = el('span', { attrs: { 'data-cds': 'Icon' } }, t(PUA_GLYPH));
    const group = el('span', { attrs: { role: 'group' } }, icon, t('Copy'));
    const p = el('p', {}, t('متن POS '), group);
    engine.applyRTL(p);
    check('exclude flow: dir applied without throwing', p.getAttribute('dir'), 'rtl');
    check('exclude flow: prose run wrapped', wrappers(p).length, 1);
    check('exclude flow: role=group chrome skipped via recipe guards', wrappers(group).length, 0);
    check('exclude flow: cds icon glyph untouched', icon.childNodes[0].textContent, PUA_GLYPH);

    const guardedBlock = el('p', { attrs: { 'data-cds': 'Icon' } }, t('متن POS'));
    engine.applyRTL(guardedBlock);
    check('exclude flow: isolateInline skips a guarded block entirely', wrappers(guardedBlock).length, 0);
}

// --- restoreSubtree strips the wrappers (element flips to LTR) --------------
{
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const p = el('p', {}, t('Kartio از Karte'));
    engine.applyRTL(p);
    check('restore: wrapped first', wrappers(p).length, 2);
    engine.restoreSubtree(p);
    check('restore: wrappers removed', wrappers(p).length, 0);
    check('restore: text intact', concatText(p), 'Kartio از Karte');
}

// --- clearInline (custom-walk recipes) strips one element's wrappers --------
{
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const p = el('p', {}, t('برند Speisio عالی'));
    engine.isolateInline(p);
    check('clearInline: wrapped', wrappers(p).length, 1);
    engine.clearInline(p);
    check('clearInline: cleared', wrappers(p).length, 0);
    check('clearInline: text intact', concatText(p), 'برند Speisio عالی');
}

// --- disable (restoreStyles) clears isolation across document.body ----------
{
    const engine = makeIsolatingEngine({ inlineIsolate: true });
    const p = el('p', {}, t('سرویس mently.com خوب'));
    const body = el('body', {}, p);
    engine.applyRTL(p);
    check('disable: wrapped before', wrappers(p).length, 1);
    // restoreStyles() clears from the sandbox document.body; point it at our tree.
    isolatingDocument.body = body;
    engine.restoreStyles();
    isolatingDocument.body = null;
    check('disable: wrappers cleared from body', wrappers(p).length, 0);
    check('disable: text intact', concatText(p), 'سرویس mently.com خوب');
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
