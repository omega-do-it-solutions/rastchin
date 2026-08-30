'use strict';
// RED/GREEN suite for YouTube UI-prose RTL (v1.1.24, extended in v1.1.25).
//
// v1.1.25 additions (blocks 13-19) lock the REAL selector-discovery path that
// v1.1.24 left untested: instead of calling engine.applyToMessage(leaf) directly,
// they build near-real YouTube fixture subtrees and run engine.collectCandidates()
// so the PRODUCTION PROSE_SELECTORS must actually MATCH the sidebar lockup, home
// card, expanded/collapsed description and search-suggestion leaves — plus a
// transition (RTL -> English restore), layout/chrome guards, a descendant-matcher
// greedy-walk guard, and a globalCss contract (no body/html/ytd-app/#masthead rule;
// the scoped More-button overlap rule present). These rely on the additive
// compound/descendant matcher added to test/engine-harness.js (still single-part
// backward-compatible). Until Part 2 lands the new selectors + the More-button CSS,
// blocks 13-19 are the intended RED.
//
// The caption suite (test/youtube-rtl.test.js) loads ONLY youtube-rtl.js with a
// caption-only stub engine, so it cannot exercise the engine's default prose
// walk. This suite instead loads the FULL stack — bidi-isolate.js + rtl-engine.js
// + recipe-runner.js + youtube-rtl.js — into ONE vm sandbox (Element/HTMLElement =
// the engine-harness El, so cross-file `instanceof` and closures resolve), then
// drives the REAL recipe through the REAL engine. The recipe self-registration is
// neutralised by a non-matching window.location.hostname, but the
// window.__YOUTUBE_RTL_TEST__ payload still fires, so we recover the recipe and
// build a fresh engine from recipe-runner.buildEngineConfig.
//
// Run: `node test/youtube-prose-rtl.test.js`

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { El, Txt, el, t, makeDocument } = require('./engine-harness');

// Design constants these tests LOCK (the implementation must match exactly).
const PROSE_CLASS = 'rastchin-youtube-prose-rtl';
const PROSE_FONT_CLASS = 'rastchin-youtube-prose-font';

function loadSrc(rel) {
    return fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');
}

// --- single full-stack sandbox -------------------------------------------------
let exported = null;
const proseDoc = makeDocument();
proseDoc.body = el('body', {});
proseDoc.head = el('head', {});
proseDoc.documentElement = {
    style: {
        _m: {},
        setProperty(k, v) { this._m[k] = v; },
        removeProperty(k) { delete this._m[k]; },
        getPropertyValue(k) { return this._m[k] || ''; },
        getPropertyPriority() { return ''; }
    }
};
const docListeners = [];
proseDoc.addEventListener = (type, fn, capture) => docListeners.push({ type, fn, capture });
proseDoc.removeEventListener = (type, fn) => {
    const i = docListeners.findIndex(l => l.type === type && l.fn === fn);
    if (i >= 0) docListeners.splice(i, 1);
};
proseDoc.querySelectorAll = sel => (proseDoc.body ? proseDoc.body.querySelectorAll(sel) : []);

const win = {
    location: { hostname: 'example.invalid' },
    __YOUTUBE_RTL_TEST__(api) { exported = api; },
    addEventListener() {},
    removeEventListener() {}
};
win.window = win;

const ctx = {
    chrome: {
        runtime: { getURL: f => `chrome-extension://test/${f}` },
        storage: { sync: { get() {} }, onChanged: { addListener() {} } }
    },
    window: win,
    document: proseDoc,
    requestAnimationFrame: () => 0,
    setTimeout,
    clearTimeout,
    MutationObserver: class { observe() {} disconnect() {} },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    Element: El,
    HTMLElement: El,
    getComputedStyle: node => (node && node.__computedStyle) || {},
    console
};
vm.createContext(ctx);
[
    'core/bidi-isolate.js',
    'core/rtl-engine.js',
    'core/recipe-runner.js',
    'platforms/youtube-rtl.js'
].forEach(rel => vm.runInContext(loadSrc(rel), ctx));

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !exported.recipe || !ctx.RastChinRecipe || !ctx.RTLEngine || !ctx.RastChinBidi) {
    console.log('FATAL  full-stack sandbox did not expose recipe/engine/bidi');
    process.exit(1);
}

const recipe = exported.recipe;
const RastChinBidi = ctx.RastChinBidi;
const MARK = RastChinBidi.MARK_ATTR;

const engine = new ctx.RTLEngine(ctx.RastChinRecipe.buildEngineConfig(recipe));
engine.setEnabled(true);

// --- helpers -------------------------------------------------------------------
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
function has(arr, value) {
    return Array.isArray(arr) && arr.join('').includes(value);
}

// ============================================================================
// 1) Recipe config is wired for prose (locks the engine-reuse contract).
// ============================================================================
check('config: rtlClass is the prose class', recipe.rtlClass, PROSE_CLASS);
check('config: inlineIsolate enabled', recipe.inlineIsolate, true);
check('config: messageSelectors include caption windows (unchanged)', has(recipe.messageSelectors, '.caption-window'), true);
check('config: messageSelectors include #video-title', has(recipe.messageSelectors, '#video-title'), true);
check('config: messageSelectors include a watch-description selector', has(recipe.messageSelectors, 'inline-expander'), true);
check('config: excludeSelectors fence buttons', has(recipe.excludeSelectors, 'button'), true);
check('config: excludeSelectors fence the search input', has(recipe.excludeSelectors, 'input#search'), true);
check('config: custom needsRTL provided', typeof recipe.needsRTL, 'function');

// ============================================================================
// 2) Dispatcher contract: captions handled (true), prose deferred (undefined).
// ============================================================================
{
    const cap = el('div', { cls: 'caption-window' });
    const handled = recipe.applyToMessage(cap, engine);
    check('dispatcher: caption window is handled (returns true)', handled, true);
    check('dispatcher: caption window never gets the prose class', cap.classList.contains(PROSE_CLASS), false);
}
{
    const prose = el('yt-formatted-string', {}, t('یک متن فارسی'));
    const handled = recipe.applyToMessage(prose, engine);
    check('dispatcher: prose defers to engine (returns undefined)', handled === undefined, true);
}

// ============================================================================
// 3) Home / search / sidebar card title (Persian) flips via the engine path.
// ============================================================================
{
    const title = el('yt-formatted-string', {}, t('چگونه فارسی یاد بگیریم'));
    engine.applyToMessage(title);
    check('home title: dir=rtl', title.getAttribute('dir'), 'rtl');
    check('home title: direction:rtl', title.style.direction, 'rtl');
    check('home title: text-align:right (engine prose, not caption center)', title.style.textAlign, 'right');
    check('home title: carries prose class', title.classList.contains(PROSE_CLASS), true);
}

// ============================================================================
// 4) Search-result title flips; an English channel sibling stays untouched.
// ============================================================================
{
    const title = el('yt-formatted-string', {}, t('آموزش کامل فتوشاپ'));
    const channel = el('yt-formatted-string', {}, t('Adobe Channel'));
    engine.applyToMessage(title);
    engine.applyToMessage(channel);
    check('search title: dir=rtl', title.getAttribute('dir'), 'rtl');
    check('search title: prose class', title.classList.contains(PROSE_CLASS), true);
    check('search channel (English): no dir', channel.getAttribute('dir'), null);
    check('search channel (English): no prose class', channel.classList.contains(PROSE_CLASS), false);
}

// ============================================================================
// 5) Search-result snippet / description (multi-word Persian) flips RTL.
// ============================================================================
{
    const snippet = el('div', {}, t('در این ویدیو روش استفاده از لایه‌ها را یاد می‌گیرید'));
    engine.applyToMessage(snippet);
    check('snippet: dir=rtl', snippet.getAttribute('dir'), 'rtl');
    check('snippet: prose class', snippet.classList.contains(PROSE_CLASS), true);
}

// ============================================================================
// 6) Watch-page title flips; its (non-prose) wrapper container stays LTR.
// ============================================================================
{
    const title = el('yt-formatted-string', {}, t('بهترین آموزش برنامه‌نویسی'));
    const wrapper = el('div', { cls: 'ytd-watch-metadata' }, title);
    engine.applyToMessage(title);
    check('watch title: dir=rtl', title.getAttribute('dir'), 'rtl');
    check('watch title: prose class', title.classList.contains(PROSE_CLASS), true);
    check('watch wrapper: layout container stays LTR (no dir)', wrapper.getAttribute('dir'), null);
    check('watch wrapper: no prose class on container', wrapper.classList.contains(PROSE_CLASS), false);
}

// ============================================================================
// 7) Watch-page description (mixed Persian/Latin) flips AND BiDi-isolates the
//    Latin runs so copy stays intact.
// ============================================================================
{
    const desc = el('div', {}, t('این ویدیو درباره React و Next.js است'));
    engine.applyToMessage(desc);
    check('description: dir=rtl', desc.getAttribute('dir'), 'rtl');
    const w = wrappers(desc).map(concatText);
    check('description: React isolated', w.includes('React'), true);
    check('description: Next.js isolated', w.includes('Next.js'), true);
    check('description: copy preserved', concatText(desc), 'این ویدیو درباره React و Next.js است');
}

// ============================================================================
// 8) Sidebar / playlist title flips; the sidebar list wrapper stays LTR.
// ============================================================================
{
    const title = el('yt-formatted-string', {}, t('قسمت دوم سریال'));
    const list = el('div', { cls: 'ytd-watch-next-secondary-results-renderer' }, title);
    engine.applyToMessage(title);
    check('sidebar title: dir=rtl', title.getAttribute('dir'), 'rtl');
    check('sidebar title: prose class', title.classList.contains(PROSE_CLASS), true);
    check('sidebar list wrapper: stays LTR', list.getAttribute('dir'), null);
}

// ============================================================================
// 9) Mixed Persian/Latin title — the headline copy-safety guarantee.
//    'آموزش Photoshop 2025' must flip (first-strong RTL, like dir="auto"),
//    isolate the Latin run, and copy back byte-identical.
// ============================================================================
{
    const title = el('yt-formatted-string', {}, t('آموزش Photoshop 2025'));
    engine.applyToMessage(title);
    check('mixed title: dir=rtl', title.getAttribute('dir'), 'rtl');
    check('mixed title: prose class', title.classList.contains(PROSE_CLASS), true);
    const w = wrappers(title).map(concatText);
    check('mixed title: has at least one isolation wrapper', wrappers(title).length >= 1, true);
    check('mixed title: Latin run isolated', w.includes('Photoshop'), true);
    check('mixed title: copy preserved', concatText(title), 'آموزش Photoshop 2025');
}

// ============================================================================
// 10) English-only titles are left completely untouched (no over-flip).
// ============================================================================
['MrBeast', 'Top 10 Games 2025'].forEach(label => {
    const e = el('yt-formatted-string', {}, t(label));
    engine.applyToMessage(e);
    check(`english untouched (${label}): no dir`, e.getAttribute('dir'), null);
    check(`english untouched (${label}): no prose class`, e.classList.contains(PROSE_CLASS), false);
    check(`english untouched (${label}): no wrappers`, wrappers(e).length, 0);
});

// ============================================================================
// 11) Chrome safety: a button stands alone is excluded; a button INSIDE Persian
//     prose keeps its glyph text un-flipped and un-wrapped while the prose flips.
// ============================================================================
{
    const btn = el('button', { role: 'button' }, t('دکمه فارسی'));
    engine.applyToMessage(btn);
    check('chrome button: standalone not flipped', btn.getAttribute('dir'), null);
    check('chrome button: no prose class', btn.classList.contains(PROSE_CLASS), false);
}
{
    const inner = el('button', { role: 'button' }, t('اشتراک'));
    const p = el('p', {}, t('برای ادامه '), inner, t(' را بزنید'));
    engine.applyToMessage(p);
    check('chrome-in-prose: surrounding prose flips', p.getAttribute('dir'), 'rtl');
    check('chrome-in-prose: button not flipped', inner.getAttribute('dir'), null);
    check('chrome-in-prose: button glyph not wrapped', wrappers(inner).length, 0);
}

// ============================================================================
// 12) Search <input> direction toggles on value via the dedicated handler
//     (the engine never sees input.value, so this is a separate code path).
// ============================================================================
{
    const input = el('input', { attrs: { 'aria-label': 'Search' } });
    input.value = 'جستجوی فارسی';
    if (typeof exported.applySearchInputDirection !== 'function') {
        check('search input: applySearchInputDirection exposed', false, true);
    } else {
        const host = el('yt-searchbox', {}, input);
        exported.applySearchInputDirection(input, engine);
        check('search input (Persian): dir=rtl', input.getAttribute('dir'), 'rtl');
        check('search input (Persian): text-align right', input.style.textAlign, 'right');
        check('search input (Persian): Vazirmatn font', /Vazirmatn/.test(input.style.fontFamily || ''), true);
        check('search input (Persian): host gets RTL suggestion scope class',
            host.classList.contains('rastchin-youtube-search-rtl'), true);
        input.value = 'english query';
        exported.applySearchInputDirection(input, engine);
        check('search input (English): dir cleared', input.getAttribute('dir'), null);
        check('search input (English): font cleared', input.style.fontFamily || '', '');
        check('search input (English): host RTL suggestion scope class cleared',
            host.classList.contains('rastchin-youtube-search-rtl'), false);

        const preStyled = el('input', {
            attrs: { 'aria-label': 'Search', dir: 'ltr' },
            style: { direction: 'ltr', textAlign: 'left', fontFamily: 'Roboto' }
        });
        preStyled.value = 'آموزش فارسی';
        const preStyledHost = el('yt-searchbox', {}, preStyled);
        exported.applySearchInputDirection(preStyled, engine);
        check('search input restore setup: Persian overrides existing dir', preStyled.getAttribute('dir'), 'rtl');
        check('search input restore setup: Persian overrides existing font', /Vazirmatn/.test(preStyled.style.fontFamily || ''), true);
        check('search input restore setup: host scope class set',
            preStyledHost.classList.contains('rastchin-youtube-search-rtl'), true);
        preStyled.value = 'english query';
        exported.applySearchInputDirection(preStyled, engine);
        check('search input restore: original dir restored', preStyled.getAttribute('dir'), 'ltr');
        check('search input restore: original direction restored', preStyled.style.direction, 'ltr');
        check('search input restore: original text-align restored', preStyled.style.textAlign, 'left');
        check('search input restore: original font restored', preStyled.style.fontFamily, 'Roboto');
        check('search input restore: host scope class cleared',
            preStyledHost.classList.contains('rastchin-youtube-search-rtl'), false);
    }
}

// ============================================================================
// v1.1.25 — REAL selector discovery + guards + CSS contract.
// discover(root) exercises the engine's actual candidate walk (the same path
// processQueue uses), so the PRODUCTION PROSE_SELECTORS must MATCH the fixture
// leaves; flipAll mirrors processQueue's `candidates.forEach(applyToMessage)`.
// ============================================================================
function discover(root) { const bucket = new Set(); engine.collectCandidates(root, bucket); return bucket; }
function flipAll(bucket) { bucket.forEach(node => engine.applyToMessage(node)); }

// ============================================================================
// 13) REAL discovery — modern watch-SIDEBAR / HOME lockup title (bugs #1 + #4).
//     Selector under test: 'yt-lockup-metadata-view-model h3 .yt-lockup-metadata-
//     view-model-wiz__title' (the view-model layout has NO #video-title).
// ============================================================================
{
    const titleLink = el('a', { cls: 'yt-lockup-metadata-view-model-wiz__title', attrs: { href: '/watch?v=qa' } },
        el('span', { cls: 'yt-core-attributed-string' }, t('قسمت دوازدهم سریال')));
    const h3 = el('h3', { cls: 'yt-lockup-metadata-view-model-wiz__heading-reset' }, titleLink);
    const meta = el('yt-lockup-metadata-view-model', { cls: 'yt-lockup-metadata-view-model-wiz' }, h3,
        el('div', { cls: 'yt-content-metadata-view-model-wiz__metadata-row' }, t('English Channel')));
    const lockup = el('yt-lockup-view-model', {}, meta);
    const bucket = discover(lockup);
    check('discovery lockup: title link discovered via lockup selector', bucket.has(titleLink), true);
    check('discovery lockup: macro lockup-view-model root NOT discovered', bucket.has(lockup), false);
    check('discovery lockup: metadata-view-model wrapper NOT discovered', bucket.has(meta), false);
    check('discovery lockup: h3 heading wrapper NOT discovered', bucket.has(h3), false);
    flipAll(bucket);
    check('discovery lockup: title flipped dir=rtl', titleLink.getAttribute('dir'), 'rtl');
    check('discovery lockup: title prose class', titleLink.classList.contains(PROSE_CLASS), true);
    check('discovery lockup: lockup root stays LTR', lockup.getAttribute('dir'), null);
    check('discovery lockup: metadata wrapper stays LTR', meta.getAttribute('dir'), null);
}
{
    const titleSpan = el('span', { cls: 'ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap' }, t('آموزش صفر تا صد فتوشاپ'));
    const titleLink = el('a', { cls: 'ytLockupMetadataViewModelTitle', attrs: { href: '/watch?v=live' } }, titleSpan);
    const h3 = el('h3', { cls: 'ytLockupMetadataViewModelHeadingReset' }, titleLink);
    const meta = el('yt-lockup-metadata-view-model', { cls: 'ytLockupMetadataViewModelHost' }, h3,
        el('div', { cls: 'ytContentMetadataViewModelMetadataRow' }, t('English Channel')));
    const root = el('yt-lockup-view-model', {}, meta);
    const bucket = discover(root);
    check('discovery live lockup: camelCase title link discovered', bucket.has(titleLink), true);
    check('discovery live lockup: inner attributed span discovered', bucket.has(titleSpan), true);
    check('discovery live lockup: metadata wrapper NOT discovered', bucket.has(meta), false);
    flipAll(bucket);
    check('discovery live lockup: title link flipped', titleLink.getAttribute('dir'), 'rtl');
    check('discovery live lockup: attributed span flipped', titleSpan.getAttribute('dir'), 'rtl');
    check('discovery live lockup: root stays LTR', root.getAttribute('dir'), null);
}
{
    const titleSpan = el('span', { cls: 'ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap' }, t('Milan Miles ❤️ اولین ولاگ با پسرم'));
    const titleLink = el('a', { cls: 'ytLockupMetadataViewModelTitle', attrs: { href: '/watch?v=latin-first' } }, titleSpan);
    const h3 = el('h3', { cls: 'ytLockupMetadataViewModelHeadingReset' }, titleLink);
    const root = el('yt-lockup-metadata-view-model', {}, h3);
    proseDoc.body.childNodes.length = 0;
    proseDoc.body.append(root);
    exported.runProseSweepNow(engine);
    check('font-only: Latin-first mixed title keeps native dir on link', titleLink.getAttribute('dir'), null);
    check('font-only: Latin-first mixed title keeps native dir on span', titleSpan.getAttribute('dir'), null);
    check('font-only: Latin-first mixed title does not get RTL prose class', titleLink.classList.contains(PROSE_CLASS), false);
    check('font-only: Latin-first mixed title gets font class on link', titleLink.classList.contains(PROSE_FONT_CLASS), true);
    check('font-only: Latin-first mixed title gets font class on span', titleSpan.classList.contains(PROSE_FONT_CLASS), true);
    titleSpan.childNodes.length = 0; titleSpan.append(t('Milan Miles official vlog'));
    exported.runProseSweepNow(engine);
    check('font-only: English-only update clears font class on link', titleLink.classList.contains(PROSE_FONT_CLASS), false);
    check('font-only: English-only update clears font class on span', titleSpan.classList.contains(PROSE_FONT_CLASS), false);
    proseDoc.body.childNodes.length = 0;
}

// ============================================================================
// 14) REAL discovery — HOMEPAGE rich-grid card title (older layout, bug #4),
//     mixed Persian/Latin via the '#video-title' / 'a#video-title-link' path.
// ============================================================================
{
    const cardTitle = el('yt-formatted-string', { attrs: { id: 'video-title' } }, t('آموزش Premiere Pro 2025'));
    const grid = el('ytd-rich-grid-renderer', {},
        el('ytd-rich-item-renderer', {},
            el('ytd-rich-grid-media', {},
                el('a', { attrs: { id: 'video-title-link' } }, cardTitle))));
    const bucket = discover(grid);
    check('discovery home: card title discovered via #video-title', bucket.has(cardTitle), true);
    check('discovery home: rich-grid wrapper NOT discovered', bucket.has(grid), false);
    flipAll(bucket);
    check('discovery home: card title flipped', cardTitle.getAttribute('dir'), 'rtl');
    const w = wrappers(cardTitle).map(concatText);
    check('discovery home: Latin run isolated', w.some(s => s.includes('Premiere')), true);
    check('discovery home: copy preserved', concatText(cardTitle), 'آموزش Premiere Pro 2025');
    check('discovery home: grid wrapper stays LTR', grid.getAttribute('dir'), null);
}

// ============================================================================
// 15) REAL discovery — watch DESCRIPTION, collapsed + expanded (bugs #2 + #3).
//     Existing 'ytd-text-inline-expander > #content' AND new '#description-inline-
//     expander #attributed-snippet-text' / '#plain-snippet-text' must match;
//     the inline #expand ("...more") button is excluded chrome.
// ============================================================================
{
    const content = el('div', { attrs: { id: 'content' } }, t('در این ویدیو با React و TypeScript کار می‌کنیم'));
    const moreBtn = el('tp-yt-paper-button', { attrs: { id: 'expand', role: 'button' } }, t('بیشتر'));
    const expander = el('ytd-text-inline-expander', {}, content, moreBtn);
    const bucket = discover(expander);
    check('discovery desc: inline-expander > #content discovered', bucket.has(content), true);
    check('discovery desc: the "...more" button NOT discovered', bucket.has(moreBtn), false);
    flipAll(bucket);
    check('discovery desc: content flipped dir=rtl', content.getAttribute('dir'), 'rtl');
    const w = wrappers(content).map(concatText);
    check('discovery desc: React isolated', w.includes('React'), true);
    check('discovery desc: TypeScript isolated', w.includes('TypeScript'), true);
    check('discovery desc: "...more" button never flipped', moreBtn.getAttribute('dir'), null);
    check('discovery desc: "...more" button never prose-classed', moreBtn.classList.contains(PROSE_CLASS), false);
}
{
    // expanded text now lives in #attributed-snippet-text (the v1.1.24 selectors missed it)
    const snippet = el('yt-attributed-string', { attrs: { id: 'attributed-snippet-text' } }, t('متن کامل توضیحات این ویدیو به فارسی'));
    const root = el('div', { attrs: { id: 'description-inline-expander' } }, snippet);
    const bucket = discover(root);
    check('discovery desc: #attributed-snippet-text discovered (expanded text)', bucket.has(snippet), true);
    flipAll(bucket);
    check('discovery desc: expanded attributed snippet flipped', snippet.getAttribute('dir'), 'rtl');
    check('discovery desc: expanded attributed snippet prose class', snippet.classList.contains(PROSE_CLASS), true);
}
{
    // the plain (non-attributed) snippet variant
    const plain = el('span', { attrs: { id: 'plain-snippet-text' } }, t('خلاصه ساده توضیحات فارسی'));
    const root = el('div', { attrs: { id: 'description-inline-expander' } }, plain);
    const bucket = discover(root);
    check('discovery desc: #plain-snippet-text discovered', bucket.has(plain), true);
    flipAll(bucket);
    check('discovery desc: plain snippet flipped', plain.getAttribute('dir'), 'rtl');
}
{
    const inner = el('span', { cls: 'ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap' },
        t('درس اول: آموزش فتوشاپ و ساخت فایل جدید'));
    const snippetText = el('span', { attrs: { id: 'snippet-text' } }, inner);
    const snippet = el('div', { attrs: { id: 'snippet' } }, snippetText);
    const root = el('ytd-text-inline-expander', { attrs: { id: 'description-inline-expander' } }, snippet);
    const bucket = discover(root);
    check('discovery desc live: #snippet-text discovered', bucket.has(snippetText), true);
    check('discovery desc live: attributed host inside snippet discovered', bucket.has(inner), true);
    flipAll(bucket);
    check('discovery desc live: snippet-text flipped', snippetText.getAttribute('dir'), 'rtl');
    check('discovery desc live: attributed host flipped', inner.getAttribute('dir'), 'rtl');
}

// ============================================================================
// 16) REAL discovery — SEARCH SUGGESTIONS dropdown row (bug #5). New stable-tag
//     selector 'yt-searchbox-suggestion .ytSuggestionComponentSuggestionText'.
// ============================================================================
{
    // No role="option" on the row — this locks the NEW tag/container-scoped
    // selectors specifically (the v1.1.24 '[role="option"] .ytSuggestion…' path
    // is fragile across builds, the reported bug). Only the new
    // 'yt-searchbox-suggestion .ytSuggestion…' / '.ytSearchboxComponentSuggestions
    // Container .ytSuggestion…' selectors can match here.
    const sugText = el('span', { cls: 'ytSuggestionComponentSuggestionText' }, t('آموزش گیتار فارسی'));
    const suggestion = el('yt-searchbox-suggestion', {}, sugText);
    const container = el('div', { cls: 'ytSearchboxComponentSuggestionsContainer' }, suggestion);
    const bucket = discover(container);
    check('discovery suggestions: text leaf discovered via yt-searchbox-suggestion', bucket.has(sugText), true);
    check('discovery suggestions: suggestions container NOT discovered', bucket.has(container), false);
    flipAll(bucket);
    check('discovery suggestions: leaf flipped dir=rtl', sugText.getAttribute('dir'), 'rtl');
    check('discovery suggestions: leaf prose class', sugText.classList.contains(PROSE_CLASS), true);
}
{
    const sugText = el('div', { attrs: { id: 'searchbox-suggestion:0' }, cls: 'ytSuggestionComponentText ytSuggestionComponentScrollMargin' },
        el('div', { cls: 'ytSuggestionComponentLeftContainer' }, el('span', {}, t('آموزش فتوشاپ'))));
    const suggestion = el('div', { cls: 'ytSuggestionComponentSuggestion ytSuggestionComponentLargerSuggestion' }, sugText);
    const container = el('div', { cls: 'ytSearchboxComponentSuggestionsContainer' }, suggestion);
    const searchbox = el('yt-searchbox', { cls: 'ytSearchboxComponentHost' }, container);
    const bucket = discover(searchbox);
    check('discovery live suggestions: ytSuggestionComponentText discovered', bucket.has(sugText), true);
    check('discovery live suggestions: outer suggestion row NOT discovered', bucket.has(suggestion), false);
    flipAll(bucket);
    check('discovery live suggestions: text div flipped dir=rtl', sugText.getAttribute('dir'), 'rtl');
    check('discovery live suggestions: text div prose class', sugText.classList.contains(PROSE_CLASS), true);
}
{
    const sugText = el('div', {
        attrs: { id: 'searchbox-suggestion:1' },
        cls: 'ytSuggestionComponentText ytSuggestionComponentScrollMargin',
        style: { direction: 'ltr', textAlign: 'left', fontFamily: 'Roboto' }
    }, t('آموزش Photoshop 2025'));
    if (typeof exported.applySuggestionTextDirection !== 'function') {
        check('direct suggestions: applySuggestionTextDirection exposed', false, true);
    } else {
        exported.applySuggestionTextDirection(sugText, engine);
        check('direct suggestions: Persian dir=rtl', sugText.getAttribute('dir'), 'rtl');
        check('direct suggestions: Persian prose class', sugText.classList.contains(PROSE_CLASS), true);
        check('direct suggestions: Persian font Vazirmatn', /Vazirmatn/.test(sugText.style.fontFamily || ''), true);
        check('direct suggestions: Latin run isolated', wrappers(sugText).map(concatText).some(text => text.includes('Photoshop')), true);
        sugText.childNodes.length = 0; sugText.append(t('photoshop tutorial'));
        exported.applySuggestionTextDirection(sugText, engine);
        check('direct suggestions: English dir restored', sugText.getAttribute('dir'), null);
        check('direct suggestions: English class restored', sugText.classList.contains(PROSE_CLASS), false);
        check('direct suggestions: original font restored', sugText.style.fontFamily, 'Roboto');
    }
}

// ============================================================================
// 16b) REAL discovery — comment prose text. Persian comments are user text,
//      not YouTube chrome, so the text leaf receives the same typography rules.
// ============================================================================
{
    const text = el('yt-attributed-string', { attrs: { id: 'content-text' } }, t('از تور هنوز در تیوبه تشکر گذاشتی'));
    const comment = el('ytd-comment-view-model', {}, text);
    const bucket = discover(comment);
    check('discovery comments: content-text discovered', bucket.has(text), true);
    flipAll(bucket);
    check('discovery comments: content-text flipped dir=rtl', text.getAttribute('dir'), 'rtl');
    check('discovery comments: content-text prose class', text.classList.contains(PROSE_CLASS), true);
}

// ============================================================================
// 17) TRANSITION — a discovered Persian leaf flips RTL, then its text becomes
//     English-only and a re-scan RESTORES it (dir/class cleared, no stale <bdi>).
// ============================================================================
{
    const leaf = el('yt-formatted-string', { attrs: { id: 'video-title' } }, t('آموزش Photoshop'));
    const root = el('ytd-rich-item-renderer', {}, leaf);
    flipAll(discover(root));
    check('transition: initial flip dir=rtl', leaf.getAttribute('dir'), 'rtl');
    check('transition: initial prose class', leaf.classList.contains(PROSE_CLASS), true);
    check('transition: initial Latin isolated', wrappers(leaf).map(concatText).includes('Photoshop'), true);
    leaf.childNodes.length = 0; leaf.append(t('Photoshop Tutorial'));
    flipAll(discover(root));
    check('transition: dir cleared on English-only', leaf.getAttribute('dir'), null);
    check('transition: prose class removed', leaf.classList.contains(PROSE_CLASS), false);
    check('transition: stale wrappers removed', wrappers(leaf).length, 0);
    check('transition: text intact after restore', concatText(leaf), 'Photoshop Tutorial');
}

// ============================================================================
// 18) GUARD — layout wrappers, buttons/icons, search input, code/pre are never
//     flipped, even carrying Persian text or sitting inside a discovered subtree.
// ============================================================================
{
    const masthead = el('div', { attrs: { id: 'masthead' } }, el('div', { attrs: { id: 'container' } }, t('یوتیوب')));
    const grid = el('ytd-rich-grid-renderer', {}, t('شبکه'));
    const pageMgr = el('div', { attrs: { id: 'page-manager' } }, t('صفحه'));
    [['masthead', masthead], ['grid', grid], ['page-manager', pageMgr]].forEach(([name, root]) => {
        const bucket = discover(root);
        check(`guard: layout wrapper ${name} not a candidate`, bucket.has(root), false);
        flipAll(bucket);
        check(`guard: layout wrapper ${name} not flipped`, root.getAttribute('dir'), null);
    });
}
{
    // button + icon inside a discovered Persian title: prose flips, chrome untouched
    const icon = el('yt-icon', {}, t('★'));
    const btn = el('button', { attrs: { role: 'button' } }, t('اشتراک'), icon);
    const titleLeaf = el('yt-formatted-string', { attrs: { id: 'video-title' } }, t('ویدیوی فارسی '), btn);
    const root = el('ytd-rich-item-renderer', {}, titleLeaf);
    flipAll(discover(root));
    check('guard: prose leaf flips around chrome', titleLeaf.getAttribute('dir'), 'rtl');
    check('guard: nested button not flipped', btn.getAttribute('dir'), null);
    check('guard: button glyph not wrapped', wrappers(btn).length, 0);
    check('guard: yt-icon glyph not wrapped', wrappers(icon).length, 0);
}
{
    // search <input> is fenced out of the engine walk (own listener path)
    const input = el('input', { attrs: { id: 'search', 'aria-label': 'Search' } });
    input.value = 'جستجو';
    const form = el('form', { attrs: { id: 'search-form' } }, input);
    const bucket = discover(form);
    check('guard: search input not a discovery candidate', bucket.has(input), false);
    check('guard: search input untouched by walk', input.getAttribute('dir'), null);
}
{
    // code inside a discovered description stays LTR, never bdi-wrapped
    const code = el('code', {}, t('npm install'));
    const desc = el('div', { attrs: { id: 'content' } }, t('برای نصب '), code, t(' را اجرا کنید'));
    const expander = el('ytd-text-inline-expander', {}, desc);
    flipAll(discover(expander));
    check('guard: description flips', desc.getAttribute('dir'), 'rtl');
    check('guard: code node not flipped', code.getAttribute('dir'), null);
    check('guard: code glyphs not bdi-wrapped', wrappers(code).length, 0);
}

// ============================================================================
// 19) MATCHER guard — the descendant matcher must not be greedy. '#channel-name
//     #text' matches a #text INSIDE a #channel-name and NOTHING otherwise.
// ============================================================================
{
    const inside = el('span', { attrs: { id: 'text' } }, t('نام کانال فارسی'));
    const chan = el('ytd-channel-name', { attrs: { id: 'channel-name' } }, inside);
    check('matcher: #text inside #channel-name discovered', discover(chan).has(inside), true);

    const orphanText = el('span', { attrs: { id: 'text' } }, t('بدون والد کانال'));
    const unrelated = el('div', {}, orphanText);
    check('matcher: bare #text with no #channel-name ancestor NOT discovered', discover(unrelated).has(orphanText), false);
}

// ============================================================================
// 20) CSS CONTRACT — the recipe stylesheet stays per-element: no global
//     body/html/ytd-app/#masthead/#page-manager rule; the prose font rule is
//     scoped to the prose class; the v1.1.25 More-button overlap rule is present
//     and scoped to a flipped description block (never a bare button).
// ============================================================================
{
    const codeGuard = (recipe.codeGuardSelectors || []).join(', ');
    const css = typeof recipe.globalCss === 'function'
        ? recipe.globalCss(codeGuard, {
            messageSelector: (recipe.messageSelectors || []).join(', '),
            messageSelectors: recipe.messageSelectors || [],
            codeGuardSelectors: recipe.codeGuardSelectors || [],
            excludeSelectors: recipe.excludeSelectors || []
        })
        : String(recipe.globalCss || '');

    // True iff `target` appears as a STANDALONE selector at a rule boundary
    // (start, ',', '}', or newline) up to the next '{' on that rule.
    function hasGlobalRule(cssText, target) {
        const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(^|[},\\n])\\s*' + esc + '\\b[^,{}]*\\{', 'm').test(cssText);
    }

    check('css-contract: no global body rule', hasGlobalRule(css, 'body'), false);
    check('css-contract: no global html rule', hasGlobalRule(css, 'html'), false);
    check('css-contract: no global ytd-app rule', hasGlobalRule(css, 'ytd-app'), false);
    check('css-contract: #masthead never referenced', css.includes('#masthead'), false);
    check('css-contract: #page-manager never referenced', css.includes('#page-manager'), false);
    check('css-contract: #page-manager-root never referenced', css.includes('page-manager'), false);
    check('css-contract: no bare button rule', hasGlobalRule(css, 'button'), false);

    check('css-contract: prose font rule scoped to prose class', css.includes('.' + PROSE_CLASS), true);
    check('css-contract: font-only class present for Latin-first mixed titles', css.includes('.' + PROSE_FONT_CLASS), true);
    check('css-contract: prose font rule sets Vazirmatn',
        new RegExp('\\.' + PROSE_CLASS + '[^{]*\\{[^}]*Vazirmatn', 'm').test(css), true);
    check('css-contract: title visual correction stays limited and present',
        /yt-formatted-string#video-title:is\(\.rastchin-youtube-prose-rtl,\s*\.rastchin-youtube-prose-font\)[\s\S]*font-size:\s*min\(1em,\s*17\.5px\)[\s\S]*font-weight:\s*450/.test(css), true);
    check('css-contract: search suggestion fallback scoped to searchbox RTL class',
        css.includes('.rastchin-youtube-search-rtl') && css.includes('.ytSuggestionComponentText'), true);
    check('css-contract: search suggestion fallback sets Vazirmatn',
        /\.rastchin-youtube-search-rtl[^{]*\{[^}]*Vazirmatn/m.test(css), true);
    check('css-contract: search suggestion visual correction present',
        /\.rastchin-youtube-search-rtl[^{]*\{[^}]*font-size:\s*0\.94em[^}]*font-weight:\s*400/m.test(css), true);

    // v1.1.25 More-button overlap fix (RED until Part 2): an RTL-aware reserve on a
    // flipped description block, never a global/button rule.
    check('css-contract: More-fix reserves space via padding-inline-start', css.includes('padding-inline-start'), true);
    check('css-contract: More-fix scoped to a flipped description block',
        /#(content|snippet|attributed-snippet-text|plain-snippet-text)\.rastchin-youtube-prose-rtl/.test(css), true);
}

// --- summary -------------------------------------------------------------------
if (failures === 0) {
    console.log(`\nyoutube-prose-rtl: PASS (${total} checks)`);
} else {
    console.log(`\nyoutube-prose-rtl: FAIL (${failures}/${total} checks failed)`);
    process.exit(1);
}
