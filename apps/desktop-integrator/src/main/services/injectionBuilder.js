'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getTarget } = require('../targets/registry');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const INJECTED_ROOT = path.join(PROJECT_ROOT, 'src', 'injected');
const ASSET_ROOT = path.join(PROJECT_ROOT, 'assets');
const CORE_FILES = [
    'core/bidi-isolate.js',
    'core/rtl-engine.js',
    'core/recipe-runner.js',
    'core/font-inject.js',
    'core/auto-direction.js'
];

function readUtf8(relativePath) {
    return fs.readFileSync(path.join(INJECTED_ROOT, relativePath), 'utf8');
}

function fontDataUrl(filename) {
    const bytes = fs.readFileSync(path.join(ASSET_ROOT, 'fonts', filename));
    return `data:font/woff2;base64,${bytes.toString('base64')}`;
}

function adapterFile(targetId) {
    if (targetId === 'chatgpt') return 'platforms/chatgpt-rtl.js';
    if (targetId === 'claude') return 'platforms/claude-rtl.js';
    throw new Error(`Unknown injection target: ${targetId}`);
}

function adapterFiles(targetId) {
    if (targetId === 'chatgpt') {
        return [
            adapterFile(targetId),
            'platforms/codex-question-card-rtl.js'
        ];
    }
    return [adapterFile(targetId)];
}

function buildInjection(targetId, options = {}) {
    const target = getTarget(targetId);
    if (!target) throw new Error(`Unknown target: ${targetId}`);
    const version = String(options.version || '0.1.0');
    const leaseTimeoutMs = Number.isFinite(options.leaseTimeoutMs)
        ? Math.max(50, Math.round(options.leaseTimeoutMs))
        : 12000;
    const leaseCheckIntervalMs = Number.isFinite(options.leaseCheckIntervalMs)
        ? Math.max(25, Math.min(Math.round(options.leaseCheckIntervalMs), leaseTimeoutMs))
        : 2000;
    const regularFont = fontDataUrl('Vazirmatn-Regular.woff2');
    const boldFont = fontDataUrl('Vazirmatn-Bold.woff2');
    const source = [
        ...CORE_FILES,
        'platforms/desktop-fallback-rtl.js',
        ...adapterFiles(targetId)
    ].map(readUtf8).join('\n\n');

    return `
(function (__rastchinChrome) {
    'use strict';
    try { window.__RASTCHIN_DESKTOP__?.disable?.(); } catch (_) {}

    const __rastchinHandles = [];
    window.__RASTCHIN_DESKTOP_HOST__ = ${JSON.stringify(target.runtimeHost)};
    window.__RASTCHIN_DESKTOP_FONT_URL__ = ${JSON.stringify(regularFont)};
    window.__RASTCHIN_DESKTOP_FONT_BOLD_URL__ = ${JSON.stringify(boldFont)};
    window.__RASTCHIN_DESKTOP_REGISTER__ = handle => {
        if (handle && typeof handle.disable === 'function') __rastchinHandles.push(handle);
    };

    const chrome = __rastchinChrome;
    ${source}

    let __rastchinLeaseDeadline = Date.now() + ${JSON.stringify(leaseTimeoutMs)};
    let __rastchinLeaseTimer = null;
    const controller = {
        version: ${JSON.stringify(version)},
        targetId: ${JSON.stringify(targetId)},
        host: ${JSON.stringify(target.runtimeHost)},
        appliedAt: new Date().toISOString(),
        renewLease() {
            __rastchinLeaseDeadline = Date.now() + ${JSON.stringify(leaseTimeoutMs)};
            return true;
        },
        disable() {
            if (__rastchinLeaseTimer !== null) clearInterval(__rastchinLeaseTimer);
            __rastchinLeaseTimer = null;
            for (const handle of __rastchinHandles.slice().reverse()) {
                try { handle.disable(); } catch (_) {}
                try { handle.unsubscribe?.(); } catch (_) {}
                try { handle.removeDebugOverlay?.(); } catch (_) {}
            }
            __rastchinHandles.length = 0;
            delete window.__RASTCHIN_DESKTOP_REGISTER__;
            delete window.__RASTCHIN_DESKTOP_FONT_URL__;
            delete window.__RASTCHIN_DESKTOP_FONT_BOLD_URL__;
            delete window.__RASTCHIN_DESKTOP_HOST__;
            if (window.__RASTCHIN_DESKTOP__ === controller) delete window.__RASTCHIN_DESKTOP__;
            return true;
        }
    };
    window.__RASTCHIN_DESKTOP__ = controller;
    __rastchinLeaseTimer = setInterval(() => {
        if (Date.now() > __rastchinLeaseDeadline) controller.disable();
    }, ${JSON.stringify(leaseCheckIntervalMs)});
    return {
        applied: true,
        targetId: controller.targetId,
        version: controller.version,
        handles: __rastchinHandles.length
    };
})({ runtime: { getURL: function () { return ${JSON.stringify(regularFont)}; } } });
`;
}

function buildCleanupExpression() {
    return `(() => {
        const active = window.__RASTCHIN_DESKTOP__;
        if (!active || typeof active.disable !== 'function') return { removed: false };
        const targetId = active.targetId || null;
        active.disable();
        return { removed: true, targetId };
    })()`;
}

function buildCompatibilityProbe(targetId) {
    const target = getTarget(targetId);
    if (!target) throw new Error(`Unknown target: ${targetId}`);
    return `(() => {
        const selectors = ${JSON.stringify(target.signatureSelectors)};
        const matches = {};
        let exactTotal = 0;
        for (const selector of selectors) {
            try {
                const count = document.querySelectorAll(selector).length;
                matches[selector] = count;
                exactTotal += count;
            } catch (_) {
                matches[selector] = -1;
            }
        }
        const desktopSelectors = {
            roots: '#root, #app, main, [role="main"]',
            editors: 'textarea, input[type="text"], [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
            prose: 'main p, main li, [role="main"] p, [role="main"] li, article p, article li',
            dialogs: '[role="dialog"], [aria-modal="true"]'
        };
        const desktop = {};
        for (const [key, selector] of Object.entries(desktopSelectors)) {
            try { desktop[key] = document.querySelectorAll(selector).length; }
            catch (_) { desktop[key] = -1; }
        }
        // The fallback must still look like a conversation: a generic settings
        // page often has a root, input, or dialog, but not prose plus a composer.
        const desktopShell = desktop.roots > 0 && desktop.editors > 0 && desktop.prose > 0;
        return {
            compatible: exactTotal > 0 || desktopShell,
            mode: exactTotal > 0 ? 'exact' : (desktopShell ? 'desktop-shell' : 'none'),
            total: exactTotal,
            exactTotal,
            matches,
            desktop,
            bodyChildren: document.body?.childElementCount || 0,
            readyState: document.readyState,
            existingInjection: window.__RASTCHIN_DESKTOP__?.targetId || null
        };
    })()`;
}

module.exports = {
    CORE_FILES,
    adapterFile,
    adapterFiles,
    buildCleanupExpression,
    buildCompatibilityProbe,
    buildInjection,
    fontDataUrl
};
