#!/usr/bin/env node
// QA: browser-measured proof that RastChin leaves YouTube caption mechanics native.
//
// Contract after v1.1.31:
// - YouTube owns caption windows, backgrounds, clipping, rolling, transforms and layout.
// - RastChin marks every visible `.ytp-caption-segment` node for display settings.
// - CSS on those segments changes only font-family, color and font-size; caption
//   direction and bidi behavior stay native to YouTube.
//
// Run:
//   pnpm run build:unpacked && node scripts/qa-youtube-caption-e2e.mjs
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
const PORT = 9254;
const PROFILE = '/tmp/rastchin-youtube-caption-e2e-profile';

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

const L1 = 'صندلی بهتر داشته باشیم.';
const L2 = 'آیا همه شما از این بابت راضی هستید؟';
const L3 = 'مطمئنی؟ (مطمئنی؟) آره.';
const E1 = 'Lets get a better chair.';
const E2 = 'Are you all happy with that?';
const E3 = 'Are you sure? Yes.';

const visualLine = text => `<span class="caption-visual-line" style="display:block;"><span class="ytp-caption-segment">${text}</span></span>`;
const captionsText = (a, b, c, translateY = 0) => `<span class="captions-text" style="display:block; transform:translateY(${translateY}px);">${visualLine(a)}${visualLine(b)}${visualLine(c)}</span>`;

const FIXTURES = `
<div id="rastchin-cap-qa" dir="ltr" style="position:absolute; top:0; left:0; width:900px; height:520px; background:#222; z-index:2147483647;">
  <div class="ytp-caption-window-container" style="position:absolute; inset:0;">
    <div id="rc-roll" class="caption-window" style="height:62px; overflow:hidden; left:50%; bottom:30%; transform:translateY(-20px); margin-left:-130px;">
      ${captionsText(L1, L2, L3, -20)}
    </div>
  </div>
  <div class="ytp-caption-window-container" style="position:absolute; inset:0;">
    <div id="rc-static" class="caption-window" style="left:50%; bottom:55%; overflow:visible;">
      ${captionsText(L1, L2, L3)}
    </div>
  </div>
  <div class="ytp-caption-window-container" style="position:absolute; inset:0;">
    <div id="rc-en" class="caption-window" style="height:62px; overflow:hidden; left:50%; bottom:5%; transform:translateY(-20px);">
      ${captionsText(E1, E2, E3, -20)}
    </div>
  </div>
  <div class="ytp-caption-window-container" style="position:absolute; inset:0;">
    <div id="rc-punct" class="caption-window" style="left:50%; bottom:80%; overflow:visible;">
      <span class="captions-text" style="display:block;">
        <span class="caption-visual-line" style="display:block;"><span class="ytp-caption-segment">آیا همه راضی هستند</span><span class="ytp-caption-segment">?</span></span>
      </span>
    </div>
  </div>
  <div class="ytp-caption-window-container" style="position:absolute; inset:0;">
    <div id="rc-auto-fa" class="caption-window" style="height:62px; overflow:hidden; left:50%; bottom:68%; transform:translateY(-18px); margin-left:-160px;">
      <span class="captions-text" style="display:block; transform:translateY(-16px);">
        <span class="caption-visual-line" style="display:block;">
          <span class="ytp-caption-segment"></span><span class="ytp-caption-segment">این</span><span class="ytp-caption-segment"> </span><span class="ytp-caption-segment">یک</span><span class="ytp-caption-segment"> ترجمهٔ خودکار</span>
        </span>
        <span class="caption-visual-line" style="display:block;">
          <span class="ytp-caption-segment">فارسی</span><span class="ytp-caption-segment">است</span><span class="ytp-caption-segment">؟</span>
        </span>
      </span>
    </div>
  </div>
</div>`;

const MEASURE = `(() => {
    const RTL = 'rastchin-youtube-rtl';
    const DIR_RTL = 'rastchin-youtube-caption-dir-rtl';
    const DIR_LTR = 'rastchin-youtube-caption-dir-ltr';
    const css = [...document.querySelectorAll('style')].map(s => s.textContent || '').join('\\n');
    const win = id => document.getElementById(id);
    const segOf = w => w.querySelector('.ytp-caption-segment');
    const segmentInfo = s => {
        const r = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        return {
            text: (s.textContent || '').trim(),
            marked: s.classList.contains(RTL),
            dirRtl: s.classList.contains(DIR_RTL),
            dirLtr: s.classList.contains(DIR_LTR),
            width: r.width,
            height: r.height,
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            color: cs.color,
            font: cs.fontFamily
        };
    };
    const probe = id => {
        const w = win(id); if (!w) return { exists: false };
        const s = segOf(w);
        const wcs = getComputedStyle(w);
        const scs = getComputedStyle(s);
        return {
            exists: true,
            winMarked: w.classList.contains(RTL),
            segMarked: s.classList.contains(RTL),
            segDirRtl: s.classList.contains(DIR_RTL),
            segDirLtr: s.classList.contains(DIR_LTR),
            winAttr: w.getAttribute('data-rastchin-youtube-rtl'),
            segAttr: s.getAttribute('data-rastchin-youtube-rtl'),
            heightInline: w.style.getPropertyValue('height'),
            overflowInline: w.style.getPropertyValue('overflow'),
            transformInline: w.style.getPropertyValue('transform'),
            marginLeftInline: w.style.getPropertyValue('margin-left'),
            overflow: wcs.overflow,
            font: scs.fontFamily,
            color: scs.color,
            fontSize: scs.fontSize,
            direction: scs.direction
        };
    };
    return {
        cssHasSegmentRule: /\\.ytp-caption-segment\\.rastchin-youtube-rtl\\s*\\{[^}]*font-family/.test(css),
        cssHasRtlDirRule: /\\.ytp-caption-segment\\.rastchin-youtube-caption-dir-rtl\\s*\\{/.test(css),
        cssHasLtrDirRule: /\\.ytp-caption-segment\\.rastchin-youtube-caption-dir-ltr\\s*\\{/.test(css),
        cssTouchesWindow: /\\.caption-window\\.rastchin-youtube-rtl/.test(css),
        cssHasPrehide: /\\.caption-window:not\\(\\.rastchin-youtube-seen\\)/.test(css),
        cssHasRoll: /rastchin-youtube-roll/.test(css),
        cssHasBg: /rastchin-youtube-bg-(?:ready|pending)/.test(css),
        fontVar: getComputedStyle(document.documentElement).getPropertyValue('--rastchin-youtube-caption-font-px').trim(),
        colorVar: getComputedStyle(document.documentElement).getPropertyValue('--rastchin-youtube-caption-color').trim(),
        roll: probe('rc-roll'),
        staticWin: probe('rc-static'),
        en: probe('rc-en'),
        autoFa: (() => {
            const w = win('rc-auto-fa');
            if (!w) return { exists: false };
            const segments = [...w.querySelectorAll('.ytp-caption-segment')].map(segmentInfo);
            return {
                exists: true,
                winMarked: w.classList.contains(RTL),
                heightInline: w.style.getPropertyValue('height'),
                overflowInline: w.style.getPropertyValue('overflow'),
                visiblePersian: segments.filter(s => /[؀-ۿ]/.test(s.text)),
                emptySegments: segments.filter(s => !s.text)
            };
        })(),
        // Issue 1: a Persian cue whose «?» is a SEPARATE segment — the punctuation
        // must end up the same colour/font as the words, not YouTube's white/Roboto.
        punct: (() => {
            const w = win('rc-punct');
            if (!w) return { exists: false };
            const segs = [...w.querySelectorAll('.ytp-caption-segment')];
            const word = segs.find(s => /[؀-ۿ]/.test(s.textContent || ''));
            const mark = segs.find(s => (s.textContent || '').trim() === '?');
            if (!word || !mark) return { exists: false };
            const wcs = getComputedStyle(word);
            const mcs = getComputedStyle(mark);
            return {
                exists: true,
                wordMarked: word.classList.contains(RTL),
                markMarked: mark.classList.contains(RTL),
                sameColor: wcs.color === mcs.color,
                sameFont: wcs.fontFamily === mcs.fontFamily,
                markFont: mcs.fontFamily,
                markColor: mcs.color,
                markDir: mcs.direction,
                markInlineStyle: mark.getAttribute('style')
            };
        })()
    };
})()`;

if (!existsSync(CHROMIUM)) {
    console.log('SKIP  YouTube caption E2E — Chromium not found.');
    console.log(`      Looked for: ${CHROMIUM}`);
    console.log('      Set CHROMIUM_BIN=/path/to/Chromium and re-run.');
    console.log('YOUTUBE CAPTION E2E NOT RUN (no Chromium)');
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

    let recipeReady = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        recipeReady = await evalInTarget(ytTarget,
            `[...document.querySelectorAll('style')].some(s => /\\.ytp-caption-segment\\.rastchin-youtube-rtl/.test(s.textContent || ''))`);
        if (recipeReady) break;
        await sleep(500);
    }
    if (!recipeReady) throw new Error('YouTube caption recipe CSS did not become ready before fixture injection');

    const injectResult = await evalInTarget(ytTarget, `(() => {
        const html = ${JSON.stringify(FIXTURES)};
        try {
            let payload = html;
            if (window.trustedTypes && window.trustedTypes.createPolicy) {
                const policy = window.trustedTypes.createPolicy('rastchin-cap-qa', { createHTML: s => s });
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
    report('caption fixtures injected', /inserted/.test(injectResult || ''), injectResult);

    let marked = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        marked = await evalInTarget(ytTarget,
            `!!document.querySelector('#rc-roll .ytp-caption-segment.rastchin-youtube-rtl')`);
        if (marked) break;
        await sleep(300);
    }

    const m = await evalInTarget(ytTarget, MEASURE);

    report('caption segment CSS present', m.cssHasSegmentRule === true);
    report('caption RTL direction metadata has no CSS rule', m.cssHasRtlDirRule === false);
    report('caption LTR direction metadata has no CSS rule', m.cssHasLtrDirRule === false);
    report('caption CSS does not target caption windows', m.cssTouchesWindow === false);
    report('caption CSS has no prehide gate', m.cssHasPrehide === false);
    report('caption CSS has no roll class', m.cssHasRoll === false);
    report('caption CSS has no background classes', m.cssHasBg === false);
    report('caption font-px var is set', /\d/.test(m.fontVar || ''), `--…font-px=${m.fontVar}`);
    report('caption color var is set', /^#/.test(m.colorVar || ''), `--…color=${m.colorVar}`);

    report('rolling Persian: window not marked', m.roll.winMarked === false);
    report('rolling Persian: segment marked', m.roll.segMarked === true);
    report('rolling Persian: segment has RTL direction marker', m.roll.segDirRtl === true);
    report('rolling Persian: segment uses Vazirmatn', /vazirmatn/i.test(m.roll.font), m.roll.font);
    report('rolling Persian: window native height preserved', m.roll.heightInline === '62px', m.roll.heightInline);
    report('rolling Persian: window native overflow preserved', m.roll.overflowInline === 'hidden', m.roll.overflowInline);
    report('rolling Persian: window native transform preserved', m.roll.transformInline === 'translateY(-20px)', m.roll.transformInline);
    report('rolling Persian: window native margin-left preserved', m.roll.marginLeftInline === '-130px', m.roll.marginLeftInline);

    report('static Persian: window not marked', m.staticWin.winMarked === false);
    report('static Persian: segment marked', m.staticWin.segMarked === true);
    report('static Persian: static overflow preserved', m.staticWin.overflowInline === 'visible', m.staticWin.overflowInline);

    report('english: window not marked', m.en.winMarked === false);
    report('english: segment marked for display settings', m.en.segMarked === true);
    report('english: segment has LTR direction marker', m.en.segDirLtr === true);
    report('english: segment uses caption font stack', /vazirmatn/i.test(m.en.font), m.en.font);
    report('english: segment uses caption colour', m.en.color === m.roll.color, `${m.en.color} vs ${m.roll.color}`);
    report('english: direction stays ltr', m.en.direction === 'ltr', m.en.direction);

    report('auto-translate Persian: window not marked', m.autoFa.winMarked === false);
    report('auto-translate Persian: native height preserved', m.autoFa.heightInline === '62px', m.autoFa.heightInline);
    report('auto-translate Persian: native overflow preserved', m.autoFa.overflowInline === 'hidden', m.autoFa.overflowInline);
    report('auto-translate Persian: has visible Persian segments', m.autoFa.visiblePersian.length >= 4, String(m.autoFa.visiblePersian.length));
    m.autoFa.visiblePersian.forEach((seg, index) => {
        report(`auto-translate Persian segment #${index + 1}: marked`, seg.marked === true, seg.text);
        report(`auto-translate Persian segment #${index + 1}: has RTL metadata`, seg.dirRtl === true, seg.text);
        report(`auto-translate Persian segment #${index + 1}: has nonzero rect`, seg.width > 0 && seg.height > 0, `${seg.width}×${seg.height} ${seg.text}`);
        report(`auto-translate Persian segment #${index + 1}: visible style`, seg.display !== 'none' && seg.visibility !== 'hidden' && seg.opacity !== '0', `${seg.display}/${seg.visibility}/${seg.opacity}`);
        report(`auto-translate Persian segment #${index + 1}: same colour as Persian cue`, seg.color === m.roll.color, `${seg.color} vs ${m.roll.color}`);
    });
    report('auto-translate Persian: empty segment stays unmarked', m.autoFa.emptySegments.every(seg => seg.marked === false), JSON.stringify(m.autoFa.emptySegments));

    // Issue 1: separate-«?» segment shares the Persian colour/font, no inline dir.
    report('punctuation: Persian word segment marked', m.punct.wordMarked === true);
    report('punctuation: separate «?» segment marked', m.punct.markMarked === true);
    report('punctuation: «?» uses the same font as the words', m.punct.sameFont === true, m.punct.markFont);
    report('punctuation: «?» uses the same colour as the words', m.punct.sameColor === true, m.punct.markColor);
    report('punctuation: «?» uses Vazirmatn', /vazirmatn/i.test(m.punct.markFont || ''), m.punct.markFont);
    report('punctuation: «?» got no inline style', !m.punct.markInlineStyle, m.punct.markInlineStyle || '(none)');

    // Issue 2 (v1.1.33): only two presets remain — small (100 => 15px) and medium
    // (120 => 18px, the crop-safe ceiling). The runtime snaps everything else into
    // that band, so the removed large (130) and any legacy 160 must resolve to 18px.
    // Each preset keeps a 2-line cue inside YouTube's ~52px native rolling window.
    // Drive the REAL runtime: set storage in the SW, let the content script update
    // --rastchin-youtube-caption-font-px, then measure the on-page segment.
    const CROP_CEILING_PX = 18;       // medium ceiling; 18px × 1.3 × 2 ≈ 46.8px fits ~52px
    const NATIVE_MIN_WINDOW_PX = 52;  // smallest native 2-line rolling window observed
    // [storedValue, expectedRenderedPx] — the last two prove legacy/large snap to medium.
    const SIZE_CASES = [[100, 15], [120, 18], [130, 18], [160, 18]];
    const setStoredSize = value => evalInTarget(swTarget,
        `new Promise(r => chrome.storage.sync.set({ youtubeCaptionFontSize: ${value} }, () => r(true)))`);
    const measureSegPx = () => evalInTarget(ytTarget,
        `(() => { const s = document.querySelector('#rc-static .ytp-caption-segment.rastchin-youtube-rtl'); return s ? parseFloat(getComputedStyle(s).fontSize) : null; })()`);
    for (const [size, expected] of SIZE_CASES) {
        await setStoredSize(size);
        await sleep(700);
        const px = await measureSegPx();
        const twoLine = px == null ? Infinity : px * 1.3 * 2;
        const note = size > 120 ? ` (legacy ${size} snaps to medium)` : '';
        report(`size ${size}%: segment renders ${px}px (expected ${expected})${note}`,
            px != null && Math.abs(px - expected) < 0.6, `${px}px`);
        report(`size ${size}%: at/below crop-safe ceiling ${CROP_CEILING_PX}px`,
            px != null && px <= CROP_CEILING_PX + 0.01, `${px}px`);
        report(`size ${size}%: 2-line block fits native ${NATIVE_MIN_WINDOW_PX}px window`,
            twoLine <= NATIVE_MIN_WINDOW_PX, `${twoLine.toFixed(1)}px`);
    }
    await setStoredSize(120); // restore the default

    console.log('');
    console.log(JSON.stringify({ roll: m.roll, staticWin: m.staticWin, en: m.en, punct: m.punct }, null, 2));
} catch (err) {
    failures += 1;
    console.error(`FATAL  ${err.message}`);
} finally {
    if (chromium) chromium.kill('SIGKILL');
}

console.log('');
if (failures === 0) {
    console.log('YOUTUBE CAPTION E2E: ALL PASS');
    process.exit(0);
} else {
    console.log(`YOUTUBE CAPTION E2E: ${failures} FAILURE(S)`);
    process.exit(1);
}
