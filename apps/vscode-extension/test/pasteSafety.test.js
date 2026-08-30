const assert = require('node:assert/strict');
const test = require('node:test');

const { JSDOM } = require('jsdom');
const injections = require('../src/injections');

function runtimeFrom(builder) {
  return builder()
    .replace(/<script[^>]*>/g, '')
    .replace(/<\/script>/g, '')
    .replace(/^\/\*.*\*\/$/gm, '');
}

function boot(runtime, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  const { window } = dom;
  const raf = (callback) => setTimeout(callback, 0);
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, window.MutationObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, document: window.document };
}

function textNodeContaining(document, root, needle) {
  const walker = document.createTreeWalker(root, document.defaultView.NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if ((node.nodeValue || '').includes(needle)) return node;
  }
  return null;
}

async function pasteRichMessage(runtime, bodyHtml, fieldSelector) {
  const { window, document } = boot(runtime, bodyHtml);
  const field = document.querySelector(fieldSelector);
  field.focus();
  field.dispatchEvent(new window.Event('paste', { bubbles: true }));
  field.innerHTML = [
    '<p>این یک پاراگراف فارسی برای آزمایش است.</p>',
    '<ul><li>مرحله اول → مرحله بعدی</li><li>اجرای <code>npm test</code></li></ul>',
    '<pre><code>function test() { return true; }</code></pre>',
    '<p>آدرس https://rastchin.tools/ را بررسی کن.</p>',
  ].join('');

  const caretNode = textNodeContaining(document, field, 'مرحله اول');
  assert.ok(caretNode, 'fixture must contain the caret text node');
  const range = document.createRange();
  range.setStart(caretNode, 3);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  return { document, field, caretNode, selection };
}

test('Codex rich paste keeps the editor-owned DOM and caret intact', async () => {
  const result = await pasteRichMessage(
    runtimeFrom(injections.buildCodexJs),
    '<div id="root"><div data-codex-composer><div data-id="field" contenteditable="true" tabindex="0"></div></div></div>',
    '[data-id="field"]',
  );

  assert.equal(result.document.querySelector('.bidi-arrow-mirror-clean'), null, 'RTL styling must not wrap or replace composer text nodes');
  assert.equal(result.caretNode.isConnected, true, 'the node holding the caret must stay connected');
  assert.equal(result.selection.anchorNode, result.caretNode, 'the agent editor selection must remain on its original node');
  assert.equal(result.field.getAttribute('dir'), 'rtl');
});

test('Claude rich paste keeps the editor-owned DOM and caret intact', async () => {
  const result = await pasteRichMessage(
    runtimeFrom(injections.buildClaudeJs),
    '<div id="root"><div class="messageInput_abc" data-id="field" contenteditable="true" tabindex="0"></div></div>',
    '[data-id="field"]',
  );

  assert.equal(result.document.querySelector('.bidi-arrow-mirror-clean'), null, 'RTL styling must not wrap or replace composer text nodes');
  assert.equal(result.caretNode.isConnected, true);
  assert.equal(result.selection.anchorNode, result.caretNode);
  assert.equal(result.field.getAttribute('dir'), 'rtl');
});

test('Codex mixed draft direction changes without replacing the caret node', async () => {
  const { window, document } = boot(
    runtimeFrom(injections.buildCodexJs),
    '<div id="root"><div data-codex-composer><div data-id="field" contenteditable="true">Every thing is ok پیام فارسی تست در پرامپت</div></div></div>',
  );
  const field = document.querySelector('[data-id="field"]');
  const caretNode = field.firstChild;
  const range = document.createRange();
  range.setStart(caretNode, 5);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(field.getAttribute('dir'), 'ltr');
  assert.equal(field.classList.contains('YBYrtlClean'), false, 'CSS must not override the LTR direction attribute');
  assert.equal(field.classList.contains('fa-ltr-clean'), true);
  assert.equal(caretNode.isConnected, true);
  assert.equal(selection.anchorNode, caretNode);
});
