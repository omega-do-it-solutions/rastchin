'use strict';
// Regression suite for src/background/service-worker.js. Run:
// `node test/service-worker.test.js` (or `pnpm test`). Exits non-zero on failure.
// Covers: welcome page on fresh install (not update), side-panel toolbar-click
// opt-in where chrome.sidePanel exists, and graceful no-op where it does not
// (for example, Chromium forks that load the manifest but omit the API fall
// back to action.default_popup).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'background', 'service-worker.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

function makeChrome({ withSidePanel, panelBehaviorImpl } = {}) {
    const calls = {
        installedListeners: [],
        createdTabs: [],
        panelBehaviors: [],
        warnings: []
    };
    const chrome = {
        runtime: {
            onInstalled: {
                addListener(fn) { calls.installedListeners.push(fn); }
            },
            getURL: p => `chrome-extension://test/${p}`
        },
        tabs: {
            create(opts) { calls.createdTabs.push(opts); }
        }
    };
    if (withSidePanel) {
        chrome.sidePanel = {
            setPanelBehavior(behavior) {
                calls.panelBehaviors.push(behavior);
                return panelBehaviorImpl
                    ? panelBehaviorImpl(behavior)
                    : Promise.resolve();
            }
        };
    }
    return { chrome, calls };
}

function loadWorker(chromeMock) {
    const ctx = {
        chrome: chromeMock,
        console: {
            warn: (...args) => { loadWorker.lastWarn = args; },
            log() {},
            error() {}
        }
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return ctx;
}

// --- sidePanel available: opts into toolbar-click behavior ------------------
{
    const { chrome, calls } = makeChrome({ withSidePanel: true });
    loadWorker(chrome);
    check('sidePanel: behavior set exactly once', calls.panelBehaviors.length, 1);
    check('sidePanel: openPanelOnActionClick=true', calls.panelBehaviors[0], { openPanelOnActionClick: true });
}

// --- sidePanel missing: no throw, popup fallback untouched -------------------
{
    const { chrome, calls } = makeChrome({ withSidePanel: false });
    let threw = false;
    try {
        loadWorker(chrome);
    } catch (_) {
        threw = true;
    }
    check('no sidePanel: worker loads without throwing', threw, false);
    check('no sidePanel: nothing else invoked at load', calls.createdTabs.length, 0);
}

// --- setPanelBehavior rejection is swallowed (never an unhandled rejection) --
{
    const { chrome } = makeChrome({
        withSidePanel: true,
        panelBehaviorImpl: () => Promise.reject(new Error('not supported here'))
    });
    let threw = false;
    try {
        loadWorker(chrome);
    } catch (_) {
        threw = true;
    }
    check('rejection: worker load never throws', threw, false);
}

// --- install flow unchanged: welcome opens on install, not on update ---------
{
    const { chrome, calls } = makeChrome({ withSidePanel: true });
    loadWorker(chrome);
    check('install: one onInstalled listener registered', calls.installedListeners.length, 1);

    calls.installedListeners[0]({ reason: 'install' });
    check('install: welcome tab opened', calls.createdTabs.length, 1);
    check('install: welcome URL', calls.createdTabs[0].url, 'chrome-extension://test/src/ui/welcome/welcome.html');

    calls.installedListeners[0]({ reason: 'update' });
    check('update: no extra tab opened', calls.createdTabs.length, 1);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
