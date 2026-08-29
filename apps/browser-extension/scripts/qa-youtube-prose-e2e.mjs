#!/usr/bin/env node
// QA: browser-measured proof of YouTube UI-PROSE RTL behavior under the real
// built extension — per-element Persian RTL + Vazirmatn on YouTube's OWN UI text
// (sidebar related-video titles, home card titles, expanded watch description,
// search-suggestion rows), with the whole-page layout, grid, masthead, player
// chrome, buttons and icons left strictly LTR/untouched.
//
// It launches Chromium with the unpacked extension loaded on www.youtube.com,
// confirms the service worker is running, waits for the recipe stylesheet (the
// prose class rule + Vazirmatn @font-face) to be injected, then injects controlled
// fixtures replicating real YouTube DOM for:
//   #yt-sidebar  — a watch-page right-sidebar lockup (yt-lockup-metadata-view-model)
//   #yt-home     — a homepage rich-grid video card (ytd-rich-item-renderer)
//   #yt-desc     — an EXPANDED watch description (ytd-text-inline-expander) with a
//                  collapsed-state "...more" button next to it
//   #yt-search   — a search-suggestion dropdown row (yt-searchbox-suggestion)
//   #yt-control  — chrome that must stay LTR: a real <button>, a yt-icon, a caption
//                  segment, and an English-only title
// then MEASURES computed styles, dir attributes, the prose class, <bdi> wrappers
// and copy integrity. No package dependencies. NOT part of `pnpm test` (needs
// local Chromium + network); run manually from this app:
//
//   pnpm run build:unpacked && node scripts/qa-youtube-prose-e2e.mjs
//
// NOTE: branded Google Chrome >= 137 silently ignores --load-extension; point
// CHROMIUM_BIN at a Chromium build (default: /Applications/Chromium.app).

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNPACKED = path.join(ROOT, 'unpacked');
const CHROMIUM = process.env.CHROMIUM_BIN || '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PORT = 9253;
const PROFILE = '/tmp/rastchin-youtube-prose-e2e-profile';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cdpTargets() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json`);
    return response.json();
}

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        let nextId = 1;
        const pending = new Map();
        socket.onopen = () => resolve({
            send(method, params = {}) {
                return new Promise((res, rej) => {
                    const id = nextId++;
                    pending.set(id, { res, rej });
                    socket.send(JSON.stringify({ id, method, params }));
                });
            },
            close: () => socket.close()
        });
        socket.onerror = event => reject(new Error(`WS error: ${event.message || wsUrl}`));
        socket.onclose = () => {
            for (const { rej } of pending.values()) rej(new Error('CDP socket closed'));
            pending.clear();
        };
        socket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (message.id && pending.has(message.id)) {
                const { res, rej } = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) rej(new Error(message.error.message));
                else res(message.result);
            }
        };
    });
}

function withDeadline(promise, ms, label) {
    let timer;
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function evalInTarget(target, expression) {
    const client = await connect(target.webSocketDebuggerUrl);
    try {
        const { result, exceptionDetails } = await withDeadline(
            client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
            15000, 'Runtime.evaluate');
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
        return result.value;
    } finally {
        client.close();
    }
}

async function sendToTarget(target, method, params = {}) {
    const client = await connect(target.webSocketDebuggerUrl);
    try {
        return await withDeadline(client.send(method, params), 15000, method);
    } finally {
        client.close();
    }
}

let chromium;
let failures = 0;
function report(label, ok, detail = '') {
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// ── Controlled fixtures replicating the LIVE YouTube DOM ─────────────────────
// Every Persian LEAF below matches a real PROSE_SELECTOR from youtube-rtl.js, so
// the engine's cheap string-selector path discovers it; every LAYOUT WRAPPER is
// deliberately built so it matches NO prose selector (it must stay LTR). The
// element ids (#yt-*) are QA hooks only — the engine keys off the YouTube
// tag/id/role anatomy inside.
//
// Selectors exercised (must stay in sync with PROSE_SELECTORS):
//   #yt-sidebar : `#video-title`            (a#video-title-link inside the lockup)
//   #yt-sidebar-latin-first : font-only class for English-led mixed titles
//   #yt-home    : `#video-title`            (yt-formatted-string#video-title)
//   #yt-desc    : `ytd-text-inline-expander > #content`
//   #yt-search  : `yt-searchbox .ytSuggestionComponentText`
//
// Persian copy is chosen with Persian-strong letters (پچژگکی) and a mixed
// Persian/Latin variant so first-strong RTL + <bdi> isolation are both proven.
const P_SIDEBAR = 'قسمت دوازدهم سریال جدید';                       // Persian-only
const P_LATIN_FIRST = 'Milan Miles ❤️ اولین ولاگ با پسرم';          // mixed Latin-first: font-only, no RTL flip
const P_HOME = 'آموزش Photoshop حرفه‌ای';                          // mixed Persian/Latin (single Latin run)
const P_DESC = 'در این ویدیو با React و Next.js کار می‌کنیم و یک پروژه کامل می‌سازیم'; // mixed, multi-word
const P_SUGGEST = 'دانلود آهنگ جدید';                              // Persian-only
const ENGLISH_TITLE = 'Top 10 Games of 2025';                     // must stay LTR/untouched

const FIXTURES = `
<div id="rastchin-yt-qa" dir="ltr" style="position:absolute; top:0; left:0; width:480px; background:#fff; color:#111; z-index:2147483647;">

  <!-- (1) WATCH-PAGE RIGHT SIDEBAR lockup (modern view-model — NO #video-title,
       so it can ONLY match the new 'yt-lockup-metadata-view-model h3 .…wiz__title'
       selector). The list/grid/lockup wrappers AND the channel byline row (NOT
       under the h3) must stay LTR; only the <a> title leaf flips. -->
  <ytd-watch-next-secondary-results-renderer id="yt-sidebar-root">
   <div id="yt-sidebar-grid" class="ytd-watch-next-secondary-results-renderer">
    <yt-lockup-view-model id="yt-sidebar" class="ytd-item-section-renderer">
     <yt-lockup-metadata-view-model class="yt-lockup-metadata-view-model-wiz">
      <h3 class="ytLockupMetadataViewModelHeadingReset">
       <a id="yt-sidebar-title" href="/watch?v=qa" class="ytLockupMetadataViewModelTitle">
        <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">${P_SIDEBAR}</span>
       </a>
      </h3>
      <div id="yt-sidebar-byline" class="yt-content-metadata-view-model-wiz__metadata-row">
       <span class="yt-core-attributed-string">English Channel Name</span>
      </div>
     </yt-lockup-metadata-view-model>
     <yt-lockup-metadata-view-model class="yt-lockup-metadata-view-model-wiz">
      <h3 class="ytLockupMetadataViewModelHeadingReset">
       <a id="yt-sidebar-latin-first" href="/watch?v=qa-latin-first" class="ytLockupMetadataViewModelTitle">
        <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">${P_LATIN_FIRST}</span>
       </a>
      </h3>
      <div id="yt-sidebar-latin-first-byline" class="yt-content-metadata-view-model-wiz__metadata-row">
       <span class="yt-core-attributed-string">Mixed Channel</span>
      </div>
     </yt-lockup-metadata-view-model>
    </yt-lockup-view-model>
   </div>
  </ytd-watch-next-secondary-results-renderer>

  <!-- (2) HOMEPAGE rich-grid video card. ytd-rich-* wrappers stay LTR; the title
       link (a#video-title-link) flips. Mixed Persian/Latin copy. Text lives in a
       plain <a> (NOT a yt-formatted-string, whose custom-element upgrade wipes raw
       injected light-DOM text). -->
  <ytd-rich-grid-renderer id="yt-home-grid">
   <ytd-rich-item-renderer id="yt-home-item">
    <div id="yt-home" class="ytd-rich-grid-media">
     <h3 class="ytd-rich-grid-media">
      <a id="video-title-link" class="ytd-rich-grid-media" href="/watch?v=qa2">${P_HOME}</a>
     </h3>
    </div>
   </ytd-rich-item-renderer>
  </ytd-rich-grid-renderer>

  <!-- (3) EXPANDED watch description with the collapsed "...more" button beside
       it. ytd-text-inline-expander>#content is the flipping leaf; the <tp-yt-
       paper-button role="button"> "...more" is chrome and must stay LTR/unwrapped. -->
  <ytd-watch-metadata id="yt-desc-meta">
   <ytd-text-inline-expander id="description-inline-expander">
    <div id="content" class="ytd-text-inline-expander">
     <yt-attributed-string id="attributed-snippet-text">
      <span class="yt-core-attributed-string">${P_DESC}</span>
     </yt-attributed-string>
    </div>
    <tp-yt-paper-button id="yt-desc-more" role="button" class="button style-scope ytd-text-inline-expander">
     ...بیشتر
    </tp-yt-paper-button>
   </ytd-text-inline-expander>
  </ytd-watch-metadata>

  <!-- (4) SEARCH-SUGGESTION dropdown row. The container must stay LTR; only the
       suggestion text leaf flips. NO role="option" here, so it can only match the
       new tag/container-scoped selectors (the [role=option] scope was the fragile
       part — the reported bug). -->
  <yt-searchbox class="ytSearchboxComponentHost">
   <div class="ytSearchboxComponentSuggestionsContainer" id="yt-search-container">
    <div id="yt-search" class="ytSuggestionComponentSuggestion ytSuggestionComponentLargerSuggestion">
     <div id="searchbox-suggestion:0" class="ytSuggestionComponentText ytSuggestionComponentScrollMargin">
      <div class="ytSuggestionComponentLeftContainer"><span>${P_SUGGEST}</span></div>
     </div>
    </div>
   </div>
  </yt-searchbox>

  <!-- (5) CHROME that must stay LTR/untouched: a real button, an icon, a caption
       segment (the SEPARATE caption path), and an English-only lockup title that
       IS discovered by the prose walk but must NOT flip (over-flip guard). Text in
       a plain <a> so the custom-element upgrade does not wipe it. -->
  <div id="yt-control">
   <button id="yt-control-button" aria-label="عضویت">عضویت در کانال</button>
   <yt-icon id="yt-control-icon" class="ytd-icon" aria-hidden="true">▶</yt-icon>
   <div class="caption-window" id="yt-control-caption">
    <span class="ytp-caption-segment">یک زیرنویس فارسی</span>
   </div>
   <yt-lockup-metadata-view-model class="yt-lockup-metadata-view-model-wiz">
    <h3 class="ytLockupMetadataViewModelHeadingReset">
     <a id="yt-control-english" class="ytLockupMetadataViewModelTitle" href="/watch?v=qa3">${ENGLISH_TITLE}</a>
    </h3>
   </yt-lockup-metadata-view-model>
  </div>

</div>`;

// The measurement runs INSIDE the page after the engine has had its passes. It
// reports raw facts; the Node side turns them into PASS/FAIL assertions so the
// expected design is explicit here, not buried in the page.
const MEASURE = `(async () => {
    const byId = id => document.getElementById(id);
    const cssText = [...document.querySelectorAll('style')].map(s => s.textContent || '').join('\\n');
    const cssInjected = cssText.includes('rastchin-youtube-prose-rtl');
    const fontFaceInjected = cssText.includes('@font-face') && /font-family:\\s*"?Vazirmatn"?/i.test(cssText);

    const PROSE_CLASS = 'rastchin-youtube-prose-rtl';
    const PROSE_FONT_CLASS = 'rastchin-youtube-prose-font';
    const firstFamily = el => (getComputedStyle(el).fontFamily || '').split(',')[0].replace(/^["']|["']$/g, '').trim();
    const usesVazir = el => /vazirmatn/i.test(getComputedStyle(el).fontFamily || '');
    const bdiInfo = root => [...root.querySelectorAll('[data-rastchin-bidi]')].map(b => ({
        tag: b.tagName, dir: b.getAttribute('dir'), text: b.textContent }));

    const leaf = (rootId, sel) => { const r = byId(rootId); return r ? r.querySelector(sel) : null; };

    const sidebarLeaf = byId('yt-sidebar-title');
    const latinFirstLeaf = byId('yt-sidebar-latin-first');
    const homeLeaf = leaf('yt-home', '#video-title-link');
    const descLeaf = byId('description-inline-expander') ? byId('description-inline-expander').querySelector(':scope > #content') : null;
    const searchLeaf = leaf('yt-search', '.ytSuggestionComponentText');

    if (!sidebarLeaf || !latinFirstLeaf || !homeLeaf || !descLeaf || !searchLeaf) {
        return { error: 'one or more prose leaves missing',
            present: { sidebarLeaf: !!sidebarLeaf, latinFirstLeaf: !!latinFirstLeaf, homeLeaf: !!homeLeaf, descLeaf: !!descLeaf, searchLeaf: !!searchLeaf } };
    }

    const describeLeaf = el => ({
        dir: el.getAttribute('dir'),
        cls: el.classList.contains(PROSE_CLASS),
        fontCls: el.classList.contains(PROSE_FONT_CLASS),
        direction: getComputedStyle(el).direction,
        textAlign: getComputedStyle(el).textAlign,
        font: firstFamily(el),
        usesVazir: usesVazir(el),
        // Inline-start reserve (px) — proves the v1.1.25 More-button overlap rule
        // landed on a flipped description block (0 on every other surface).
        padInlineStart: parseFloat(getComputedStyle(el).paddingInlineStart) || 0,
        copy: (el.textContent || '').replace(/\\s+/g, ' ').trim(),
        bdi: bdiInfo(el)
    });

    const describeWrapper = (id, sel) => {
        const el = byId(id);
        return el ? { dir: el.getAttribute('dir'), cls: el.classList.contains(PROSE_CLASS) } : { missing: true };
    };

    const moreBtn = byId('yt-desc-more');
    const ctrlButton = byId('yt-control-button');
    const ctrlIcon = byId('yt-control-icon');
    const ctrlCaptionSeg = byId('yt-control-caption') ? byId('yt-control-caption').querySelector('.ytp-caption-segment') : null;
    const ctrlEnglish = byId('yt-control-english');

    return {
        cssInjected, fontFaceInjected,
        // Vazirmatn @font-face actually resolved by the font system.
        vazirLoaded: await document.fonts.load('16px Vazirmatn', 'م').then(fs => fs.length > 0).catch(() => false),

        sidebar: describeLeaf(sidebarLeaf),
        latinFirst: describeLeaf(latinFirstLeaf),
        home: describeLeaf(homeLeaf),
        desc: describeLeaf(descLeaf),
        search: describeLeaf(searchLeaf),

        // Layout wrappers — every one of these must stay LTR (no dir, no prose class).
        wrappers: {
            sidebarRoot: describeWrapper('yt-sidebar-root', null),
            sidebarGrid: describeWrapper('yt-sidebar-grid', null),
            sidebarLockup: describeWrapper('yt-sidebar', null),
            sidebarByline: describeWrapper('yt-sidebar-byline', null),
            sidebarLatinFirstByline: describeWrapper('yt-sidebar-latin-first-byline', null),
            homeGrid: describeWrapper('yt-home-grid', null),
            homeItem: describeWrapper('yt-home-item', null),
            descMeta: describeWrapper('yt-desc-meta', null),
            searchContainer: describeWrapper('yt-search-container', null)
        },

        // The collapsed "...more" button must stay LTR, keep its label, never wrap.
        more: moreBtn ? {
            dir: moreBtn.getAttribute('dir'),
            cls: moreBtn.classList.contains(PROSE_CLASS),
            direction: getComputedStyle(moreBtn).direction,
            usesVazir: usesVazir(moreBtn),
            bdiInside: bdiInfo(moreBtn).length,
            copy: (moreBtn.textContent || '').trim()
        } : { missing: true },

        // Chrome that must be completely untouched.
        control: {
            button: ctrlButton ? { dir: ctrlButton.getAttribute('dir'), cls: ctrlButton.classList.contains(PROSE_CLASS),
                usesVazir: usesVazir(ctrlButton), bdiInside: bdiInfo(ctrlButton).length } : { missing: true },
            icon: ctrlIcon ? { dir: ctrlIcon.getAttribute('dir'), cls: ctrlIcon.classList.contains(PROSE_CLASS),
                usesVazir: usesVazir(ctrlIcon), bdiInside: bdiInfo(ctrlIcon).length } : { missing: true },
            // The caption path is SEPARATE — the prose walk must not stamp the
            // prose class on a caption segment (it has its own caption pipeline).
            captionSegment: ctrlCaptionSeg ? { proseClass: ctrlCaptionSeg.classList.contains(PROSE_CLASS) } : { missing: true },
            english: ctrlEnglish ? { dir: ctrlEnglish.getAttribute('dir'), cls: ctrlEnglish.classList.contains(PROSE_CLASS),
                usesVazir: usesVazir(ctrlEnglish), bdiInside: bdiInfo(ctrlEnglish).length,
                copy: (ctrlEnglish.textContent || '').trim() } : { missing: true }
        },

        expectedCopy: {
            latinFirst: ${JSON.stringify(P_LATIN_FIRST)},
            home: ${JSON.stringify(P_HOME)},
            desc: ${JSON.stringify(P_DESC)},
            english: ${JSON.stringify(ENGLISH_TITLE)}
        }
    };
})()`;

// ── Chromium-missing fallback ────────────────────────────────────────────────
// Mirror the Claude QA: this script is manual-only and needs a real Chromium with
// --load-extension support (branded Chrome >= 137 silently ignores it). If the
// binary is absent, print exactly why and how to fix it, and exit 0 so it never
// fails an unattended/CI run that legitimately has no browser. The only "failure"
// exit comes from a real assertion miss once Chromium IS present.
if (!existsSync(CHROMIUM)) {
    console.log('SKIP  YouTube prose E2E — Chromium not found.');
    console.log(`      Looked for: ${CHROMIUM}`);
    console.log('      This QA needs a Chromium build that honors --load-extension');
    console.log('      (branded Google Chrome >= 137 silently ignores it).');
    console.log('      Fix: install Chromium to /Applications/Chromium.app, or set');
    console.log('      CHROMIUM_BIN=/path/to/Chromium and re-run:');
    console.log('        CHROMIUM_BIN=/path/to/Chromium node scripts/qa-youtube-prose-e2e.mjs');
    console.log('YOUTUBE PROSE E2E NOT RUN (no Chromium)');
    process.exit(0);
}

try {
    rmSync(PROFILE, { recursive: true, force: true });
    chromium = spawn(CHROMIUM, [
        `--user-data-dir=${PROFILE}`,
        '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        `--remote-debugging-port=${PORT}`,
        '--window-size=1000,900', '--window-position=80,80',
        `--load-extension=${UNPACKED}`,
        'https://www.youtube.com/'
    ], { stdio: 'ignore' });

    await sleep(9000);

    const targets = await cdpTargets();
    const swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('src/background/service-worker.js'));
    report('extension service worker running', Boolean(swTarget), swTarget?.url || 'not found');
    if (!swTarget) throw new Error('service worker target missing');

    const ytTarget = targets.find(t => t.type === 'page' && t.url.startsWith('https://www.youtube.com'));
    if (!ytTarget) throw new Error('youtube.com tab missing');
    await sendToTarget(ytTarget, 'Page.bringToFront');

    // Wait for the recipe stylesheet (prose class rule + Vazirmatn @font-face).
    // The recipe creates the <style> inside runPlatformRecipe.enable(), after the
    // host gate + chatbotConfig resolve and the engine's observer is live;
    // injecting fixtures earlier makes this QA flaky.
    let recipeReady = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        recipeReady = await evalInTarget(ytTarget,
            `[...document.querySelectorAll('style')].some(s => (s.textContent || '').includes('rastchin-youtube-prose-rtl'))`);
        if (recipeReady) break;
        await sleep(500);
    }
    if (!recipeReady) throw new Error('YouTube prose recipe CSS did not become ready before fixture injection');

    // Inject the fixtures, then poll until the prose walk has reached every leaf
    // (a busy SPA can defer the engine's rAF-driven scan past a fixed sleep)
    // before measuring. The settle gate in isolateInline adds ~300ms after the
    // initial mutation burst, so we wait on the OBSERVED end-state (dir + <bdi>),
    // not a fixed delay.
    // YouTube enforces Trusted Types (require-trusted-types-for 'script'), so a raw
    // insertAdjacentHTML string is rejected ("This document requires 'TrustedHTML'").
    // Prefer a Trusted Types policy; if the page CSP forbids new policy names, fall
    // back to an inert DOMParser parse + adoptNode (parseFromString is exempt).
    const injectResult = await evalInTarget(ytTarget, `(() => {
        const html = ${JSON.stringify(FIXTURES)};
        try {
            let payload = html;
            if (window.trustedTypes && window.trustedTypes.createPolicy) {
                const policy = window.trustedTypes.createPolicy('rastchin-qa', { createHTML: s => s });
                payload = policy.createHTML(html);
            }
            document.body.insertAdjacentHTML('beforeend', payload);
            return 'inserted-via-' + (window.trustedTypes ? 'policy' : 'raw');
        } catch (e) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const root = doc.body.firstElementChild;
            if (!root) return 'parse-empty';
            document.body.appendChild(document.adoptNode(root));
            return 'inserted-via-domparser';
        }
    })()`);
    console.log('fixture injection:', injectResult);
    for (let attempt = 0; attempt < 24; attempt++) {
        await sleep(1500);
        const processed = await evalInTarget(ytTarget, `(() => {
            const q = (id, sel) => { const r = document.getElementById(id); return r ? r.querySelector(sel) : null; };
            const sidebar = document.getElementById('yt-sidebar-title');
            const home = q('yt-home', '#video-title-link');
            const search = q('yt-search', '.ytSuggestionComponentText');
            const descExp = document.getElementById('description-inline-expander');
            const desc = descExp ? descExp.querySelector(':scope > #content') : null;
            const homeBdi = home ? home.querySelector('[data-rastchin-bidi]') : null;
            return Boolean(sidebar && sidebar.getAttribute('dir') === 'rtl') &&
                   Boolean(home && home.getAttribute('dir') === 'rtl' && homeBdi) &&
                   Boolean(desc && desc.getAttribute('dir') === 'rtl') &&
                   Boolean(search && search.getAttribute('dir') === 'rtl');
        })()`);
        if (processed) break;
    }

    const m = await evalInTarget(ytTarget, MEASURE);
    if (!m || m.error) throw new Error(`measurement failed: ${m && (m.error + ' ' + JSON.stringify(m.present || {}))}`);

    console.log('\n--- raw measurements ---');
    console.log(JSON.stringify(m, null, 1));
    console.log('--- assertions ---');

    // ── Recipe wiring ────────────────────────────────────────────────────────
    report('recipe CSS injected (prose class rule present)', m.cssInjected === true);
    report('prose @font-face Vazirmatn declared in recipe CSS', m.fontFaceInjected === true);
    report('Vazirmatn @font-face loads', m.vazirLoaded === true);

    // ── (1) Sidebar related-video title (BUG #1) ─────────────────────────────
    report('sidebar title: dir=rtl', m.sidebar.dir === 'rtl', `dir=${m.sidebar.dir}`);
    report('sidebar title: carries prose class', m.sidebar.cls === true);
    report('sidebar title: computed direction rtl', m.sidebar.direction === 'rtl', m.sidebar.direction);
    report('sidebar title: text-align right (prose, not caption center)', m.sidebar.textAlign === 'right', m.sidebar.textAlign);
    report('sidebar title: computed font is Vazirmatn', m.sidebar.usesVazir === true && /vazirmatn/i.test(m.sidebar.font), m.sidebar.font);

    // ── (1b) Latin-first mixed sidebar title: font-only, no direction flip ───
    report('Latin-first mixed title: no dir flip', m.latinFirst.dir == null, `dir=${m.latinFirst.dir}`);
    report('Latin-first mixed title: no RTL prose class', m.latinFirst.cls === false);
    report('Latin-first mixed title: has font-only class', m.latinFirst.fontCls === true);
    report('Latin-first mixed title: computed font is Vazirmatn', m.latinFirst.usesVazir === true && /vazirmatn/i.test(m.latinFirst.font), m.latinFirst.font);
    report('Latin-first mixed title: no <bdi> wrappers because it stays LTR', m.latinFirst.bdi.length === 0, JSON.stringify(m.latinFirst.bdi));
    report('Latin-first mixed title: copy byte-identical', m.latinFirst.copy === m.expectedCopy.latinFirst, JSON.stringify(m.latinFirst.copy));

    // ── (2) Homepage video card title (BUG #4) — mixed Persian/Latin ─────────
    report('home title: dir=rtl', m.home.dir === 'rtl', `dir=${m.home.dir}`);
    report('home title: carries prose class', m.home.cls === true);
    report('home title: computed font is Vazirmatn', m.home.usesVazir === true && /vazirmatn/i.test(m.home.font), m.home.font);
    report('home title (mixed): Latin run wrapped in <bdi dir=ltr>',
        m.home.bdi.some(b => b.tag === 'BDI' && b.dir === 'ltr' && b.text.includes('Photoshop')), JSON.stringify(m.home.bdi));
    report('home title: copy byte-identical after isolation', m.home.copy === m.expectedCopy.home, JSON.stringify(m.home.copy));

    // ── (3) Expanded description (BUG #3) + collapsed "...more" (BUG #2) ──────
    report('expanded description: dir=rtl', m.desc.dir === 'rtl', `dir=${m.desc.dir}`);
    report('expanded description: carries prose class', m.desc.cls === true);
    report('expanded description: computed font is Vazirmatn', m.desc.usesVazir === true && /vazirmatn/i.test(m.desc.font), m.desc.font);
    report('expanded description (mixed): React isolated in <bdi dir=ltr>',
        m.desc.bdi.some(b => b.tag === 'BDI' && b.dir === 'ltr' && b.text === 'React'), JSON.stringify(m.desc.bdi));
    report('expanded description (mixed): Next.js isolated in <bdi dir=ltr>',
        m.desc.bdi.some(b => b.tag === 'BDI' && b.dir === 'ltr' && /Next\.js/.test(b.text)), JSON.stringify(m.desc.bdi));
    report('expanded description: copy byte-identical after isolation', m.desc.copy === m.expectedCopy.desc, JSON.stringify(m.desc.copy));
    report('More-fix (bug #2): flipped description reserves inline-start room (>=20px)',
        m.desc.padInlineStart >= 20, `padding-inline-start=${m.desc.padInlineStart}px`);
    report('"...more" button: stays LTR (no dir flip)', m.more.dir == null || m.more.dir !== 'rtl', `dir=${m.more.dir}`);
    report('"...more" button: no prose class', m.more.cls === false);
    report('"...more" button: computed direction not rtl', m.more.direction !== 'rtl', m.more.direction);
    report('"...more" button: never font-overridden to Vazirmatn', m.more.usesVazir === false);
    report('"...more" button: no <bdi> wrappers inside (glyphs untouched)', m.more.bdiInside === 0, String(m.more.bdiInside));

    // ── (4) Search-suggestion row (BUG #5) ───────────────────────────────────
    report('search suggestion: dir=rtl', m.search.dir === 'rtl', `dir=${m.search.dir}`);
    report('search suggestion: carries prose class', m.search.cls === true);
    report('search suggestion: computed font is Vazirmatn', m.search.usesVazir === true && /vazirmatn/i.test(m.search.font), m.search.font);

    // ── (6) Layout wrappers NEVER go RTL (whole page stays LTR) ───────────────
    Object.entries(m.wrappers).forEach(([name, w]) => {
        report(`layout wrapper untouched: ${name} has NO dir`, !w.missing && w.dir == null, w.missing ? 'missing' : `dir=${w.dir}`);
        report(`layout wrapper untouched: ${name} has NO prose class`, !w.missing && w.cls === false, w.missing ? 'missing' : `cls=${w.cls}`);
    });

    // ── English-only title untouched (no over-flip) ──────────────────────────
    report('english title: no dir', m.control.english.dir == null, `dir=${m.control.english.dir}`);
    report('english title: no prose class', m.control.english.cls === false);
    report('english title: not font-overridden to Vazirmatn', m.control.english.usesVazir === false);
    report('english title: no <bdi> wrappers', m.control.english.bdiInside === 0, String(m.control.english.bdiInside));
    report('english title: copy byte-identical', m.control.english.copy === m.expectedCopy.english, JSON.stringify(m.control.english.copy));

    // ── Chrome / icons / captions untouched by the prose path ────────────────
    report('chrome button: no dir flip', m.control.button.dir == null || m.control.button.dir !== 'rtl', `dir=${m.control.button.dir}`);
    report('chrome button: no prose class', m.control.button.cls === false);
    report('chrome button: not font-overridden to Vazirmatn', m.control.button.usesVazir === false);
    report('chrome button: no <bdi> wrappers (glyph/label untouched)', m.control.button.bdiInside === 0, String(m.control.button.bdiInside));
    report('yt-icon: no dir flip', m.control.icon.dir == null || m.control.icon.dir !== 'rtl', `dir=${m.control.icon.dir}`);
    report('yt-icon: no prose class', m.control.icon.cls === false);
    report('yt-icon: icon font not overridden', m.control.icon.usesVazir === false);
    report('yt-icon: no <bdi> wrappers (icon glyph untouched)', m.control.icon.bdiInside === 0, String(m.control.icon.bdiInside));
    report('caption segment: NOT given the prose class (caption path separate)', m.control.captionSegment.proseClass === false);

    process.exitCode = failures === 0 ? 0 : 1;
    console.log(failures === 0 ? 'YOUTUBE PROSE E2E PASS' : `${failures} YOUTUBE PROSE E2E FAILURE(S)`);
} catch (error) {
    console.error('YOUTUBE PROSE E2E ERROR:', error.message);
    process.exitCode = 1;
} finally {
    chromium?.kill();
}
