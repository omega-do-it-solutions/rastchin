const assert = require('node:assert/strict');
const test = require('node:test');

const { JSDOM } = require('jsdom');
const injections = require('../src/injections');

function createTranscript(builder, className) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">
    <div class="${className}" data-local-conversation-final-assistant>
      <p id="status"></p><p id="answer">پاسخ قبلی باید در گفت‌وگو بماند.</p>
    </div><div data-codex-composer><textarea>پیام بعدی</textarea></div>
    </div></body></html>`, { runScripts: 'outside-only' });
  const { window } = dom;
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
  const status = window.document.querySelector('#status');
  // Renderers retain references to these Text nodes across commits. The
  // spinner forces a distinct text child, as in a pending image/tool result.
  const text = window.document.createTextNode('در حال ساخت تصویر → نتیجه نهایی');
  const spinner = window.document.createElement('span');
  spinner.setAttribute('aria-label', 'Loading');
  status.append(text, spinner);
  const runtime = builder().replace(/<\/?script[^>]*>/g, '');
  window.eval(runtime);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, status, text, spinner };
}

for (const [name, builder, className] of [
  ['Codex', injections.buildCodexJs, '_MarkdownRoot_fixture'],
  ['Claude', injections.buildClaudeJs, 'timelineMessage_fixture'],
]) {
  test(`${name}: image completion can remove the renderer-owned status text`, async (t) => {
    const h = createTranscript(builder, className);
    t.after(() => h.window.close());
    assert.equal(h.status.getAttribute('dir'), 'rtl', 'Persian status must still be styled');
    assert.equal(h.text.parentNode, h.status, 'RTL must preserve the renderer text reference');
    assert.doesNotThrow(() => h.status.removeChild(h.text), 'image completion must not throw NotFoundError');
    h.status.removeChild(h.spinner);
    const image = h.window.document.createElement('img');
    image.alt = 'تصویر تولیدشده';
    image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    h.status.appendChild(image);
    await new Promise((resolve) => h.window.setTimeout(resolve, 20));
    assert.equal(image.parentNode, h.status);
    assert.equal(h.window.document.querySelector('#answer').isConnected, true);
    assert.equal(h.window.document.querySelector('textarea').value, 'پیام بعدی');
  });

  test(`${name}: streamed prose updates the original text node beside an image`, async (t) => {
    const h = createTranscript(builder, className);
    t.after(() => h.window.close());
    const image = h.window.document.createElement('img');
    h.status.appendChild(image);
    h.text.nodeValue = 'تصویر آماده شد → ادامه گفت‌وگو';
    await new Promise((resolve) => h.window.setTimeout(resolve, 20));
    assert.equal(h.text.isConnected, true, 'streaming must still write into the visible text');
    assert.equal(h.status.textContent, 'تصویر آماده شد → ادامه گفت‌وگو');
    assert.equal(image.parentNode, h.status, 'image identity must remain intact');
    assert.equal(h.status.getAttribute('dir'), 'rtl');
    assert.equal(h.status.querySelector('.bidi-arrow-mirror-clean'), null, 'RTL must not splice host text');
  });
}
