'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const rendererRoot = path.join(__dirname, '..', 'src', 'renderer');

function fixtureStatus() {
    return {
        version: '0.1.0', buildChannel: 'development', platform: 'freebsd', runtimeEnabled: false,
        supportedPlatform: false, diagnostics: [], targets: [
            {
                id: 'chatgpt', name: 'ChatGPT / Codex', vendor: 'OpenAI', detected: true,
                running: false, compatibility: 'needs-probe', runtime: null,
                installations: [{ version: '1.0.0', source: 'msix', executable: 'C:\\Apps\\ChatGPT.exe' }]
            },
            {
                id: 'claude', name: 'Claude Desktop', vendor: 'Anthropic', detected: false,
                running: false, compatibility: 'host-blocked', runtimeAvailability: 'host-blocked',
                blockedReason: 'نسخه‌های فعلی Claude Desktop اتصال امن موردنیاز برای اعمال راست‌چین را مسدود می‌کنند. پشتیبانی در نسخه‌های آینده اضافه خواهد شد.',
                runtime: null, installations: []
            }
        ]
    };
}

test('manager UI renders target status without enabling release injection', async () => {
    const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(rendererRoot, 'app.js'), 'utf8');
    const dom = new JSDOM(html, { url: 'file:///app/index.html', runScripts: 'outside-only' });
    const status = fixtureStatus();
    dom.window.rastchin = {
        getStatus: async () => status,
        scan: async () => status,
        enable: async () => { throw new Error('disabled'); },
        disable: async () => null,
        openLink: async () => null,
        onStatus: () => () => {}
    };
    dom.window.eval(source);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dom.window.document.querySelectorAll('.app-card').length, 2);
    assert.equal(dom.window.document.documentElement.lang, 'fa');
    assert.equal(dom.window.document.documentElement.dir, 'rtl');
    assert.match(dom.window.document.body.textContent, /یکپارچه‌ساز دسکتاپ/);
    assert.match(dom.window.document.body.textContent, /ChatGPT \/ Codex/);
    assert.match(dom.window.document.body.textContent, /Claude Desktop/);
    const chatgptIcon = dom.window.document.querySelector('[data-target="chatgpt"] .app-icon');
    const claudeIcon = dom.window.document.querySelector('[data-target="claude"] .app-icon');
    assert.match(chatgptIcon.getAttribute('src'), /assets\/targets\/chatgpt\.png$/);
    assert.match(claudeIcon.getAttribute('src'), /assets\/targets\/claude\.png$/);
    assert.equal(dom.window.document.querySelectorAll('.app-glyph').length, 0);
    assert.equal(dom.window.document.querySelector('[data-target="chatgpt"] .app-copy').dir, 'ltr');
    assert.equal(dom.window.document.querySelector('[data-target="chatgpt"] .primary').disabled, true);
    assert.equal(dom.window.document.querySelector('#platform-warning').classList.contains('hidden'), false);
    assert.match(dom.window.document.querySelector('#platform-label').textContent, /دسکتاپ/);
    dom.window.close();
});

test('stable build exposes the normal enable action without preview wording', async () => {
    const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(rendererRoot, 'app.js'), 'utf8');
    const dom = new JSDOM(html, { url: 'file:///app/index.html', runScripts: 'outside-only' });
    const status = fixtureStatus();
    status.platform = 'win32';
    status.supportedPlatform = true;
    status.buildChannel = 'stable';
    status.runtimeEnabled = true;
    status.targets[0].runtimeAvailability = 'stable';
    dom.window.rastchin = {
        getStatus: async () => status, scan: async () => status,
        enable: async () => null, disable: async () => null,
        openLink: async () => null, onStatus: () => () => {}
    };
    dom.window.eval(source);
    await new Promise(resolve => setImmediate(resolve));
    const button = dom.window.document.querySelector('[data-target="chatgpt"] .primary');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'فعال‌سازی راست‌چین');
    assert.doesNotMatch(dom.window.document.body.textContent, /آزمایشی|پیش‌نمایش/);
    assert.match(dom.window.document.querySelector('.release-badge').textContent, /پایدار/);
    assert.match(dom.window.document.querySelector('#platform-label').textContent, /ویندوز/);
    dom.window.close();
});

for (const [platform, platformText, source, installText, executable] of [
    ['darwin', 'مک‌اواس', 'app-bundle', 'macOS Application', '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'],
    ['linux', 'لینوکس', 'deb', 'DEB package', '/usr/lib/chatgpt/ChatGPT']
]) {
    test(`${platform} stable build renders its platform and installation labels`, async () => {
        const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
        const sourceCode = fs.readFileSync(path.join(rendererRoot, 'app.js'), 'utf8');
        const dom = new JSDOM(html, { url: 'file:///app/index.html', runScripts: 'outside-only' });
        const status = fixtureStatus();
        status.platform = platform;
        status.supportedPlatform = true;
        status.buildChannel = 'stable';
        status.runtimeEnabled = true;
        status.targets[0].runtimeAvailability = 'stable';
        status.targets[0].installations = [{ version: '26.825', source, executable }];
        dom.window.rastchin = {
            getStatus: async () => status, scan: async () => status,
            enable: async () => null, disable: async () => null,
            openLink: async () => null, onStatus: () => () => {}
        };
        dom.window.eval(sourceCode);
        await new Promise(resolve => setImmediate(resolve));
        const card = dom.window.document.querySelector('[data-target="chatgpt"]');
        assert.match(dom.window.document.querySelector('#platform-label').textContent, new RegExp(platformText));
        assert.match(card.textContent, new RegExp(installText));
        assert.equal(card.querySelector('.primary').disabled, false);
        assert.equal(dom.window.document.querySelector('#platform-warning').classList.contains('hidden'), true);
        dom.window.close();
    });
}

test('Claude card is disabled and marked for a future desktop release', async () => {
    const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(rendererRoot, 'app.js'), 'utf8');
    const dom = new JSDOM(html, { url: 'file:///app/index.html', runScripts: 'outside-only' });
    const status = fixtureStatus();
    dom.window.rastchin = {
        getStatus: async () => status, scan: async () => status,
        enable: async () => { throw new Error('Claude must not be launched'); },
        disable: async () => null,
        openLink: async () => { throw new Error('Claude must not open a web fallback'); },
        onStatus: () => () => {}
    };
    dom.window.eval(source);
    await new Promise(resolve => setImmediate(resolve));
    const card = dom.window.document.querySelector('[data-target="claude"]');
    const button = card.querySelector('button');
    assert.equal(button.disabled, true);
    assert.equal(button.dataset.action, '');
    assert.match(button.textContent, /پشتیبانی در نسخه‌های آینده/);
    assert.match(card.textContent, /اتصال امن.*مسدود/);
    assert.doesNotMatch(card.textContent, /Claude Web|claude\.ai/i);
    dom.window.close();
});

test('manager UI exposes text-free renderer diagnostics after a failed probe', async () => {
    const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(rendererRoot, 'app.js'), 'utf8');
    const dom = new JSDOM(html, { url: 'file:///app/index.html', runScripts: 'outside-only' });
    const status = fixtureStatus();
    status.runtimeEnabled = true;
    status.supportedPlatform = true;
    status.targets[0].runtime = {
        state: 'failed', lastError: 'No renderer', rendererDiagnostics: [{
            type: 'page', url: 'file:///…/index.html', mode: 'none',
            exactMatches: 0, desktop: { roots: 1, editors: 0, prose: 0, dialogs: 0 }
        }]
    };
    dom.window.rastchin = {
        getStatus: async () => status, scan: async () => status,
        enable: async () => null, disable: async () => null,
        openLink: async () => null, onStatus: () => () => {}
    };
    dom.window.eval(source);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(dom.window.document.querySelector('.diagnostic-panel').textContent, /desktop/);
    assert.match(dom.window.document.querySelector('.diagnostic-panel').textContent, /بدون متن گفتگو/);
    dom.window.close();
});

test('renderer stylesheet bundles Vazirmatn as the primary interface font', () => {
    const stylesheet = fs.readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
    assert.match(stylesheet, /@font-face[\s\S]*Vazirmatn-Regular\.woff2/);
    assert.match(stylesheet, /@font-face[\s\S]*Vazirmatn-Bold\.woff2/);
    assert.match(stylesheet, /font-family:\s*"RastChin Vazirmatn"/);
    assert.match(stylesheet, /direction:\s*rtl/);
});

test('official target icon assets are bundled at useful resolutions', () => {
    const targetRoot = path.join(__dirname, '..', 'assets', 'targets');
    const chatgpt = fs.readFileSync(path.join(targetRoot, 'chatgpt.png'));
    const claude = fs.readFileSync(path.join(targetRoot, 'claude.png'));
    assert.equal(chatgpt.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(claude.subarray(1, 4).toString('ascii'), 'PNG');
    assert.ok(chatgpt.length > 5000);
    assert.ok(claude.length > 5000);
});
