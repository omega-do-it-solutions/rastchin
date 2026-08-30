#!/usr/bin/env node
// QA: browser-measured proof of Claude TABLE behavior under the real built
// extension — direction vote, visual column order, Vazirmatn font, and nested
// td > div BiDi isolation. Injects a replica of claude.ai's live table markup
// (captured 2026-06-12 from a real conversation: table.min-w-full inside
// div.overflow-x-auto inside div.standard-markdown inside .font-claude-response)
// into a real claude.ai tab in Chromium with unpacked/ loaded, then measures
// computed styles and glyph geometry. No package dependencies. NOT part of
// `pnpm test` (needs local Chromium + network); run manually from this app:
//
//   pnpm run build:unpacked && node scripts/qa-claude-table-e2e.mjs
//
// NOTE: branded Google Chrome >= 137 silently ignores --load-extension; point
// CHROMIUM_BIN at a Chromium build (default: /Applications/Chromium.app).

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNPACKED = path.join(ROOT, 'unpacked');
const CHROMIUM = process.env.CHROMIUM_BIN || '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PORT = 9252;
const PROFILE = '/tmp/rastchin-table-e2e-profile';

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

// Replica of the LIVE claude.ai response DOM (real classes, real cell text).
// Three tables:
//   #qa-real   — captured table (Persian headers, mixed CRM/POS/GDPR cells)
//   #qa-compare — Menew-style comparison table (Latin headers, «ویژگی» label
//                 column, ✓/× and Latin data cells, Persian section row)
//   #qa-nested — td > div > text variant of the mixed cells
// A fourth table, #qa-rescue, is intentionally OUTSIDE all known Claude message
// selectors. It proves the table-root rescue path catches Persian static tables
// when Claude renames the response wrapper again.
const TD = 'border-b-0.5 py-2 pr-4 align-top';
const TH = 'text-text-100 border-b-0.5 py-2 pr-4 align-top font-bold';
const REPLICA = `
<div id="rastchin-qa-replica" data-test-render-count="1" dir="ltr" style="position:absolute; top:0; left:0; width:900px; background:#fff; z-index:99999;">
 <div><div class="font-claude-response relative leading-[1.65rem]">
  <div class="standard-markdown grid-cols-1 grid gap-3">
   <div class="overflow-x-auto w-full px-2 mb-6">
    <table id="qa-real" class="min-w-full border-collapse text-sm leading-[1.7] whitespace-normal">
     <thead class="text-left"><tr>
      <th scope="col" class="${TH}">قابلیت</th><th scope="col" class="${TH}">توضیح</th>
     </tr></thead>
     <tbody>
      <tr><td class="${TD}">باشگاه مشتریان / CRM</td><td class="${TD}">مدیریت اطلاعات و وفاداری مشتریان</td></tr>
      <tr><td class="${TD}">اتصال به POS / کاسه</td><td class="${TD}">یکپارچه‌سازی با سیستم صندوق فروشگاهی</td></tr>
      <tr><td class="${TD}">DSGVO / GDPR کامپلاینس</td><td class="${TD}">رعایت قوانین حفاظت از داده اتحادیه اروپا</td></tr>
      <tr><td class="${TD}">مستندات</td><td class="${TD}"><a href="https://example.com/docs">https://example.com/docs</a></td></tr>
     </tbody>
    </table>
   </div>
   <div class="overflow-x-auto w-full px-2 mb-6">
    <table id="qa-compare" class="min-w-full border-collapse text-sm leading-[1.7] whitespace-normal">
     <thead class="text-left"><tr>
      <th scope="col" class="${TH}">ویژگی</th>
      <th scope="col" class="${TH}">Menew.ir</th>
      <th scope="col" class="${TH}">Menulogy.at</th>
      <th scope="col" class="${TH}">Menuvia</th>
     </tr></thead>
     <tbody>
      <tr><td class="${TD}">منوی دیجیتال QR</td><td class="${TD}">✓</td><td class="${TD}">✓</td><td class="${TD}">✓</td></tr>
      <tr><td class="${TD}">سفارش آنلاین</td><td class="${TD}">✓</td><td class="${TD}">×</td><td class="${TD}">✓</td></tr>
      <tr><td class="${TD}" colspan="4">امکانات پیشرفته</td></tr>
      <tr><td class="${TD}">پیشنهاد ویژه</td><td class="${TD}">×</td><td class="${TD}">Happy Hour</td><td class="${TD}">×</td></tr>
      <tr><td class="${TD}">قیمت پایه</td><td class="${TD}">€9</td><td class="${TD}">€19</td><td class="${TD}">€0</td></tr>
     </tbody>
    </table>
   </div>
   <div class="overflow-x-auto w-full px-2 mb-6">
    <table id="qa-nested" class="min-w-full border-collapse text-sm leading-[1.7] whitespace-normal">
     <tbody>
      <tr><td class="${TD}"><div>باشگاه مشتریان / CRM</div></td><td class="${TD}"><div>اتصال به POS / کاسه</div></td></tr>
     </tbody>
    </table>
   </div>
  </div>
 </div></div>
</div>`;
const RESCUE_REPLICA = `
<div id="rastchin-qa-rescue" style="position:absolute; top:720px; left:0; width:900px; background:#fff; z-index:99999;">
 <table id="qa-rescue" class="min-w-full border-collapse text-sm leading-[1.7] whitespace-normal">
  <thead class="text-left"><tr>
   <th scope="col" class="${TH}">ویژگی</th>
   <th scope="col" class="${TH}">Menew.ir</th>
   <th scope="col" class="${TH}">Menulogy.at</th>
  </tr></thead>
  <tbody>
   <tr><td class="${TD}">باشگاه مشتریان / CRM</td><td class="${TD}">✓</td><td class="${TD}">×</td></tr>
  </tbody>
 </table>
</div>`;

const MEASURE = `(async () => {
    const rectsOf = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
    const real = document.getElementById('qa-real');
    const compare = document.getElementById('qa-compare');
    const nested = document.getElementById('qa-nested');
    const rescue = document.getElementById('qa-rescue');
    if (!real || !compare || !nested || !rescue) return { error: 'replica tables missing' };
    const persianTd = real.querySelector('tbody td');           // «باشگاه مشتریان / CRM»
    const compareThs = [...compare.querySelectorAll('thead th')];
    const nestedDiv = nested.querySelector('td div');
    const rescueTd = rescue.querySelector('tbody td');
    const bdiInfo = root => [...root.querySelectorAll('[data-rastchin-bidi]')].map(b => ({
        tag: b.tagName, dir: b.getAttribute('dir'), text: b.textContent }));
    // visual glyph geometry inside the CRM cell: where does CRM sit vs باشگاه?
    const glyphOrder = cell => {
        const range = document.createRange();
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const rects = [];
        let node; while ((node = walker.nextNode())) {
            const value = node.textContent;
            for (const token of ['باشگاه', 'CRM']) {
                const at = value.indexOf(token);
                if (at < 0) continue;
                range.setStart(node, at); range.setEnd(node, at + token.length);
                const r = range.getBoundingClientRect();
                rects.push({ token, left: Math.round(r.left) });
            }
        }
        return rects;
    };
    return {
        cssInjected: [...document.querySelectorAll('style')].some(s => s.textContent.includes('rastchin-claude-rtl-table')),
        vazirLoaded: await document.fonts.load('16px Vazirmatn', 'م').then(fs => fs.length > 0).catch(() => false),
        real: {
            dir: real.getAttribute('dir'), cls: real.className.includes('rastchin-claude-rtl-table'),
            tdFont: getComputedStyle(persianTd).fontFamily.split(',')[0],
            tdInlineFont: persianTd.style.getPropertyValue('font-family'),
            tdDirection: getComputedStyle(persianTd).direction,
            bdi: bdiInfo(real),
            crmGlyphs: glyphOrder(persianTd)
        },
        compare: {
            dir: compare.getAttribute('dir'), cls: compare.className.includes('rastchin-claude-rtl-table'),
            direction: getComputedStyle(compare).direction,
            theadAlign: getComputedStyle(compare.querySelector('th')).textAlign,
            thOrder: compareThs.map(th => ({ text: th.textContent.trim(), left: rectsOf(th)[0] }))
        },
        nested: {
            tdDir: nested.querySelector('td').getAttribute('dir'),
            divHasBdi: Boolean(nestedDiv && nestedDiv.querySelector('[data-rastchin-bidi]')),
            bdi: bdiInfo(nested),
            copy: nested.querySelector('td').textContent
        },
        rescue: {
            dir: rescue.getAttribute('dir'),
            cls: rescue.className.includes('rastchin-claude-rtl-table'),
            tdFont: getComputedStyle(rescueTd).fontFamily.split(',')[0],
            tdInlineFont: rescueTd.style.getPropertyValue('font-family'),
            tdDirection: getComputedStyle(rescueTd).direction,
            inKnownMessageScope: Boolean(rescue.closest('.font-claude-message,.font-claude-response,[data-test-render-count],[role="article"]')),
            thOrder: [...rescue.querySelectorAll('thead th')].map(th => ({ text: th.textContent.trim(), left: rectsOf(th)[0] })),
            bdi: bdiInfo(rescue)
        }
    };
})()`;

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
        'https://claude.ai/'
    ], { stdio: 'ignore' });

    await sleep(8000);

    const targets = await cdpTargets();
    const swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('src/background/service-worker.js'));
    report('extension service worker running', Boolean(swTarget), swTarget?.url || 'not found');
    if (!swTarget) throw new Error('service worker target missing');

    const claudeTarget = targets.find(t => t.type === 'page' && t.url.startsWith('https://claude.ai'));
    if (!claudeTarget) throw new Error('claude.ai tab missing');
    await sendToTarget(claudeTarget, 'Page.bringToFront');

    // Wait for the recipe to be enabled before injecting fixtures. The style is
    // created inside runPlatformRecipe.enable(), after storage has resolved and
    // the MutationObserver is live; injecting earlier makes this QA flaky.
    let recipeReady = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        recipeReady = await evalInTarget(claudeTarget,
            `[...document.querySelectorAll('style')].some(s => s.textContent.includes('rastchin-claude-rtl-table'))`);
        if (recipeReady) break;
        await sleep(500);
    }
    if (!recipeReady) throw new Error('Claude table recipe CSS did not become ready before fixture injection');

    // inject the replica, then poll until the walk has reached it (a busy
    // login page can defer the engine's scan well past a fixed sleep) before
    // measuring — the settle gate alone adds ~300ms after the injection burst.
    await evalInTarget(claudeTarget, `
        document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(REPLICA)});
        document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(RESCUE_REPLICA)});
        'injected'`);
    for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(1500);
        const processed = await evalInTarget(claudeTarget,
            `Boolean(document.getElementById('qa-real')?.getAttribute('dir')) &&
             Boolean(document.querySelector('#qa-nested td div [data-rastchin-bidi]')) &&
             Boolean(document.getElementById('qa-rescue')?.getAttribute('dir'))`);
        if (processed) break;
    }
    const m = await evalInTarget(claudeTarget, MEASURE);
    if (!m || m.error) throw new Error(`measurement failed: ${m && m.error}`);

    console.log('\n--- raw measurements ---');
    console.log(JSON.stringify(m, null, 1));
    console.log('--- assertions ---');

    report('recipe CSS injected (table rules present)', m.cssInjected === true);
    report('Vazirmatn @font-face loads', m.vazirLoaded === true);

    // 1. captured real table (Persian majority): managed RTL + Vazirmatn + bdi
    report('real table: dir=rtl', m.real.dir === 'rtl', `dir=${m.real.dir}`);
    report('real table: managed class', m.real.cls === true);
    report('real table: td computed font uses Claude table Vazirmatn alias',
        /RastChinClaudeVazirmatn/i.test(m.real.tdFont), m.real.tdFont);
    report('real table: CRM wrapped in <bdi dir=ltr>', m.real.bdi.some(b => b.tag === 'BDI' && b.dir === 'ltr' && b.text === 'CRM'),
        JSON.stringify(m.real.bdi));
    const crm = Object.fromEntries(m.real.crmGlyphs.map(g => [g.token, g.left]));
    report('real table: visual order باشگاه >> CRM (RTL reads right-to-left)',
        Number.isFinite(crm['باشگاه']) && Number.isFinite(crm.CRM) && crm['باشگاه'] > crm.CRM,
        JSON.stringify(m.real.crmGlyphs));

    // 2. Menew-style comparison table: Persian label column must force RTL
    report('comparison table: dir=rtl despite ✓/×/Latin majority', m.compare.dir === 'rtl', `dir=${m.compare.dir}`);
    report('comparison table: managed class', m.compare.cls === true);
    report('comparison table: thead text-left overridden to right', m.compare.theadAlign === 'right', m.compare.theadAlign);
    const byText = Object.fromEntries(m.compare.thOrder.map(th => [th.text, th.left]));
    report('comparison table: «ویژگی» column is RIGHTMOST',
        Number.isFinite(byText['ویژگی']) && m.compare.thOrder.every(th => byText['ویژگی'] >= th.left),
        JSON.stringify(m.compare.thOrder));
    report('comparison table: Menew.ir right of Menulogy.at (columns flow RTL)',
        Number.isFinite(byText['Menew.ir']) && Number.isFinite(byText['Menulogy.at']) && byText['Menew.ir'] > byText['Menulogy.at']);

    // 3. nested td > div: the div's text must still get <bdi> isolation
    report('nested td>div: td dir=rtl', m.nested.tdDir === 'rtl', `dir=${m.nested.tdDir}`);
    report('nested td>div: <bdi> created INSIDE the div', m.nested.divHasBdi === true, JSON.stringify(m.nested.bdi));
    report('nested td>div: copy byte-identical', m.nested.copy === 'باشگاه مشتریان / CRM', JSON.stringify(m.nested.copy));

    // 4. rescue path: table root outside known message wrappers still processed
    report('rescue table: outside known message scope', m.rescue.inKnownMessageScope === false);
    report('rescue table: direct table candidate gets dir=rtl', m.rescue.dir === 'rtl', `dir=${m.rescue.dir}`);
    report('rescue table: managed class', m.rescue.cls === true);
    report('rescue table: no inline font-inject override', m.rescue.tdInlineFont === '', m.rescue.tdInlineFont);
    report('rescue table: td computed font uses Claude table Vazirmatn alias',
        /RastChinClaudeVazirmatn/i.test(m.rescue.tdFont), m.rescue.tdFont);
    const rescueByText = Object.fromEntries(m.rescue.thOrder.map(th => [th.text, th.left]));
    report('rescue table: «ویژگی» column is RIGHTMOST',
        Number.isFinite(rescueByText['ویژگی']) && m.rescue.thOrder.every(th => rescueByText['ویژگی'] >= th.left),
        JSON.stringify(m.rescue.thOrder));
    report('rescue table: Menew.ir right of Menulogy.at (columns flow RTL)',
        Number.isFinite(rescueByText['Menew.ir']) &&
        Number.isFinite(rescueByText['Menulogy.at']) &&
        rescueByText['Menew.ir'] > rescueByText['Menulogy.at']);
    report('rescue table: CRM wrapped by table-root candidate',
        m.rescue.bdi.some(b => b.tag === 'BDI' && b.dir === 'ltr' && b.text === 'CRM'),
        JSON.stringify(m.rescue.bdi));

    process.exitCode = failures === 0 ? 0 : 1;
    console.log(failures === 0 ? 'TABLE E2E PASS' : `${failures} TABLE E2E FAILURE(S)`);
} catch (error) {
    console.error('TABLE E2E ERROR:', error.message);
    process.exitCode = 1;
} finally {
    chromium?.kill();
}
