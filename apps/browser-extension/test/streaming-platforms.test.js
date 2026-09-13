'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { El, el, t, makeEngine } = require('./engine-harness');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const manifest = require('../manifest.json');
const textOf = node => node.nodeType === 3 ? node.textContent : node.childNodes.map(textOf).join('');

for (const platform of ['twitch', 'kick']) {
    let recipe;
    const listeners = new Set();
    const context = {
        chrome: { runtime: { getURL: value => value } },
        document: {
            addEventListener(type, fn) { assert.equal(type, 'input'); listeners.add(fn); },
            removeEventListener(type, fn) { listeners.delete(fn); }
        },
        RastChinRecipe: { runPlatformRecipe(value) { recipe = value; } }
    };
    vm.createContext(context);
    vm.runInContext(source('core/streaming-text.js'), context);
    vm.runInContext(source(`platforms/${platform}-rtl.js`), context);
    const engine = makeEngine(recipe);
    const twitch = platform === 'twitch';
    const message = text => el('span', twitch
        ? { attrs: { 'data-a-target': 'chat-line-message-body', dir: 'auto' } }
        : { cls: 'leading-[1.55] font-normal' }, t(text));
    const persian = message('سلام به همه! نسخه v1.2 و https://example.com را ببینید.');
    const english = message('Hello everyone, including فارسی speakers!');
    const short = message('نه');
    const neutral = message('123.45 🎮');
    const username = el('button', {}, t('کاربر فارسی'));
    const emote = el('span', { attrs: { 'data-emote-id': 'test' } }, el('img', { attrs: { alt: 'سلام' } }));
    const link = el('a', { attrs: { href: 'https://example.com' } }, t('https://example.com'));
    const code = el('code', {}, t('const label = "سلام";'));
    persian.append(emote, link, code);
    const row = el('div', { attrs: { 'data-index': '0' } }, username, persian, english, short, neutral);
    const list = el('div', { attrs: { id: twitch ? 'live-page-chat' : 'chatroom-messages' } }, row);
    const composerText = t('سلام به همه');
    const composerChild = el('p', {}, composerText);
    const composer = el('div', { attrs: {
        [twitch ? 'data-a-target' : 'data-testid']: 'chat-input', contenteditable: 'true', role: 'textbox'
    } }, composerChild);
    Object.defineProperty(composer, 'textContent', { get: () => textOf(composer) });
    const title = el('span', { attrs: { [twitch ? 'data-a-target' : 'data-testid']: twitch ? 'stream-title' : 'livestream-title' } }, t('عنوان فارسی پخش زنده'));
    const root = el('div', { attrs: { id: twitch ? 'page' : 'channel-chatroom' } }, list, composer, title);
    const originalChildren = [...persian.childNodes];
    const originalText = textOf(root);
    const scan = node => {
        const candidates = new Set();
        engine.collectCandidates(node, candidates);
        candidates.forEach(candidate => engine.applyToMessage(candidate));
    };
    scan(root);
    assert.equal(persian.getAttribute('dir'), 'rtl', `${platform}: Persian message`);
    assert.equal(persian.style.textAlign, 'right');
    assert.equal(short.getAttribute('dir'), 'rtl', 'short Persian messages are supported');
    assert.equal(english.getAttribute('dir'), twitch ? 'auto' : null);
    assert.equal(neutral.getAttribute('dir'), twitch ? 'auto' : null);
    assert.equal(title.getAttribute('dir'), 'rtl');
    assert.equal(composer.getAttribute('dir'), 'rtl');
    assert.equal(composerChild.getAttribute('dir'), null, 'editor descendants are never rewritten');
    for (const node of [username, list, row, emote, link, code]) assert.equal(node.getAttribute('dir'), null, 'metadata/control DOM is untouched');
    assert.deepEqual(persian.childNodes, originalChildren, 'text/link/emote identity is preserved');
    assert.equal(textOf(root), originalText, 'exact content is preserved');
    assert.equal(recipe.inlineIsolate, false, 'no text wrapping in live chat');

    const snapshots = engine.styledElements.size;
    scan(root);
    assert.equal(engine.styledElements.size, snapshots, 'rescans reuse snapshots');
    persian.childNodes[0].textContent = 'English replacement';
    scan(persian);
    assert.equal(persian.getAttribute('dir'), twitch ? 'auto' : null, 'recycled row restores native direction');
    persian.childNodes[0].textContent = '@someone https://example.com سلام دوباره';
    scan(persian.childNodes[0].parentElement);
    assert.equal(persian.getAttribute('dir'), 'rtl', 'leading mention and URL do not force LTR');
    persian.childNodes[0].textContent = '';
    scan(persian);
    assert.equal(persian.getAttribute('dir'), twitch ? 'auto' : null, 'emote/URL/code only message is native');

    const added = message('این پیام تازه رسیده است.');
    row.append(added);
    scan(added);
    assert.equal(added.getAttribute('dir'), 'rtl', 'new chat arrivals are discovered');
    const scheduled = [];
    engine.scheduleScan = node => scheduled.push(node);
    recipe.onEnable(engine);
    recipe.onEnable(engine);
    assert.equal(listeners.size, 1, 'input listener does not accumulate');
    [...listeners][0]({ target: composerChild });
    assert.equal(scheduled.at(-1), composer);
    composerText.textContent = 'English draft';
    scan(composer);
    assert.equal(composer.getAttribute('dir'), null, 'composer can switch to English');
    composerText.textContent = '';
    scan(composer);
    assert.equal(composer.getAttribute('dir'), null, 'cleared composer restores native state');

    for (const guard of ['button', 'nav', 'code', 'video']) {
        const guarded = message('متن فارسی محافظت‌شده');
        row.append(el(guard, {}, guarded));
        scan(guarded);
        assert.equal(guarded.getAttribute('dir'), twitch ? 'auto' : null, `${guard} is excluded`);
    }
    const unrelated = el('span', { cls: 'font-normal' }, t('متن خارج از چت'));
    const unknown = el('div', { attrs: { contenteditable: 'true' } }, message('ویرایشگر ناشناخته'));
    root.append(unrelated, unknown);
    scan(root);
    assert.equal(unrelated.getAttribute('dir'), null, 'generic text is not a candidate');
    assert.equal(unknown.childNodes[0].getAttribute('dir'), twitch ? 'auto' : null);
    engine.restoreStyles();
    recipe.onDisable();
    assert.equal(listeners.size, 0);
    assert.equal(added.getAttribute('dir'), twitch ? 'auto' : null);
    assert.equal(title.getAttribute('dir'), null);
    assert.equal(title.classList.contains(recipe.rtlClass), false);
    assert.equal(engine.styledElements.size, 0);

    const entry = manifest.content_scripts.find(item => item.js.includes(`src/platforms/${platform}-rtl.js`));
    assert.ok(entry);
    assert.equal(entry.js.includes('src/core/font-inject.js'), false, 'no page-wide font mutation');
    assert.equal(entry.js.includes('src/core/auto-direction.js'), false, 'no generic editor mutation');
    assert.ok(entry.js.indexOf('src/core/streaming-text.js') < entry.js.length - 1);
    assert.deepEqual(entry.matches, Array.from(recipe.hosts, host => `https://${host}/*`));
    assert.equal(entry.all_frames, undefined, 'third-party player overlays are not injected');
    for (const host of recipe.hosts) {
        assert.ok(manifest.web_accessible_resources.some(item => item.matches.includes(`https://${host}/*`)));
    }
    console.log(`ALL PASS (${platform}: direction, live updates, guards, identity, composer, restore, manifest)`);
}
