#!/usr/bin/env node
// QA: end-to-end proof that the side panel detects Claude on a real claude.ai
// tab through the rastchin:get-platform message path — in a REAL Chromium with
// the built unpacked/ extension loaded. No package dependencies (Node 24 ships
// a WebSocket client). NOT part of `pnpm test` (needs a local Chromium + network
// access to claude.ai); run manually from this app:
//
//   pnpm run build:unpacked && node scripts/qa-side-panel-e2e.mjs
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
const PORT = 9251;
const PROFILE = '/tmp/rastchin-e2e-profile';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cdpTargets() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json`);
    return response.json();
}

async function cdpOpenTab(url) {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/new?${url}`, { method: 'PUT' });
    return response.json();
}

// Minimal CDP client over the built-in WebSocket.
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
            client.send('Runtime.evaluate', { expression, returnByValue: true }),
            10000, 'Runtime.evaluate');
        if (exceptionDetails) throw new Error(exceptionDetails.text);
        return result.value;
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

try {
    rmSync(PROFILE, { recursive: true, force: true });
    chromium = spawn(CHROMIUM, [
        `--user-data-dir=${PROFILE}`,
        '--no-first-run', '--no-default-browser-check',
        `--remote-debugging-port=${PORT}`,
        '--window-size=600,800', '--window-position=2200,1600',
        `--load-extension=${UNPACKED}`,
        'about:blank'
    ], { stdio: 'ignore' });

    await sleep(5000);

    // 1. extension service worker is running → derive the extension id
    const targets = await cdpTargets();
    const swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('src/background/service-worker.js'));
    report('extension service worker running', Boolean(swTarget), swTarget?.url || 'not found');
    // throw (not process.exit) so the finally block still kills Chromium
    if (!swTarget) throw new Error('service worker target missing');
    const extensionId = new URL(swTarget.url).hostname;

    // 2. a real claude.ai tab (login page is enough — content scripts inject on
    //    https://claude.ai/* at document_end regardless of auth state)
    await cdpOpenTab('https://claude.ai/');
    await sleep(6000);

    // 3. the panel page in the same window must resolve Claude via the
    //    rastchin:get-platform round trip (the claude tab is the active one in
    //    this window until the panel tab opens; so re-activate claude last)
    const panelTab = await cdpOpenTab(`chrome-extension://${extensionId}/src/ui/side-panel/side-panel.html`);
    await sleep(1500);
    // activate the claude tab again so it is the window's active tab
    const claudeTarget = (await cdpTargets()).find(t => t.type === 'page' && t.url.startsWith('https://claude.ai'));
    await fetch(`http://127.0.0.1:${PORT}/json/activate/${claudeTarget.id}`);
    await sleep(2500); // panel re-detects via onActivated (+ one 450ms retry)

    const panelTarget = (await cdpTargets()).find(t => t.id === panelTab.id) || panelTab;
    const snapshot = await evalInTarget(panelTarget, `JSON.stringify({
        siteName: document.getElementById('siteName')?.textContent,
        toggleDisabled: document.getElementById('siteToggle')?.disabled,
        ariaLabel: document.getElementById('siteToggle')?.getAttribute('aria-label'),
        version: document.getElementById('panelVersion')?.textContent
    })`);
    const panel = JSON.parse(snapshot);
    report('panel detects Claude on claude.ai', panel.siteName === 'Claude', `siteName=${JSON.stringify(panel.siteName)}`);
    report('toggle enabled after detection', panel.toggleDisabled === false, `disabled=${panel.toggleDisabled}`);
    report('toggle is Claude-scoped', /Claude/.test(panel.ariaLabel || ''), `aria-label=${JSON.stringify(panel.ariaLabel)}`);
    console.log(`panel version: ${panel.version}`);

    process.exitCode = failures === 0 ? 0 : 1;
    console.log(failures === 0 ? 'E2E PASS' : `${failures} E2E FAILURE(S)`);
} catch (error) {
    console.error('E2E ERROR:', error.message);
    process.exitCode = 1;
} finally {
    chromium?.kill();
}
