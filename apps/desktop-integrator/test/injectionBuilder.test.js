'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
    buildCleanupExpression,
    buildCompatibilityProbe,
    buildInjection
} = require('../src/main/services/injectionBuilder');

function wait(ms = 450) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntil(predicate, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await wait(10);
    }
    assert.fail(`Condition was not met within ${timeoutMs}ms.`);
}

test('compatibility probe recognizes a ChatGPT conversation surface', () => {
    const dom = new JSDOM('<div data-message-author-role="assistant">hello</div>', {
        url: 'https://chatgpt.com/', runScripts: 'outside-only'
    });
    const result = dom.window.eval(buildCompatibilityProbe('chatgpt'));
    assert.equal(result.compatible, true);
    assert.ok(result.total > 0);
    assert.equal(result.mode, 'exact');
    assert.equal(result.title, undefined);
    assert.equal(result.url, undefined);
    dom.window.close();
});

test('compatibility probe recognizes a local Electron conversation shell', () => {
    const dom = new JSDOM('<div id="root"><main><p>Welcome</p><div contenteditable="true"></div></main></div>', {
        url: 'file:///C:/Program%20Files/WindowsApps/OpenAI.Codex/app/resources/app.asar/webview/index.html',
        runScripts: 'outside-only'
    });
    const result = dom.window.eval(buildCompatibilityProbe('chatgpt'));
    assert.equal(result.compatible, true);
    assert.equal(result.mode, 'desktop-shell');
    assert.equal(result.exactTotal, 0);
    assert.ok(result.desktop.roots > 0);
    dom.window.close();
});

test('compatibility probe rejects a generic local settings dialog', () => {
    const dom = new JSDOM('<div id="root"><main><div role="dialog"><input type="text"></div></main></div>', {
        url: 'file:///Applications/ChatGPT.app/Contents/Resources/app.asar/settings/index.html',
        runScripts: 'outside-only'
    });
    const result = dom.window.eval(buildCompatibilityProbe('chatgpt'));
    assert.equal(result.compatible, false);
    assert.equal(result.mode, 'none');
    dom.window.close();
});

test('desktop fallback payload applies RTL and font without web selectors', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="root"><main><section><p id="message">این یک پیام فارسی است.</p>
        <ul><li id="item">مرحله اول</li></ul></section><div contenteditable="true"></div></main></div>
    </body></html>`, {
        url: 'file:///C:/Program%20Files/WindowsApps/OpenAI.Codex/app/resources/app.asar/webview/index.html',
        runScripts: 'outside-only', pretendToBeVisual: true
    });
    const result = dom.window.eval(buildInjection('chatgpt', { version: 'test' }));
    assert.equal(result.applied, true);
    await wait();
    assert.equal(dom.window.document.querySelector('#message').getAttribute('dir'), 'rtl');
    assert.equal(dom.window.document.querySelector('#item').getAttribute('dir'), 'rtl');
    assert.match(dom.window.document.querySelector('#message').className, /rastchin-desktop-rtl/);
    assert.match(dom.window.document.head.textContent, /Vazirmatn/);
    dom.window.eval(buildCleanupExpression());
    dom.window.close();
});

test('renderer lease removes injected RTL when the controller disappears', async () => {
    const dom = new JSDOM('<div id="root"><main><p id="message">این پیام باید بازیابی شود.</p></main></div>', {
        url: 'file:///Applications/ChatGPT.app/Contents/Resources/app.asar/webview/index.html',
        runScripts: 'outside-only', pretendToBeVisual: true
    });
    let leaseClock = 1000;
    dom.window.Date.now = () => leaseClock;
    const result = dom.window.eval(buildInjection('chatgpt', {
        version: 'test', leaseTimeoutMs: 80, leaseCheckIntervalMs: 25
    }));
    assert.equal(Object.hasOwn(result, 'url'), false);
    await waitUntil(() => dom.window.document.querySelector('#message').getAttribute('dir') === 'rtl');
    assert.equal(dom.window.document.querySelector('#message').getAttribute('dir'), 'rtl');
    leaseClock += 81;
    await waitUntil(() => dom.window.__RASTCHIN_DESKTOP__ === undefined);
    assert.equal(dom.window.__RASTCHIN_DESKTOP__, undefined);
    assert.equal(dom.window.document.querySelector('#message').getAttribute('dir'), null);
    dom.window.close();
});

test('ChatGPT payload applies RTL, fonts the response, directs composer, and restores', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div data-message-author-role="assistant"><p id="message">این یک پیام فارسی است.</p><ul><li id="item">مرحله اول</li></ul></div>
        <form data-type="unified-composer"><div id="composer" contenteditable="true" dir="auto" style="text-align: start">پیام test</div></form>
    </body></html>`, {
        url: 'https://chatgpt.com/', runScripts: 'outside-only', pretendToBeVisual: true
    });
    const result = dom.window.eval(buildInjection('chatgpt', { version: 'test' }));
    assert.equal(result.applied, true);
    await wait();
    assert.equal(dom.window.document.querySelector('#message').getAttribute('dir'), 'rtl');
    assert.equal(dom.window.document.querySelector('#item').getAttribute('dir'), 'rtl');
    assert.equal(dom.window.document.querySelector('#composer').getAttribute('dir'), 'rtl');
    assert.match(dom.window.document.head.textContent, /Vazirmatn/);
    const cleanup = dom.window.eval(buildCleanupExpression());
    assert.equal(cleanup.removed, true);
    assert.equal(dom.window.document.querySelector('#message').getAttribute('dir'), null);
    assert.equal(dom.window.document.querySelector('#composer').getAttribute('dir'), 'auto');
    assert.equal(dom.window.document.querySelector('#composer').style.textAlign, 'start');
    dom.window.close();
});

test('Codex composer turns RTL for pasted Persian even when English appears first', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="root"><main><p>Conversation</p>
            <form data-type="unified-composer">
                <div id="composer" contenteditable="true"><p id="editor-line">Use the terminal command.</p></div>
            </form>
        </main></div>
    </body></html>`, {
        url: 'file:///C:/Program%20Files/WindowsApps/OpenAI.Codex/app/resources/app.asar/webview/index.html',
        runScripts: 'outside-only', pretendToBeVisual: true
    });

    dom.window.eval(buildInjection('chatgpt', { version: 'test' }));
    await wait();

    const document = dom.window.document;
    const composer = document.querySelector('#composer');
    const line = document.querySelector('#editor-line');
    assert.equal(composer.getAttribute('dir'), 'ltr');

    const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
        value: { getData: type => type === 'text/plain' ? 'English و یک متن فارسی' : '' }
    });
    line.dispatchEvent(paste);
    assert.equal(composer.getAttribute('dir'), 'rtl');
    assert.equal(composer.style.getPropertyPriority('direction'), 'important');

    // Simulate a controlled editor committing the clipboard after its paste
    // handler without dispatching another useful input event.
    line.textContent = 'Use the terminal command and سپس نتیجه را بررسی کن.';
    await waitUntil(() => composer.getAttribute('dir') === 'rtl');
    assert.equal(composer.style.textAlign, 'right');

    line.textContent = 'Use the terminal command and report the result.';
    await waitUntil(() => composer.getAttribute('dir') === 'ltr');
    assert.equal(composer.style.direction, '');
    assert.equal(composer.style.textAlign, '');

    dom.window.eval(buildCleanupExpression());
    dom.window.close();
});

test('Codex request question styles its Persian title and choices without breaking English labels', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="root">
            <div data-codex-composer-request-navigation="true" id="question-card">
                <div id="question-title">کدام حالت را برای فایل <code>src/patcher.js</code> و لینک <a href="https://example.com/docs">https://example.com/docs</a> انتخاب می‌کنید؟</div>
                <div role="radiogroup">
                    <button role="radio" id="choice">
                        <span id="number">1</span>
                        <div>
                            <div id="choice-label">Balanced Mix</div>
                            <div id="choice-description">برای بررسی Persian و English، دستور npm test اجرا می‌شود.</div>
                        </div>
                        <span id="recommended">Recommended</span>
                    </button>
                </div>
                <textarea id="answer" placeholder="No, and tell ChatGPT what to do differently"></textarea>
                <button id="skip">Skip</button>
            </div>
        </div>
    </body></html>`, {
        url: 'file:///C:/Program%20Files/WindowsApps/OpenAI.Codex/app/resources/app.asar/webview/index.html',
        runScripts: 'outside-only', pretendToBeVisual: true
    });

    dom.window.eval(buildInjection('chatgpt', { version: 'test' }));
    await wait();

    const document = dom.window.document;
    assert.equal(document.querySelector('#question-title').getAttribute('dir'), 'rtl');
    assert.match(document.querySelector('#question-title').className, /rastchin-codex-question-rtl/);
    assert.equal(document.querySelector('#choice').getAttribute('dir'), 'rtl');
    assert.match(document.querySelector('#choice').className, /rastchin-codex-question-option-rtl/);
    assert.equal(document.querySelector('#choice-label').getAttribute('dir'), 'ltr');
    assert.equal(document.querySelector('#choice-description').getAttribute('dir'), 'rtl');
    assert.equal(document.querySelector('#recommended').getAttribute('dir'), 'ltr');
    assert.equal(document.querySelector('#number').getAttribute('dir'), null);
    assert.notEqual(document.querySelector('#answer').getAttribute('dir'), 'rtl');
    assert.equal(document.querySelector('#skip').getAttribute('dir'), null);
    assert.match(document.querySelector('[data-rastchin-codex-question-style]').textContent, /Vazirmatn/);

    const cleanup = dom.window.eval(buildCleanupExpression());
    assert.equal(cleanup.removed, true);
    assert.equal(document.querySelector('#question-title').getAttribute('dir'), null);
    assert.equal(document.querySelector('#choice').getAttribute('dir'), null);
    assert.equal(document.querySelector('#choice-label').getAttribute('dir'), null);
    assert.equal(document.querySelector('[data-rastchin-codex-question-style]'), null);
    dom.window.close();
});

test('Codex question role fallback styles a streamed Persian choice', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="approval">
            <div id="fallback-title">کدام گزینه را انتخاب می‌کنید؟</div>
            <div role="radiogroup" id="group">
                <button role="radio" id="first"><span>گزینه اول</span></button>
            </div>
        </div>
    </body></html>`, {
        url: 'file:///C:/Program%20Files/WindowsApps/OpenAI.Codex/app/resources/app.asar/webview/index.html',
        runScripts: 'outside-only', pretendToBeVisual: true
    });

    dom.window.eval(buildInjection('chatgpt', { version: 'test' }));
    await wait();
    const document = dom.window.document;
    assert.equal(document.querySelector('#fallback-title').getAttribute('dir'), 'rtl');
    assert.equal(document.querySelector('#first').getAttribute('dir'), 'rtl');

    const streamed = document.createElement('button');
    streamed.id = 'streamed';
    streamed.setAttribute('role', 'radio');
    streamed.innerHTML = '<span>npm test را ابتدا اجرا کنید.</span>';
    document.querySelector('#group').appendChild(streamed);
    await wait();
    assert.equal(streamed.getAttribute('dir'), 'rtl');
    assert.match(streamed.className, /rastchin-codex-question-option-rtl/);

    streamed.innerHTML = '<span id="english-update">Run npm test first.</span>';
    await wait();
    assert.equal(streamed.getAttribute('dir'), null);
    assert.doesNotMatch(streamed.className, /rastchin-codex-question-option-rtl/);
    assert.equal(document.querySelector('#english-update').getAttribute('dir'), null);

    dom.window.eval(buildCleanupExpression());
    dom.window.close();
});

test('Claude payload keeps code LTR while applying Persian response direction', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <article class="font-claude-response"><p id="message">این یک پاسخ فارسی است.</p><pre><code id="code">npm test</code></pre></article>
    </body></html>`, {
        url: 'https://claude.ai/', runScripts: 'outside-only', pretendToBeVisual: true
    });
    const result = dom.window.eval(buildInjection('claude', { version: 'test' }));
    assert.equal(result.applied, true);
    await wait();
    assert.equal(dom.window.document.querySelector('#message').getAttribute('dir'), 'rtl');
    assert.notEqual(dom.window.document.querySelector('#code').getAttribute('dir'), 'rtl');
    dom.window.eval(buildCleanupExpression());
    dom.window.close();
});
