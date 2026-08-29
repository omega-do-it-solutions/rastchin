const assert = require('node:assert/strict');
const test = require('node:test');

const { JSDOM } = require('jsdom');
const injections = require('../src/injections');
const { FORCE_RTL_CLASS, FORCE_LTR_CLASS } = require('../src/constants');

// Strips marker comments (and, for Plan Preview, the <script> wrapper) so the
// generated runtime can be executed directly inside a jsdom window.
function runtimeFrom(builder) {
  return builder()
    .replace(/<script[^>]*>/g, '')
    .replace(/<\/script>/g, '')
    .replace(/^\/\*.*\*\/$/gm, '');
}

function boot(runtime, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  const { window } = dom;
  const raf = (cb) => setTimeout(cb, 0);
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, window.MutationObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  // The real webview loads with `defer`; jsdom stays in readyState 'loading', so
  // fire DOMContentLoaded explicitly to run boot() and register the keydown hook.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { doc: window.document, window };
}

// Dispatches the real chord on the focused field. The runtime listens in the
// capture phase on `document`, so dispatching on the focused descendant reaches
// it; key/code/ctrlKey mirror Ctrl + RightShift / Ctrl + LeftShift.
function chord(window, code, opts = {}) {
  const target = window.document.activeElement || window.document.body;
  target.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: opts.key || 'Shift',
    code,
    ctrlKey: opts.ctrlKey !== undefined ? opts.ctrlKey : true,
    bubbles: true,
  }));
}

const codexRuntime = runtimeFrom(injections.buildCodexJs);
const claudeRuntime = runtimeFrom(injections.buildClaudeJs);
const planRuntime = runtimeFrom(injections.buildClaudePlanJs);

test('Codex shortcut: Ctrl+RightShift toggles force-rtl on the focused composer field', () => {
  const { doc, window } = boot(codexRuntime,
    `<div id="root"><div data-codex-composer><textarea data-id="ta">Run npm test</textarea></div></div>`);
  const ta = doc.querySelector('[data-id="ta"]');
  ta.focus();
  assert.equal(doc.activeElement, ta, 'textarea must be focusable in jsdom');

  chord(window, 'ShiftRight');
  assert.equal(ta.classList.contains(FORCE_RTL_CLASS), true, 'Ctrl+RightShift must add force-rtl');

  chord(window, 'ShiftRight');
  assert.equal(ta.classList.contains(FORCE_RTL_CLASS), false, 'pressing the same chord again must toggle force-rtl off');
});

test('Codex shortcut: Ctrl+LeftShift toggles force-ltr and is mutually exclusive with force-rtl', () => {
  const { doc, window } = boot(codexRuntime,
    `<div id="root"><div data-codex-composer><textarea data-id="ta">یک پیام فارسی</textarea></div></div>`);
  const ta = doc.querySelector('[data-id="ta"]');
  ta.focus();

  chord(window, 'ShiftRight');
  assert.equal(ta.classList.contains(FORCE_RTL_CLASS), true);

  // Switching to force-ltr must drop force-rtl (mutual exclusion).
  chord(window, 'ShiftLeft');
  assert.equal(ta.classList.contains(FORCE_RTL_CLASS), false, 'force-rtl must be cleared when force-ltr is set');
  assert.equal(ta.classList.contains(FORCE_LTR_CLASS), true, 'Ctrl+LeftShift must add force-ltr');

  chord(window, 'ShiftLeft');
  assert.equal(ta.classList.contains(FORCE_LTR_CLASS), false, 'pressing Ctrl+LeftShift again must toggle force-ltr off');
});

test('Codex shortcut: no focused composer is a no-op and never throws', () => {
  const { doc, window } = boot(codexRuntime,
    `<div id="root"><div data-id="outside" tabindex="0">plain text, not a composer</div></div>`);
  const outside = doc.querySelector('[data-id="outside"]');
  outside.focus();

  assert.doesNotThrow(() => chord(window, 'ShiftRight'));
  assert.equal(outside.classList.contains(FORCE_RTL_CLASS), false, 'a non-composer focus must not receive a force class');
  assert.equal(outside.classList.contains(FORCE_LTR_CLASS), false);
});

test('Codex shortcut: ignores chords without Ctrl or without Shift', () => {
  const { doc, window } = boot(codexRuntime,
    `<div id="root"><div data-codex-composer><textarea data-id="ta">Run npm test</textarea></div></div>`);
  const ta = doc.querySelector('[data-id="ta"]');
  ta.focus();

  // RightShift without Ctrl -> ignored.
  chord(window, 'ShiftRight', { ctrlKey: false });
  assert.equal(ta.classList.contains(FORCE_RTL_CLASS), false, 'Shift without Ctrl must be ignored');

  // Ctrl + a non-Shift key -> ignored.
  chord(window, 'KeyA', { key: 'a' });
  assert.equal(ta.classList.contains(FORCE_RTL_CLASS), false, 'Ctrl with a non-Shift key must be ignored');
});

test('Claude shortcut: Ctrl+RightShift / Ctrl+LeftShift toggle force-rtl/ltr on the messageInput composer', () => {
  const { doc, window } = boot(claudeRuntime,
    `<div id="root"><div class="messageInput_abc" data-id="composer" contenteditable="true" tabindex="0">type here</div></div>`);
  const composer = doc.querySelector('[data-id="composer"]');
  composer.focus();
  assert.equal(doc.activeElement, composer, 'messageInput composer must be focusable in jsdom');

  chord(window, 'ShiftRight');
  assert.equal(composer.classList.contains(FORCE_RTL_CLASS), true, 'Ctrl+RightShift must force-rtl the Claude composer');

  chord(window, 'ShiftLeft');
  assert.equal(composer.classList.contains(FORCE_RTL_CLASS), false, 'force-rtl must clear when switching to force-ltr');
  assert.equal(composer.classList.contains(FORCE_LTR_CLASS), true, 'Ctrl+LeftShift must force-ltr the Claude composer');
});

test('Claude Plan Preview: a shortcut with no composer focused does not throw', () => {
  // Plan Preview shares the runtime + keydown handler but renders no composer;
  // the no-composer guard must keep returning early instead of throwing.
  const { window } = boot(planRuntime, `<div id="content"><p>متن طرح برای پیش‌نمایش</p></div>`);
  assert.doesNotThrow(() => chord(window, 'ShiftRight'));
  assert.doesNotThrow(() => chord(window, 'ShiftLeft'));
});

test('Codex CSS exposes explicit force-rtl AND force-ltr composer rules', () => {
  const css = injections.buildCodexCss();
  assert.ok(css.includes('[data-codex-composer].' + FORCE_RTL_CLASS), 'force-rtl composer rule must exist');
  assert.ok(css.includes('[data-codex-composer].' + FORCE_LTR_CLASS), 'force-ltr composer rule must exist');
  // The force-rtl rule must not blanket-flip embedded code; commonScopedCss keeps
  // pre/code LTR, and the force-rtl rule targets only composer fields.
  assert.match(css, /#root pre,[\s\S]*?direction: ltr !important/, 'pre/code must still be forced LTR');
});

test('Claude CSS exposes explicit force-rtl AND force-ltr composer rules', () => {
  const css = injections.buildClaudeCss();
  assert.ok(css.includes('[class*="messageInput_"].' + FORCE_RTL_CLASS), 'force-rtl composer rule must exist');
  assert.ok(css.includes('[class*="messageInput_"].' + FORCE_LTR_CLASS), 'force-ltr composer rule must exist');
});
