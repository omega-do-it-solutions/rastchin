'use strict';
// Behavioral suite for the tabbed side panel (src/ui/side-panel/side-panel.js).
// Run: `node test/side-panel.test.js` (or `pnpm test`). Exits non-zero on failure.
// Loads the REAL shared registry + changelog data + panel script into one vm
// sandbox and drives it through a mock DOM/chrome:
//   - active-tab detection via tabs.query and re-detection on onActivated
//   - current-site toggle storage semantics (platform key, global-gate reopen,
//     extensionEnabled fallback on unsupported sites)
//   - Persian-digit metrics, settings switches, whats-new render + current pill,
//   - tab strip aria state, footer support link.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REGISTRY_PATH = path.join(__dirname, '..', 'src', 'ui', 'shared', 'platform-registry.js');
const CHANGELOG_PATH = path.join(__dirname, '..', 'src', 'ui', 'shared', 'changelog-data.js');
const PANEL_PATH = path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'side-panel.js');

const registrySource = fs.readFileSync(REGISTRY_PATH, 'utf8');
const changelogSource = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const panelSource = fs.readFileSync(PANEL_PATH, 'utf8');

// Use the REAL manifest version so release bumps keep the is-current logic
// exercised against the actual release state (newest changelog entry).
const MANIFEST_VERSION = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')
).version;

// ---------------------------------------------------------------------------
// DOM mock
// ---------------------------------------------------------------------------
class ClassList {
    constructor(owner) {
        this.owner = owner;
        this.items = new Set();
    }
    add(...classes) { classes.filter(Boolean).forEach(c => this.items.add(c)); this.sync(); }
    remove(...classes) { classes.forEach(c => this.items.delete(c)); this.sync(); }
    toggle(name, force) {
        const present = force === undefined ? !this.items.has(name) : Boolean(force);
        if (present) this.items.add(name); else this.items.delete(name);
        this.sync();
        return present;
    }
    contains(name) { return this.items.has(name); }
    sync() { this.owner._className = Array.from(this.items).join(' '); }
}

class MockElement {
    constructor(tag, id) {
        this.tagName = String(tag || 'div').toUpperCase();
        this.nodeType = 1;
        this.id = id || '';
        this.children = [];
        this.parentElement = null;
        this.attrs = new Map();
        this.dataset = {};
        this.classList = new ClassList(this);
        this._className = '';
        this.textContent = '';
        this.value = '';
        this.checked = false;
        // Minimal inline-style bag so the caption preview pill's font-size/color
        // updates are observable (syncCaptionControls writes pill.style.*).
        this.style = {};
        this.listeners = {};
    }
    // Direct `el.className = '...'` assignments must stay in sync with classList
    // (the panel sets base classes via className and toggles state via classList).
    get className() { return this._className; }
    set className(value) {
        this._className = String(value);
        this.classList.items = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    removeAttribute(name) { this.attrs.delete(name); }
    addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); }
    fire(type, event) { (this.listeners[type] || []).forEach(handler => handler(event || { target: this })); }
    appendChild(node) {
        if (node && node.isFragment) {
            node.children.forEach(child => this.appendChild(child));
            node.children.length = 0;
            return node;
        }
        node.parentElement = this;
        this.children.push(node);
        return node;
    }
    replaceChildren(node) {
        this.children = [];
        if (node) this.appendChild(node);
    }
    focus() {}
    walk(visit) {
        this.children.forEach(child => {
            if (child instanceof MockElement) {
                visit(child);
                child.walk(visit);
            }
        });
    }
    matchesSimple(part) {
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        const m = part.match(/^input\[name="([^"]+)"\]:checked$/);
        if (m) return this.tagName === 'INPUT' && this.attrs.get('name') === m[1] && this.checked === true;
        return this.tagName === part.toUpperCase();
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const out = [];
        this.walk(node => { if (node.matchesSimple(selector.trim())) out.push(node); });
        return out;
    }
}

class MockFragment {
    constructor() {
        this.isFragment = true;
        this.children = [];
    }
    appendChild(node) {
        if (node && node.isFragment) {
            this.children.push(...node.children);
            node.children.length = 0;
        } else {
            this.children.push(node);
        }
        return node;
    }
}

const elements = new Map();
function element(id, tag) {
    if (!elements.has(id)) elements.set(id, new MockElement(tag || 'div', id));
    return elements.get(id);
}

// The site toggle and tab buttons exist in static HTML. The feedback tab/view was
// removed in v1.1.34 — only three tabs remain.
element('siteToggle', 'input');
['main', 'settings', 'whats-new'].forEach(id => {
    element(`tab-${id}`, 'button');
    element(`view-${id}`, 'section');
});

const documentMock = {
    readyState: 'complete',
    addEventListener() {},
    getElementById: id => element(id),
    createElement: tag => new MockElement(tag),
    createDocumentFragment: () => new MockFragment(),
    querySelectorAll(selector) {
        const out = [];
        elements.forEach(root => {
            if (root.matchesSimple(selector.trim())) out.push(root);
            root.walk(node => { if (node.matchesSimple(selector.trim())) out.push(node); });
        });
        return out;
    }
};

// ---------------------------------------------------------------------------
// chrome mock
// ---------------------------------------------------------------------------
const stored = { claudeEnabled: false };
const writes = [];
const createdTabs = [];
const storageChangeListeners = [];
const tabActivatedListeners = [];
const tabUpdatedListeners = [];
const focusListeners = [];
let activeTab = { id: 1, url: 'https://claude.ai/chat/abc', active: true };
let activePlatformInfo = { type: 'rastchin:platform-info', storageKey: 'claudeEnabled', hostname: 'claude.ai' };
let lastQueryOptions = null;
// Detection is async in the real panel; deferQuery lets the suite freeze the
// in-flight state to assert the pre-detection gate, and failNextQuery
// simulates one transient tabs.query error.
let deferQuery = true;
let failNextQuery = false;
const pendingQueryCallbacks = [];
function flushPendingQueries() {
    const due = pendingQueryCallbacks.splice(0);
    due.forEach(callback => callback(activeTab === null ? [] : [activeTab]));
}
// Captured timers (the panel schedules 450ms detection retries). fireDelayed(ms)
// runs only matching timers —
// stale-seq retries are internally no-ops, so firing all 450s is safe.
const timers = [];
function fireDelayed(ms) {
    const due = [];
    for (let i = timers.length - 1; i >= 0; i -= 1) {
        if (timers[i].ms === ms) due.push(...timers.splice(i, 1));
    }
    due.reverse().forEach(timer => timer.fn());
}

function setActiveTab(id, url, platformInfo) {
    activeTab = id === null ? null : { id, url, active: true };
    activePlatformInfo = platformInfo || null;
}

const chromeMock = {
    runtime: {
        lastError: null,
        getManifest: () => ({ version: MANIFEST_VERSION }),
        getURL: p => `chrome-extension://test/${p}`
    },
    tabs: {
        query: (opts, callback) => {
            lastQueryOptions = opts;
            if (deferQuery) {
                pendingQueryCallbacks.push(callback);
                return;
            }
            if (failNextQuery) {
                failNextQuery = false;
                chromeMock.runtime.lastError = { message: 'Tabs cannot be queried right now.' };
                callback(undefined);
                chromeMock.runtime.lastError = null;
                return;
            }
            callback(activeTab === null ? [] : [activeTab]);
        },
        sendMessage: (_tabId, message, callback) => {
            if (message?.type !== 'rastchin:get-platform' || !activePlatformInfo) {
                chromeMock.runtime.lastError = { message: 'Could not establish connection.' };
                callback(undefined);
                chromeMock.runtime.lastError = null;
                return;
            }
            callback(activePlatformInfo);
        },
        create: opts => createdTabs.push(opts),
        onActivated: { addListener: fn => tabActivatedListeners.push(fn) },
        onUpdated: { addListener: fn => tabUpdatedListeners.push(fn) }
    },
    windows: {
        // The panel resolves its own window once and scopes queries/events to
        // it; id 1 matches every existing fixture's windowId.
        getCurrent: callback => callback({ id: 1 }),
        onFocusChanged: { addListener: fn => focusListeners.push(fn) }
    },
    storage: {
        sync: {
            get: (keys, callback) => callback(
                Object.fromEntries(Object.entries(stored).filter(([key]) => keys.includes(key)))
            ),
            set: changes => { writes.push(changes); Object.assign(stored, changes); }
        },
        onChanged: { addListener: fn => storageChangeListeners.push(fn) }
    }
};

const windowMock = {};
const ctx = {
    window: windowMock,
    document: documentMock,
    chrome: chromeMock,
    URL,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    console
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(registrySource, ctx);
vm.runInContext(changelogSource, ctx);
vm.runInContext(panelSource, ctx);

// ---------------------------------------------------------------------------
let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

function triggerActivation(tabId = activeTab?.id || 1) {
    tabActivatedListeners.forEach(fn => fn({ tabId, windowId: 1 }));
}

function primaryUrlForPlatform(platform) {
    const rule = String(platform.hosts?.[0] || '').replace(/^\*\./, 'team.');
    const [domain, ...pathParts] = rule.split('/');
    const path = pathParts.length ? `/${pathParts.join('/')}/test` : '/';
    return `https://${domain}${path}`;
}

// --- detection gate: while the active tab is unresolved the toggle is inert ----
// (init ran with the query deferred, so detection is genuinely in flight here.)
check('pre-detect: site card shows the checking placeholder', element('siteName').textContent, 'در حال بررسی…');
check('pre-detect: toggle disabled until detection resolves', element('siteToggle').disabled, true);
check('pre-detect: aria-label says identifying', element('siteToggle').getAttribute('aria-label'), 'در حال شناسایی سایت فعلی');
element('siteToggle').checked = true;
element('siteToggle').fire('change', { target: element('siteToggle') });
check('pre-detect: a change while undetected writes NOTHING', writes.length, 0);
element('siteToggle').checked = false;
deferQuery = false;
flushPendingQueries();
check('post-detect: toggle re-enabled', element('siteToggle').disabled, false);

// --- registry sanity ---------------------------------------------------------
check('registry: 22 platforms', windowMock.RASTCHIN_PLATFORMS.length, 22);
check('registry: Meta AI is present', windowMock.RASTCHIN_PLATFORMS.some(platform => platform.id === 'metaAi'), true);
check('registry: Linear is present', windowMock.RASTCHIN_PLATFORMS.some(platform => platform.id === 'linear'), true);
check('registry: github.com/copilot belongs to GitHub',
    windowMock.rastchinMatchPlatformFromUrl('https://github.com/copilot/chat')?.id, 'github');
check('registry: repository pages match GitHub',
    windowMock.rastchinMatchPlatformFromUrl('https://github.com/anthropics/claude-code')?.id, 'github');
check('registry: Visual Studio Marketplace item pages match',
    windowMock.rastchinMatchPlatformFromUrl('https://marketplace.visualstudio.com/items?itemName=OmegaDoITSolutions.rastchin-vscode')?.id,
    'vsMarketplace');
check('registry: notion.site suffix matches',
    windowMock.rastchinMatchPlatformFromUrl('https://acme.notion.site/page')?.id, 'notion');
check('registry: current Notion app host matches',
    windowMock.rastchinMatchPlatformFromUrl('https://app.notion.com/p/page')?.id, 'notion');
check('registry: google translate host matches',
    windowMock.rastchinMatchPlatformFromUrl('https://translate.google.com/?sl=fa&tl=en')?.id, 'googleTranslate');
check('registry: Meta AI host matches',
    windowMock.rastchinMatchPlatformFromUrl('https://www.meta.ai/')?.id, 'metaAi');
check('registry: Linear issue routes match',
    windowMock.rastchinMatchPlatformFromUrl('https://linear.app/acme/issue/RC-22/example')?.id, 'linear');
check('registry: foo.claude.ai does NOT match claude',
    windowMock.rastchinMatchPlatformFromUrl('https://foo.claude.ai/chat'), null);
check('registry: music.youtube.com does NOT match youtube',
    windowMock.rastchinMatchPlatformFromUrl('https://music.youtube.com/watch?v=x'), null);
check('registry: api.notion.so does NOT match notion',
    windowMock.rastchinMatchPlatformFromUrl('https://api.notion.so/v1'), null);
check('changelog: newest entry matches the manifest version (ordering guard)',
    windowMock.RASTCHIN_CHANGELOG[0].version, MANIFEST_VERSION);

// --- initial tab state is normalized by init() itself ------------------------
check('init: main tab selected', element('tab-main').getAttribute('aria-selected'), 'true');
check('init: settings tab unselected + out of tab order', element('tab-settings').getAttribute('tabindex'), '-1');
check('init: settings view hidden', element('view-settings').getAttribute('hidden'), '');
check('init: main view visible', element('view-main').getAttribute('hidden'), null);
check('init: active tab query scoped to the panel window', lastQueryOptions, { active: true, windowId: 1 });

// --- initial render (active tab = claude, claudeEnabled=false) ---------------
check('init: site name resolves to Claude', element('siteName').textContent, 'Claude');
check('init: toggle off (platform disabled)', element('siteToggle').checked, false);
check('init: total metric in Persian digits', element('totalPlatformCount').textContent, '۲۲');
check('init: active metric counts 21 of 22', element('activePlatformCount').textContent, '۲۱');
check('init: version badge from manifest', element('panelVersion').textContent, `v${MANIFEST_VERSION}`);
check('init: platform grid rendered', element('platformGrid').children.length, 22);
{
    const chips = documentMock.querySelectorAll('.platform-chip');
    const current = chips.filter(chip => chip.classList.contains('is-current'));
    check('init: exactly one current chip', current.length, 1);
    check('init: current chip is claude', current[0]?.dataset.platform, 'claude');
}

// --- all supported platforms resolve in the side panel ------------------------
// The field failure was broad: after an extension reload, existing content
// scripts can be orphaned, and without a readable tab.url the panel painted
// «این سایت پشتیبانی نمی‌شود» on supported sites. Guard both supported paths for
// every platform: content-script response with hidden URL, and URL fallback with
// no content-script receiver.
{
    windowMock.RASTCHIN_PLATFORMS.forEach((platform, index) => {
        const tabId = 100 + index;
        setActiveTab(tabId, undefined, {
            type: 'rastchin:platform-info',
            storageKey: platform.storageKey,
            hostname: new URL(primaryUrlForPlatform(platform)).hostname
        });
        triggerActivation(tabId);
        check(`supported response: ${platform.id} resolves current-site name`, element('siteName').textContent, platform.name);
        {
            const current = documentMock.querySelectorAll('.platform-chip')
                .filter(chip => chip.classList.contains('is-current'));
            check(`supported response: ${platform.id} highlights exactly one chip`, current.length, 1);
            check(`supported response: ${platform.id} highlights its chip`, current[0]?.dataset.platform, platform.id);
        }
    });

    windowMock.RASTCHIN_PLATFORMS.forEach((platform, index) => {
        const tabId = 200 + index;
        setActiveTab(tabId, primaryUrlForPlatform(platform), null);
        triggerActivation(tabId);
        check(`supported URL fallback: ${platform.id} resolves current-site name`, element('siteName').textContent, platform.name);
        {
            const current = documentMock.querySelectorAll('.platform-chip')
                .filter(chip => chip.classList.contains('is-current'));
            check(`supported URL fallback: ${platform.id} highlights exactly one chip`, current.length, 1);
            check(`supported URL fallback: ${platform.id} highlights its chip`, current[0]?.dataset.platform, platform.id);
        }
    });

    setActiveTab(1, 'https://claude.ai/chat/abc', { type: 'rastchin:platform-info', storageKey: 'claudeEnabled', hostname: 'claude.ai' });
    triggerActivation(1);
    check('supported sweep: restores Claude as current site', element('siteName').textContent, 'Claude');
}

// --- toggle ON: platform key written, global gate reopened --------------------
// The global gate flips off externally (e.g. from another extension surface); the panel
// learns about it through storage.onChanged like every other surface.
stored.extensionEnabled = false;
storageChangeListeners.forEach(fn => fn({ extensionEnabled: { newValue: false } }, 'sync'));
check('global gate off: zero active metric', element('activePlatformCount').textContent, '۰');
// an ENABLED platform must still read off while the gate is closed
setActiveTab(9, 'https://www.youtube.com/watch?v=g', { type: 'rastchin:platform-info', storageKey: 'youtubeEnabled', hostname: 'www.youtube.com' });
tabActivatedListeners.forEach(fn => fn({ tabId: 9, windowId: 1 }));
check('global gate off: enabled platform still shows off', element('siteToggle').checked, false);
check('global gate off: toggle announces global semantics on unmatched later', element('siteToggle').getAttribute('aria-label'), 'فعال‌سازی راست‌چین برای YouTube');
setActiveTab(1, 'https://claude.ai/chat/abc', { type: 'rastchin:platform-info', storageKey: 'claudeEnabled', hostname: 'claude.ai' });
tabActivatedListeners.forEach(fn => fn({ tabId: 1, windowId: 1 }));
element('siteToggle').checked = true;
element('siteToggle').fire('change', { target: element('siteToggle') });
{
    const lastWrite = writes[writes.length - 1];
    check('toggle on: writes platform key', lastWrite.claudeEnabled, true);
    check('toggle on: reopens legacy global gate', lastWrite.extensionEnabled, true);
}

// --- re-detection on tab switch ------------------------------------------------
setActiveTab(2, 'https://www.youtube.com/watch?v=x', { type: 'rastchin:platform-info', storageKey: 'youtubeEnabled', hostname: 'www.youtube.com' });
tabActivatedListeners.forEach(fn => fn({ tabId: 2, windowId: 1 }));
check('tab switch: site name follows active tab', element('siteName').textContent, 'YouTube');
check('tab switch: toggle reflects youtube state', element('siteToggle').checked, true);
setActiveTab(10, 'https://translate.google.com/?sl=fa&tl=en', { type: 'rastchin:platform-info', storageKey: 'googleTranslateEnabled', hostname: 'translate.google.com' });
tabActivatedListeners.forEach(fn => fn({ tabId: 10, windowId: 1 }));
check('tab switch: site name follows google translate tab', element('siteName').textContent, 'Google Translate');

// --- refresh gate: later tab switches are inert until the new tab resolves ------
{
    const beforeWrites = writes.length;
    deferQuery = true;
    setActiveTab(8, 'https://gemini.google.com/app', { type: 'rastchin:platform-info', storageKey: 'geminiEnabled', hostname: 'gemini.google.com' });
    tabActivatedListeners.forEach(fn => fn({ tabId: 8, windowId: 1 }));
    check('refresh gate: site card returns to checking while query is in flight',
        element('siteName').textContent, 'در حال بررسی…');
    check('refresh gate: toggle disabled during later detection', element('siteToggle').disabled, true);
    element('siteToggle').checked = false;
    element('siteToggle').fire('change', { target: element('siteToggle') });
    check('refresh gate: click during later detection writes nothing', writes.length, beforeWrites);
    deferQuery = false;
    flushPendingQueries();
    check('refresh gate: resolved tab paints normally', element('siteName').textContent, 'Gemini');
}

// --- hidden URL still resolves through the supported tab's content script -------
setActiveTab(3, undefined, { type: 'rastchin:platform-info', storageKey: 'claudeEnabled', hostname: 'claude.ai' });
tabActivatedListeners.forEach(fn => fn({ tabId: 3, windowId: 1 }));
check('hidden URL: site name resolves from content script', element('siteName').textContent, 'Claude');
element('siteToggle').checked = false;
element('siteToggle').fire('change', { target: element('siteToggle') });
check('hidden URL: toggle writes platform key, not global', writes[writes.length - 1].claudeEnabled, false);
stored.claudeEnabled = true;
storageChangeListeners.forEach(fn => fn({ claudeEnabled: { newValue: true } }, 'sync'));

// --- unsupported site falls back to the global key -----------------------------
setActiveTab(4, undefined, null); // no readable URL and no content script
tabActivatedListeners.forEach(fn => fn({ tabId: 4, windowId: 1 }));
check('unsupported hidden site: stays gated before retry', element('siteName').textContent, 'در حال بررسی…');
check('unsupported hidden site: toggle disabled before retry', element('siteToggle').disabled, true);
{
    const beforeWrites = writes.length;
    element('siteToggle').checked = false;
    element('siteToggle').fire('change', { target: element('siteToggle') });
    check('unsupported hidden site: pre-retry click writes nothing', writes.length, beforeWrites);
}
fireDelayed(450);
check('unsupported site: fallback label after retry', element('siteName').textContent, 'این سایت پشتیبانی نمی‌شود');
check('unsupported site: toggle aria-label switches to global wording',
    element('siteToggle').getAttribute('aria-label'), 'روشن/خاموش کردن سراسری افزونه راست‌چین');
element('siteToggle').checked = false;
element('siteToggle').fire('change', { target: element('siteToggle') });
check('unsupported site: toggle writes global key', writes[writes.length - 1].extensionEnabled, false);
stored.extensionEnabled = true;
element('siteToggle').checked = true;
element('siteToggle').fire('change', { target: element('siteToggle') });

// Readable but unsupported URLs (for example Chrome Web Store, which Chromium
// blocks from content-script injection) must stay unsupported, not bind to one
// of the 22 platform toggles.
setActiveTab(5, 'https://chromewebstore.google.com/detail/rastchin/example', null);
triggerActivation(5);
check('unsupported readable site: Chrome Web Store remains unsupported', element('siteName').textContent, 'این سایت پشتیبانی نمی‌شود');
check('unsupported readable site: no current platform chip',
    documentMock.querySelectorAll('.platform-chip').filter(chip => chip.classList.contains('is-current')).length, 0);

// --- settings tab ----------------------------------------------------------------
{
    const rows = element('settingsList').querySelectorAll('input');
    check('settings: 22 switches rendered', rows.length, 22);
    const gmail = rows.find(input => input.dataset.storageKey === 'gmailEnabled');
    check('settings: gmail switch defaults on', gmail.checked, true);
    gmail.checked = false;
    gmail.fire('change');
    check('settings: gmail write payload', writes[writes.length - 1].gmailEnabled, false);
    check('settings: active metric drops after disable', element('activePlatformCount').textContent, '۲۱');
    // The storage echo of our own write must NOT rebuild the list (that would
    // destroy the focused input mid-interaction).
    storageChangeListeners.forEach(fn => fn({ gmailEnabled: { newValue: false } }, 'sync'));
    const rowsAfterEcho = element('settingsList').querySelectorAll('input');
    check('settings: self-echo keeps the same input nodes', rowsAfterEcho.find(i => i.dataset.storageKey === 'gmailEnabled') === gmail, true);
    // ...but a genuinely external change syncs the existing input in place.
    stored.gmailEnabled = true;
    storageChangeListeners.forEach(fn => fn({ gmailEnabled: { newValue: true } }, 'sync'));
    check('settings: external change syncs checked in place', gmail.checked, true);
    gmail.checked = false;
    gmail.fire('change'); // restore disabled state for the sections below
}

// --- external storage change re-renders -------------------------------------------
storageChangeListeners.forEach(fn => fn({ youtubeEnabled: { newValue: false } }, 'sync'));
check('storage sync: active metric reflects external change', element('activePlatformCount').textContent, '۲۰');

// --- whats-new tab -----------------------------------------------------------------
{
    const cards = element('timeline').children;
    check('whats-new: all releases rendered', cards.length, windowMock.RASTCHIN_CHANGELOG.length);
    check('whats-new: newest card flagged current', cards[0].classList.contains('is-current'), true);
    check('whats-new: older card not current', cards[1].classList.contains('is-current'), false);
}

// --- tab strip ----------------------------------------------------------------------
element('tab-settings').fire('click');
check('tabs: settings selected', element('tab-settings').getAttribute('aria-selected'), 'true');
check('tabs: main unselected', element('tab-main').getAttribute('aria-selected'), 'false');
check('tabs: main view hidden', element('view-main').getAttribute('hidden'), '');
check('tabs: settings view visible', element('view-settings').getAttribute('hidden'), null);

// version badge jumps to the whats-new tab (in-panel, not a new page)
element('panelVersion').fire('click');
check('version badge: selects whats-new tab', element('tab-whats-new').getAttribute('aria-selected'), 'true');
check('version badge: opens no external tab', createdTabs.length, 0);

// --- footer external actions ---------------------------------------------------------
// The promotional CTA opens the RastChin listing in Visual Studio Marketplace.
element('vscodePageLink').fire('click');
check('VS Code CTA: opens the Visual Studio Marketplace listing via tabs.create',
    createdTabs[createdTabs.length - 1]?.url,
    'https://marketplace.visualstudio.com/items?itemName=OmegaDoITSolutions.rastchin-vscode');

// The rating CTA opens the review tab on the exact Chrome Web Store listing.
element('chromeStoreReviewLink').fire('click');
check('Chrome Store CTA: opens the listing review route via tabs.create',
    createdTabs[createdTabs.length - 1]?.url,
    'https://chromewebstore.google.com/detail/rastchin-%D8%B1%D8%A7%D8%B3%D8%AA%E2%80%8C%DA%86%DB%8C%D9%86-persian/aginnihonhjafmecnbnkjokkaglknagd/reviews');

// The «بازخورد و پشتیبانی» footer link opens the first-party feedback page.
element('panelSupportLink').fire('click');
check('support link: opens the sourced feedback page via tabs.create',
    createdTabs[createdTabs.length - 1]?.url, 'https://rastchin.tools/feedback/?source=extension');

// --- in-panel YouTube caption settings (v1.1.33) -------------------------------------
// The «تنظیمات کامل» / «صفحهٔ تازه‌ها» buttons are gone — navigation is the tab strip
// and caption size/colour now live in the settings tab. The panel opens no page.
{
    // Default (no stored caption keys) → medium size + yellow pressed, and the
    // preview pill mirrors that (18px / yellow), driven by syncCaptionControls.
    check('caption: medium size pressed by default', element('capSizeMedium').getAttribute('aria-pressed'), 'true');
    check('caption: small not pressed by default', element('capSizeSmall').getAttribute('aria-pressed'), 'false');
    check('caption: yellow pressed by default', element('capColorYellow').getAttribute('aria-pressed'), 'true');
    check('caption: white not pressed by default', element('capColorWhite').getAttribute('aria-pressed'), 'false');
    check('caption: preview pill defaults to 18px (medium)', element('capPreviewPill').style.fontSize, '18px');
    check('caption: preview pill defaults to yellow', element('capPreviewPill').style.color, '#ffd400');

    // The large button is gone — CAPTION_SIZE_BUTTONS holds only small + medium, so a
    // stray #capSizeLarge node is never wired and a click on it writes nothing.
    {
        const before = writes.length;
        element('capSizeLarge').fire('click');
        check('caption: removed large button is not wired (no storage write)', writes.length, before);
    }

    // Click «کوچک» → persists 100, flips pressed state, and shrinks the preview pill.
    element('capSizeSmall').fire('click');
    check('caption: small click persists size 100', writes[writes.length - 1].youtubeCaptionFontSize, 100);
    check('caption: small now pressed', element('capSizeSmall').getAttribute('aria-pressed'), 'true');
    check('caption: medium no longer pressed', element('capSizeMedium').getAttribute('aria-pressed'), 'false');
    check('caption: preview pill font-size tracks small (15px)', element('capPreviewPill').style.fontSize, '15px');

    // Click «سفید» → persists #ffffff and recolours the preview pill.
    element('capColorWhite').fire('click');
    check('caption: white click persists colour', writes[writes.length - 1].youtubeCaptionColor, '#ffffff');
    check('caption: white now pressed', element('capColorWhite').getAttribute('aria-pressed'), 'true');
    check('caption: yellow no longer pressed', element('capColorYellow').getAttribute('aria-pressed'), 'false');
    check('caption: preview pill colour tracks white', element('capPreviewPill').style.color, '#ffffff');

    // An external change syncs the panel buttons.
    storageChangeListeners.forEach(fn => fn({
        youtubeCaptionFontSize: { newValue: 120 },
        youtubeCaptionColor: { newValue: '#ffd400' }
    }, 'sync'));
    check('caption: external size change selects medium', element('capSizeMedium').getAttribute('aria-pressed'), 'true');
    check('caption: external colour change selects yellow', element('capColorYellow').getAttribute('aria-pressed'), 'true');

    // The removed large size (130) and any legacy out-of-band size snap to medium.
    storageChangeListeners.forEach(fn => fn({ youtubeCaptionFontSize: { newValue: 130 } }, 'sync'));
    check('caption: removed 130 snaps to the medium button', element('capSizeMedium').getAttribute('aria-pressed'), 'true');
    storageChangeListeners.forEach(fn => fn({ youtubeCaptionFontSize: { newValue: 160 } }, 'sync'));
    check('caption: legacy 160 snaps to the medium button', element('capSizeMedium').getAttribute('aria-pressed'), 'true');
    check('caption: legacy 160 preview matches runtime medium px (18px)', element('capPreviewPill').style.fontSize, '18px');
    storageChangeListeners.forEach(fn => fn({ youtubeCaptionFontSize: { newValue: 105 } }, 'sync'));
    check('caption: 105 snaps to the small button', element('capSizeSmall').getAttribute('aria-pressed'), 'true');
    // Equidistant tie-point (110) snaps to small, matching the runtime tie-break.
    storageChangeListeners.forEach(fn => fn({ youtubeCaptionFontSize: { newValue: 110 } }, 'sync'));
    check('caption: 110 (equidistant) snaps to the small button', element('capSizeSmall').getAttribute('aria-pressed'), 'true');

    // The panel owns these controls directly; no separate settings page is needed.
}

// --- onUpdated filters: inactive tabs ignored, active URL changes followed ---
{
    const before = element('siteName').textContent;
    setActiveTab(7, 'https://gemini.google.com/app', { type: 'rastchin:platform-info', storageKey: 'geminiEnabled', hostname: 'gemini.google.com' });
    tabUpdatedListeners.forEach(fn => fn(7, { status: 'complete' }, { active: false }));
    check('onUpdated: inactive tab change ignored', element('siteName').textContent, before);
    tabUpdatedListeners.forEach(fn => fn(7, { url: 'https://gemini.google.com/app' }, { active: true }));
    check('onUpdated: active navigation refreshes the card', element('siteName').textContent, 'Gemini');
}

// --- empty tabs.query result (e.g. focus parked on an undocked devtools) -------
{
    const before = element('siteName').textContent;
    setActiveTab(null, null, null);
    focusListeners.forEach(fn => fn(-1));
    check('empty query: holds the last-known site instead of flashing unsupported',
        element('siteName').textContent, before);
    setActiveTab(1, 'https://claude.ai/chat/abc', { type: 'rastchin:platform-info', storageKey: 'claudeEnabled', hostname: 'claude.ai' });
    tabActivatedListeners.forEach(fn => fn({ tabId: 1, windowId: 1 }));
}

// --- content script missing but URL readable: URL rescue + one retry -----------
// The 0315f71 field scenario: extension reloaded => content script orphaned =>
// sendMessage has no receiver. tab.url (host access via content_scripts
// matches) must still resolve Claude, the toggle must write claudeEnabled,
// and ONE retry must upgrade to the content-script answer once it exists.
{
    setActiveTab(11, 'https://claude.ai/chat/zzz', null); // no receiver
    tabActivatedListeners.forEach(fn => fn({ tabId: 11, windowId: 1 }));
    check('rescue: URL fallback resolves Claude without the content script',
        element('siteName').textContent, 'Claude');
    element('siteToggle').checked = false;
    element('siteToggle').fire('change', { target: element('siteToggle') });
    check('rescue: toggle writes claudeEnabled, not the global key',
        writes[writes.length - 1].claudeEnabled, false);
    check('rescue: global key untouched by the toggle',
        'extensionEnabled' in writes[writes.length - 1], false);
    stored.claudeEnabled = true;
    storageChangeListeners.forEach(fn => fn({ claudeEnabled: { newValue: true } }, 'sync'));
    // the content script "injects" before the retry fires
    setActiveTab(11, 'https://claude.ai/chat/zzz', { type: 'rastchin:platform-info', storageKey: 'claudeEnabled', hostname: 'claude.ai' });
    fireDelayed(450);
    check('rescue: retry upgrades to the content-script answer',
        element('siteName').textContent, 'Claude');
}

// --- transient tabs.query failure: card survives and one retry recovers --------
{
    setActiveTab(12, 'https://www.youtube.com/watch?v=y', { type: 'rastchin:platform-info', storageKey: 'youtubeEnabled', hostname: 'www.youtube.com' });
    failNextQuery = true;
    tabActivatedListeners.forEach(fn => fn({ tabId: 12, windowId: 1 }));
    check('query error: card is gated until retry', element('siteName').textContent, 'در حال بررسی…');
    check('query error: toggle disabled until retry', element('siteToggle').disabled, true);
    fireDelayed(450);
    check('query error: scheduled retry recovers detection', element('siteName').textContent, 'YouTube');
}

// --- per-window scoping: events from other windows are ignored ------------------
{
    setActiveTab(13, 'https://gemini.google.com/app', { type: 'rastchin:platform-info', storageKey: 'geminiEnabled', hostname: 'gemini.google.com' });
    tabActivatedListeners.forEach(fn => fn({ tabId: 13, windowId: 99 }));
    check('other window: activation ignored', element('siteName').textContent, 'YouTube');
    tabUpdatedListeners.forEach(fn => fn(13, { status: 'complete' }, { active: true, windowId: 99 }));
    check('other window: onUpdated ignored', element('siteName').textContent, 'YouTube');
    tabActivatedListeners.forEach(fn => fn({ tabId: 13, windowId: 1 }));
    check('own window: activation refreshes', element('siteName').textContent, 'Gemini');
}

// --- RTL keyboard navigation on the tab strip ---------------------------------
{
    const noop = () => {};
    element('tab-main').fire('click');
    element('tab-main').fire('keydown', { key: 'ArrowLeft', preventDefault: noop });
    check('keyboard: ArrowLeft advances (RTL)', element('tab-settings').getAttribute('aria-selected'), 'true');
    element('tab-settings').fire('keydown', { key: 'ArrowRight', preventDefault: noop });
    check('keyboard: ArrowRight goes back (RTL)', element('tab-main').getAttribute('aria-selected'), 'true');
    element('tab-main').fire('keydown', { key: 'End', preventDefault: noop });
    check('keyboard: End jumps to last tab (whats-new)', element('tab-whats-new').getAttribute('aria-selected'), 'true');
    element('tab-whats-new').fire('keydown', { key: 'Home', preventDefault: noop });
    check('keyboard: Home jumps to first tab', element('tab-main').getAttribute('aria-selected'), 'true');
}

// --- HTML/JS id drift guard ------------------------------------------------------
{
    const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'side-panel.html'), 'utf8');
    const htmlIds = new Set([...htmlSource.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const jsIds = [...panelSource.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
    ['main', 'settings', 'whats-new'].forEach(id => jsIds.push(`tab-${id}`, `view-${id}`));
    new Set(jsIds).forEach(id => check(`html declares #${id}`, htmlIds.has(id), true));

    // v1.1.34: the in-panel feedback tab + composer are gone; only a footer link
    // to GitHub remains. No feedback tab/view/form survives in markup,
    // and the panel JS no longer carries any feedback wiring.
    check('side-panel HTML dropped the feedback tab', htmlIds.has('tab-feedback'), false);
    check('side-panel HTML dropped the feedback view', htmlIds.has('view-feedback'), false);
    check('side-panel HTML dropped the feedback request form', htmlIds.has('requestType'), false);
    check('side-panel HTML dropped the feedback status node', htmlIds.has('feedbackStatus'), false);
    check('side-panel HTML has no feedback radio inputs', /name="reqType"/.test(htmlSource), false);
    check('side-panel HTML has the support link', htmlIds.has('panelSupportLink'), true);
    check('side-panel HTML link target text is بازخورد و پشتیبانی', /بازخورد و پشتیبانی/.test(htmlSource), true);
    check('side-panel HTML has the VS Code product CTA', htmlIds.has('vscodePageLink'), true);
    check('side-panel HTML places the VS Code CTA above support',
        htmlSource.indexOf('id="vscodePageLink"') < htmlSource.indexOf('id="panelSupportLink"'), true);
    check('side-panel HTML has the Chrome Store review CTA', htmlIds.has('chromeStoreReviewLink'), true);
    check('side-panel HTML places the review CTA between VS Code and support',
        htmlSource.indexOf('id="vscodePageLink"') < htmlSource.indexOf('id="chromeStoreReviewLink"')
        && htmlSource.indexOf('id="chromeStoreReviewLink"') < htmlSource.indexOf('id="panelSupportLink"'), true);
    check('side-panel JS dropped the feedback composer wiring', /wireFeedback|copyFeedback|emailFeedback|REQUEST_TYPES/.test(panelSource), false);
    check('side-panel JS carries the sourced first-party feedback URL',
        panelSource.includes('https://rastchin.tools/feedback/?source=extension'), true);
    check('side-panel JS carries the exact VS Code Marketplace URL',
        panelSource.includes('https://marketplace.visualstudio.com/items?itemName=OmegaDoITSolutions.rastchin-vscode'), true);
    check('side-panel JS carries the exact Chrome Store review URL',
        panelSource.includes('aginnihonhjafmecnbnkjokkaglknagd/reviews'), true);
    // v1.1.33: the large caption-size button is removed from the markup, the JS
    // button list, and the «بزرگ» label — only small + medium remain.
    check('side-panel HTML dropped #capSizeLarge', htmlIds.has('capSizeLarge'), false);
    check('side-panel HTML has no «بزرگ» size label', /بزرگ/.test(htmlSource), false);
    check('side-panel JS dropped the capSizeLarge wiring', /capSizeLarge/.test(panelSource), false);
    check('side-panel keeps both remaining size buttons', htmlIds.has('capSizeSmall') && htmlIds.has('capSizeMedium'), true);

    // v1.1.34: size + colour are TWO matching segmented controls on one compact row,
    // icon-only (A glyph / colour dot) with Persian aria-labels (no long text labels).
    check('caption: size + colour share the cap-seg segmented style', (htmlSource.match(/class="cap-seg"/g) || []).length, 2);
    check('caption: controls sit in one compact row', /class="cap-controls"/.test(htmlSource), true);
    check('caption: old separate cap-size/cap-color wrappers are gone', /class="cap-size"|class="cap-color"/.test(htmlSource), false);
    check('caption: size buttons carry Persian aria-labels',
        /id="capSizeSmall"[^>]*aria-label="اندازه کوچک"/.test(htmlSource) && /id="capSizeMedium"[^>]*aria-label="اندازه متوسط"/.test(htmlSource), true);
    check('caption: colour buttons carry Persian aria-labels',
        /id="capColorYellow"[^>]*aria-label="رنگ زرد"/.test(htmlSource) && /id="capColorWhite"[^>]*aria-label="رنگ سفید"/.test(htmlSource), true);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
